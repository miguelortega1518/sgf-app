// Retrospectiva automática de un sprint (sprints.summary, versión 1). Función pura:
// la ruta de cierre (PATCH /api/sprints/[id]) carga los datos dentro de su
// transacción y guarda el resultado en el mismo update que cierra el sprint.

import { countBusinessDays } from '@/lib/business-days';
import { toDateRD } from '@/lib/date-utils';
import { blockersByArea, cycleSummary, type MetricTask } from '@/lib/metrics';
import { startedAt, type StatusSegment } from '@/lib/status-history';
import { lastEntryInto, type SprintChangeEvent } from '@/lib/sprint-history';

const DAY = 86_400_000;

export type SprintSummaryCount = { tasks: number; points: number };

export type SprintSummaryPerson = {
  personId: string;
  name: string;
  committedTasks: number;
  committedPoints: number;
  completedTasks: number;
  completedPoints: number;
};

export type SprintSummaryCycle = {
  basis: 'cycle';
  unit: 'business' | 'calendar';
  count: number;
  median: number | null;
  p85: number | null;
  withoutStart: number;
};

export type SprintSummary = {
  version: 1;
  /** Fecha RD del cierre. */
  closedOn: string;
  businessDaysOnly: boolean;
  committed: SprintSummaryCount;
  completed: SprintSummaryCount;
  carriedOver: SprintSummaryCount & { to: { sprintId: string | null; name: string } };
  addedMidSprint: SprintSummaryCount;
  blockersByArea: { area: string; count: number }[];
  cycleTime: SprintSummaryCycle;
  byPerson: SprintSummaryPerson[];
};

/** Tarea del alcance del sprint (no archivada) en el momento del cierre. */
export type SummaryTask = {
  id: string;
  status: string;
  estimate: number | null;
  responsibleId: string;
  responsibleName: string;
  blockedByArea: string | null;
  createdAt: Date;
  completedAt: Date | null;
};

export type SprintSummaryInput = {
  sprint: { id: string; name: string; startDate: string; startedAt: Date | null };
  scope: SummaryTask[];
  carryTarget: { sprintId: string | null; name: string };
  /** Eventos task_sprint_changed por tarea (ver sprint-history.ts). */
  sprintEvents: Map<string, SprintChangeEvent[]>;
  /** Historial de estados por tarea (buildStatusHistory). */
  statusHistories: Map<string, StatusSegment[]>;
  businessDaysOnly: boolean;
  holidays: Set<string>;
  /** todayRD() en el momento del cierre. */
  closedOn: string;
};

function tally(tasks: SummaryTask[]): SprintSummaryCount {
  return { tasks: tasks.length, points: tasks.reduce((sum, t) => sum + (t.estimate ?? 0), 0) };
}

/**
 * ¿La tarea entró en el sprint después de iniciarse? Cuenta su ÚLTIMA entrada.
 * Sin `startedAt` (sprints iniciados antes de guardarlo) se compara la fecha RD
 * de la entrada con `startDate`.
 */
function isAddedMidSprint(events: SprintChangeEvent[], sprint: SprintSummaryInput['sprint']): boolean {
  const entry = lastEntryInto(events, sprint);
  if (!entry) return false;
  if (sprint.startedAt) return entry.getTime() > sprint.startedAt.getTime();
  return toDateRD(entry) > sprint.startDate;
}

export function buildSprintSummary(input: SprintSummaryInput): SprintSummary {
  const { sprint, scope, sprintEvents, statusHistories, businessDaysOnly, holidays } = input;

  const added = new Set(
    scope.filter(t => isAddedMidSprint(sprintEvents.get(t.id) ?? [], sprint)).map(t => t.id),
  );
  const committed = scope.filter(t => !added.has(t.id));
  const completed = scope.filter(t => t.status === 'completada');
  const carried = scope.filter(t => t.status !== 'completada');

  // blockersByArea sólo lee status y blockedByArea.
  const blockers = blockersByArea(
    scope.map(t => ({ status: t.status, blockedByArea: t.blockedByArea }) as MetricTask),
  );

  // Ciclo: del primer inicio (o de la creación, en withoutStart) al cierre.
  let withoutStart = 0;
  const days: number[] = [];
  for (const t of completed) {
    if (!t.completedAt) continue;
    const start = startedAt(statusHistories.get(t.id) ?? []);
    if (!start) withoutStart += 1;
    const from = start ?? t.createdAt;
    days.push(businessDaysOnly
      ? countBusinessDays(toDateRD(from), toDateRD(t.completedAt), holidays)
      : Math.max(0, (t.completedAt.getTime() - from.getTime()) / DAY));
  }

  const people = new Map<string, SprintSummaryPerson>();
  for (const t of scope) {
    const row = people.get(t.responsibleId) ?? {
      personId: t.responsibleId,
      name: t.responsibleName,
      committedTasks: 0,
      committedPoints: 0,
      completedTasks: 0,
      completedPoints: 0,
    };
    if (!added.has(t.id)) {
      row.committedTasks += 1;
      row.committedPoints += t.estimate ?? 0;
    }
    if (t.status === 'completada') {
      row.completedTasks += 1;
      row.completedPoints += t.estimate ?? 0;
    }
    people.set(t.responsibleId, row);
  }

  return {
    version: 1,
    closedOn: input.closedOn,
    businessDaysOnly,
    committed: tally(committed),
    completed: tally(completed),
    carriedOver: { ...tally(carried), to: input.carryTarget },
    addedMidSprint: tally(scope.filter(t => added.has(t.id))),
    blockersByArea: blockers,
    cycleTime: {
      basis: 'cycle',
      unit: businessDaysOnly ? 'business' : 'calendar',
      ...cycleSummary(days),
      withoutStart,
    },
    byPerson: [...people.values()].sort((a, b) => a.name.localeCompare(b.name, 'es')),
  };
}

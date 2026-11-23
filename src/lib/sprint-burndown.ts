// Burndown de un sprint (activo o cerrado) reconstruido con el historial de
// pertenencia (task_sprint_changed, sprint-history.ts) y de estados
// (status_changed, flow-metrics.ts). Función pura: la carga de datos está en
// src/app/api/sprints/[id]/burndown/route.ts.

import { isBusinessDay } from '@/lib/business-days';
import { shiftDateRD } from '@/lib/date-utils';
import { rdDayEnd, rdDayStart, reconcileHistory, statusAt } from '@/lib/flow-metrics';
import { isEntryInto, isExitFrom, isInSprintAt, sprintMembership, type SprintChangeEvent } from '@/lib/sprint-history';
import { buildStatusHistory, type StatusSegment } from '@/lib/status-history';

/**
 * Margen antes de `closedAt` (sprints.updated_at) para evaluar la pertenencia en
 * un sprint cerrado. La auditoría del arrastre usa el now() de Postgres (inicio de
 * la transacción) y updated_at la hora de la app: con este margen las salidas del
 * cierre no bajan la línea.
 */
export const CLOSE_GRACE_MS = 60_000;

export type BurndownTask = {
  id: string;
  status: string;
  estimate: number | null;
  createdAt: Date;
  completedAt: Date | null;
  sprintId: string | null;
};

export type BurndownSprint = {
  id: string;
  name: string;
  status: 'activo' | 'cerrado';
  startDate: string;
  endDate: string;
  startedAt: Date | null;
  /** Sólo en cerrados: sprints.updated_at, congelado desde el cierre. */
  closedAt: Date | null;
};

export type SprintBurndownInput = {
  sprint: BurndownSprint;
  /** Tareas no archivadas del proyecto (las que no son candidatas se ignoran). */
  tasks: BurndownTask[];
  /** Eventos task_sprint_changed por tarea. */
  sprintEvents: Map<string, SprintChangeEvent[]>;
  /** Historial de estados por tarea (buildStatusHistory). */
  statusHistories: Map<string, StatusSegment[]>;
  businessDaysOnly: boolean;
  holidays: Set<string>;
  now: Date;
};

export type BurndownEntry = {
  date: string;
  kind: 'start' | 'day';
  /** null en los días futuros del sprint activo. */
  remaining: number | null;
  scope: number | null;
  ideal: number;
};

export type SprintBurndown = {
  unit: 'points' | 'tasks';
  businessDaysOnly: boolean;
  startDate: string;
  endDate: string;
  entries: BurndownEntry[];
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Días naturales de [startDate, endDate]; con businessDaysOnly, sólo los hábiles RD (si queda alguno). */
export function burndownDays(startDate: string, endDate: string, businessDaysOnly: boolean, holidays: Set<string>): string[] {
  const all: string[] = [];
  // Fechas 'YYYY-MM-DD': la comparación de cadenas vale.
  for (let d = startDate; d <= endDate; d = shiftDateRD(d, 1)) all.push(d);
  if (!businessDaysOnly) return all;
  const business = all.filter(d => isBusinessDay(d, holidays));
  return business.length > 0 ? business : all;
}

/** ¿La tarea puede aparecer en el burndown? Está ahora en el sprint o tiene alguna entrada o salida de él. */
export function isBurndownCandidate(
  task: { sprintId: string | null }, events: SprintChangeEvent[], sprint: { id: string; name: string },
): boolean {
  return task.sprintId === sprint.id || events.some(e => isEntryInto(e, sprint) || isExitFrom(e, sprint));
}

const minDate = (a: Date, b: Date | null) => (b && b.getTime() < a.getTime() ? b : a);

export function buildSprintBurndown(input: SprintBurndownInput): SprintBurndown {
  const { sprint, tasks, sprintEvents, statusHistories, businessDaysOnly, holidays, now } = input;
  const isClosed = sprint.status === 'cerrado';

  // 1. Candidatas.
  const candidates = tasks
    .filter(t => isBurndownCandidate(t, sprintEvents.get(t.id) ?? [], sprint))
    .map(t => ({
      task: t,
      membership: sprintMembership(sprintEvents.get(t.id) ?? [], sprint, t.sprintId === sprint.id),
      history: reconcileHistory(t, statusHistories.get(t.id) ?? buildStatusHistory(t, [])),
    }));

  // 2. Unidad: puntos si alguna candidata está estimada; si no, una por tarea.
  const unit = candidates.some(c => (c.task.estimate ?? 0) > 0) ? 'points' : 'tasks';
  const weight = (t: BurndownTask) => (unit === 'points' ? Math.max(0, t.estimate ?? 0) : 1);

  // 3. Días.
  const days = burndownDays(sprint.startDate, sprint.endDate, businessDaysOnly, holidays);

  // 4. Cortes: en el activo, limitados por `now`; en el cerrado, por `closedAt`.
  const limit = isClosed ? sprint.closedAt : now;
  const membershipLimit = isClosed && sprint.closedAt ? new Date(sprint.closedAt.getTime() - CLOSE_GRACE_MS) : limit;

  const measure = (cut: Date) => {
    const memberAt = minDate(cut, membershipLimit);
    const statusCut = minDate(cut, limit);
    let scope = 0;
    let remaining = 0;
    for (const c of candidates) {
      if (!isInSprintAt(c.membership, memberAt)) continue;
      const status = statusAt(c.history, statusCut);
      if (status === null) continue;
      const w = weight(c.task);
      scope += w;
      if (status !== 'completada') remaining += w;
    }
    return { scope, remaining };
  };

  const start = measure(sprint.startedAt ?? rdDayStart(sprint.startDate));
  const n = days.length;
  const ideal = (i: number) => (i >= n ? 0 : round1(start.scope * (1 - i / n)));

  const entries: BurndownEntry[] = [
    { date: sprint.startDate, kind: 'start', remaining: start.remaining, scope: start.scope, ideal: ideal(0) },
  ];
  days.forEach((date, idx) => {
    const i = idx + 1;
    if (!isClosed && rdDayStart(date).getTime() > now.getTime()) {
      entries.push({ date, kind: 'day', remaining: null, scope: null, ideal: ideal(i) });
      return;
    }
    const { scope, remaining } = measure(rdDayEnd(date));
    entries.push({ date, kind: 'day', remaining, scope, ideal: ideal(i) });
  });

  return { unit, businessDaysOnly, startDate: sprint.startDate, endDate: sprint.endDate, entries };
}

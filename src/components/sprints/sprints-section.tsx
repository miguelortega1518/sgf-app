'use client';

import { useState } from 'react';
import { formatDateRD } from '@/lib/date-utils';
import { SPRINT_STATUS_CHIP, SPRINT_STATUS_LABEL, STATUS_CHIP, STATUS_LABEL, taskKey, type TaskStatus } from '@/lib/labels';
import { groupTasksBySprint, nextPlannedSprint, type SprintStatus } from '@/lib/sprints';
import type { CapacityRow } from '@/lib/sprint-capacity';
import type { SprintSummary } from '@/lib/sprint-summary';
import { NewSprintForm, type NewSprintPayload } from './new-sprint-form';
import { SprintCapacityTable } from './sprint-capacity-table';
import { CloseSprintDialog } from './close-sprint-dialog';
import { SprintSummaryView } from './sprint-summary-view';
import { BusinessDaysToggle } from './business-days-toggle';
import { ForecastSummary, type ForecastSummaryProps } from '@/components/forecast/forecast-summary';

export type SprintSectionSprint = {
  id: string;
  name: string;
  goal: string | null;
  status: SprintStatus;
  startDate: string;
  endDate: string;
  /** Desempate de nextPlannedSprint; si falta, se usa startDate. */
  createdAt?: string;
  /** Sólo en planificados y activos (GET /api/spaces/[id]/sprints). */
  capacity?: CapacityRow[];
  /** Sólo en cerrados; null si se cerró antes de la retrospectiva automática. */
  summary?: SprintSummary | null;
};

export type SprintSectionTask = {
  id: string;
  number: number;
  title: string;
  status: string;
  estimate: number | null;
  sprintId: string | null;
};

export type SprintsSectionProps = {
  tasks: SprintSectionTask[];
  sprints: SprintSectionSprint[];
  canEdit: boolean;
  defaultDates: { startDate: string; endDate: string };
  onMoveTask: (taskId: string, sprintId: string | null) => void;
  onStartSprint: (sprintId: string) => void;
  /** carryOverTo: id del sprint destino de las pendientes o 'backlog'. */
  onCloseSprint: (sprintId: string, carryOverTo: string) => void;
  /** Devolver false (p. ej. si la API rechaza el alta) conserva los datos del formulario. */
  onCreateSprint: (payload: NewSprintPayload) => boolean | void | Promise<boolean | void>;
  /** points null = volver a la capacidad por defecto. */
  onSaveCapacity: (sprintId: string, personId: string, points: number | null) => void;
  /** Ajuste del proyecto «Contar sólo días hábiles (RD)». */
  businessDaysOnly: boolean;
  onToggleBusinessDays: (businessDaysOnly: boolean) => void;
  /** Pronóstico del sprint activo; si no llega, no se pinta nada. */
  activeForecast?: ForecastSummaryProps;
};

const BACKLOG_VALUE = 'backlog';

function countLabel(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

function Totals({ tasks, estimateTotal }: { tasks: SprintSectionTask[]; estimateTotal: number }) {
  return (
    <span className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
      <span>{countLabel(tasks.length, 'tarea', 'tareas')}</span>
      <span aria-hidden="true">·</span>
      <span>{countLabel(estimateTotal, 'punto', 'puntos')}</span>
    </span>
  );
}

function TaskRow({
  task, targets, canEdit, onMoveTask,
}: {
  task: SprintSectionTask;
  targets: SprintSectionSprint[];
  canEdit: boolean;
  onMoveTask: SprintsSectionProps['onMoveTask'];
}) {
  const key = taskKey(task.number);
  const statusClass = STATUS_CHIP[task.status as TaskStatus] ?? STATUS_CHIP.no_iniciada;
  const statusLabel = STATUS_LABEL[task.status as TaskStatus] ?? task.status;

  return (
    <li className="flex items-center gap-2 py-1.5 text-sm min-w-0">
      <span className="font-mono text-xs text-[var(--text-muted)] shrink-0">{key}</span>
      <span className="truncate min-w-0 flex-1 text-[var(--text-primary)]">{task.title}</span>
      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] ${statusClass}`}>{statusLabel}</span>
      {task.estimate != null && (
        <span className="shrink-0 text-xs text-[var(--text-muted)]">{countLabel(task.estimate, 'pt', 'pts')}</span>
      )}
      {canEdit && (
        <select
          value=""
          onChange={e => {
            const value = e.target.value;
            if (!value) return;
            onMoveTask(task.id, value === BACKLOG_VALUE ? null : value);
          }}
          aria-label={`Mover ${key} ${task.title} a otro sprint`}
          className="shrink-0 rounded border border-[var(--border)] bg-[var(--bg-card)] px-1.5 py-0.5 text-xs text-[var(--text-secondary)]"
        >
          <option value="" disabled>Mover a…</option>
          {task.sprintId != null && <option value={BACKLOG_VALUE}>Backlog</option>}
          {targets.filter(s => s.id !== task.sprintId).map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      )}
    </li>
  );
}

function TaskList({
  tasks, emptyText, targets, canEdit, onMoveTask,
}: {
  tasks: SprintSectionTask[];
  emptyText: string;
  targets: SprintSectionSprint[];
  canEdit: boolean;
  onMoveTask: SprintsSectionProps['onMoveTask'];
}) {
  if (tasks.length === 0) return <p className="py-2 text-xs text-[var(--text-muted)]">{emptyText}</p>;
  return (
    <ul className="divide-y divide-[var(--border)]">
      {tasks.map(t => (
        <TaskRow key={t.id} task={t} targets={targets} canEdit={canEdit} onMoveTask={onMoveTask} />
      ))}
    </ul>
  );
}

function ClosedSprints({ sprints }: { sprints: SprintSectionSprint[] }) {
  if (sprints.length === 0) return null;
  // Del más reciente al más antiguo (fechas 'YYYY-MM-DD': la comparación de cadenas vale).
  const ordered = [...sprints].sort((a, b) => b.endDate.localeCompare(a.endDate) || b.startDate.localeCompare(a.startDate));
  return (
    <article className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">Sprints cerrados</h3>
      <div className="mt-2 divide-y divide-[var(--border)]">
        {ordered.map(s => (
          <details key={s.id} className="py-1.5">
            <summary className="cursor-pointer text-sm text-[var(--text-primary)]">
              <span className="font-medium">{s.name}</span>
              <span className="ml-2 text-xs text-[var(--text-muted)]">
                {`${formatDateRD(s.startDate)} – ${formatDateRD(s.endDate)}`}
              </span>
            </summary>
            <SprintSummaryView summary={s.summary ?? null} />
          </details>
        ))}
      </div>
    </article>
  );
}

/**
 * Sección «Sprints» del detalle de un proyecto (presentación pura, sin fetch):
 * ajuste de días hábiles, sprint activo y planificados (con su capacidad),
 * backlog, formulario de nuevo sprint y retrospectiva de los cerrados. Sólo
 * guarda qué diálogo de cierre está abierto.
 */
export function SprintsSection({
  tasks, sprints, canEdit, defaultDates, onMoveTask, onStartSprint, onCloseSprint, onCreateSprint,
  onSaveCapacity, businessDaysOnly, onToggleBusinessDays, activeForecast,
}: SprintsSectionProps) {
  const [closingId, setClosingId] = useState<string | null>(null);
  const { backlog, active, planned } = groupTasksBySprint(tasks, sprints);
  const targets = sprints.filter(s => s.status !== 'cerrado');
  const closed = sprints.filter(s => s.status === 'cerrado');
  const next = nextPlannedSprint(sprints.map(s => ({ ...s, createdAt: s.createdAt ?? s.startDate })));

  const groups = [...(active ? [active] : []), ...planned];

  return (
    <section className="space-y-4" aria-labelledby="sprints-heading">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="sprints-heading" className="text-sm font-semibold text-[var(--text-primary)]">Sprints</h2>
        <span className="ml-auto">
          <BusinessDaysToggle checked={businessDaysOnly} canEdit={canEdit} onChange={onToggleBusinessDays} />
        </span>
      </div>

      {groups.map(({ sprint, tasks: sprintTasks, estimateTotal }) => (
        <article key={sprint.id} className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <header className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">{sprint.name}</h3>
            <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${SPRINT_STATUS_CHIP[sprint.status]}`}>
              {SPRINT_STATUS_LABEL[sprint.status]}
            </span>
            <span className="text-xs text-[var(--text-muted)]">
              {`${formatDateRD(sprint.startDate)} – ${formatDateRD(sprint.endDate)}`}
            </span>
            <span className="ml-auto"><Totals tasks={sprintTasks} estimateTotal={estimateTotal} /></span>
          </header>
          {sprint.goal && <p className="mt-1 text-xs text-[var(--text-secondary)]">{sprint.goal}</p>}
          {sprint.status === 'activo' && activeForecast && <ForecastSummary {...activeForecast} />}
          <div className="mt-2">
            <TaskList
              tasks={sprintTasks}
              emptyText="No hay tareas en este sprint"
              targets={targets}
              canEdit={canEdit}
              onMoveTask={onMoveTask}
            />
          </div>
          {sprint.capacity && (
            <div className="mt-3">
              <h4 className="mb-1 text-xs font-semibold text-[var(--text-secondary)]">Capacidad del equipo</h4>
              <SprintCapacityTable
                sprintName={sprint.name}
                rows={sprint.capacity}
                canEdit={canEdit}
                onSave={(personId, points) => onSaveCapacity(sprint.id, personId, points)}
              />
            </div>
          )}
          {canEdit && sprint.status === 'activo' && closingId !== sprint.id && (
            <button
              type="button"
              onClick={() => setClosingId(sprint.id)}
              className="mt-3 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
            >
              Cerrar sprint
            </button>
          )}
          {canEdit && sprint.status === 'activo' && closingId === sprint.id && (() => {
            const pending = sprintTasks.filter(t => t.status !== 'completada');
            return (
              <CloseSprintDialog
                sprintName={sprint.name}
                pending={{ tasks: pending.length, points: pending.reduce((sum, t) => sum + (t.estimate ?? 0), 0) }}
                nextPlanned={next ? { id: next.id, name: next.name } : null}
                onCancel={() => setClosingId(null)}
                onConfirm={carryOverTo => {
                  setClosingId(null);
                  onCloseSprint(sprint.id, carryOverTo);
                }}
              />
            );
          })()}
          {canEdit && sprint.status === 'planificado' && (
            <button
              type="button"
              disabled={active != null}
              title={active ? 'Ya hay un sprint activo en este proyecto' : undefined}
              onClick={() => onStartSprint(sprint.id)}
              className="mt-3 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Iniciar sprint
            </button>
          )}
        </article>
      ))}

      <article className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
        <header className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Backlog</h3>
          <span className="ml-auto"><Totals tasks={backlog.tasks} estimateTotal={backlog.estimateTotal} /></span>
        </header>
        <div className="mt-2">
          <TaskList
            tasks={backlog.tasks}
            emptyText="No hay tareas en el backlog"
            targets={targets}
            canEdit={canEdit}
            onMoveTask={onMoveTask}
          />
        </div>
      </article>

      {canEdit && (
        <article className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Nuevo sprint</h3>
          <NewSprintForm defaultDates={defaultDates} onSubmit={onCreateSprint} />
        </article>
      )}

      <ClosedSprints sprints={closed} />
    </section>
  );
}

import { formatDateRD } from '@/lib/date-utils';
import { SPRINT_STATUS_CHIP, SPRINT_STATUS_LABEL, STATUS_CHIP, STATUS_LABEL, taskKey, type TaskStatus } from '@/lib/labels';
import { groupTasksBySprint, type SprintStatus } from '@/lib/sprints';
import { NewSprintForm, type NewSprintPayload } from './new-sprint-form';
import { ForecastSummary, type ForecastSummaryProps } from '@/components/forecast/forecast-summary';
import type { BurndownResult, VelocityReport } from '@/lib/sprint-metrics';
import { BurndownChart } from './burndown-chart';
import { VelocityChart } from './velocity-chart';

export type SprintSectionSprint = {
  id: string;
  name: string;
  goal: string | null;
  status: SprintStatus;
  startDate: string;
  endDate: string;
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
  onCloseSprint: (sprintId: string) => void;
  /** Devolver false (p. ej. si la API rechaza el alta) conserva los datos del formulario. */
  onCreateSprint: (payload: NewSprintPayload) => boolean | void | Promise<boolean | void>;
  /** Pronóstico del sprint activo; si no llega, no se pinta nada. */
  activeForecast?: ForecastSummaryProps;
  /** Burndown por id de sprint (activo y cerrados); si no llega, no se pintan los burndowns. */
  burndowns?: Record<string, BurndownResult>;
  /** Velocidad de los últimos sprints cerrados; si no llega, no se pinta el bloque. */
  velocity?: VelocityReport;
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

const sprintDates = (s: SprintSectionSprint) => `${formatDateRD(s.startDate)} – ${formatDateRD(s.endDate)}`;

/**
 * Sección «Sprints» del detalle de un proyecto (presentación pura, sin fetch):
 * sprint activo (con pronóstico y burndown), sprints planificados, backlog, sprints
 * cerrados (sólo su burndown, plegado), velocidad y formulario de nuevo sprint.
 * Los sprints cerrados no salen como tarjeta con tareas ni en el selector «Mover a…».
 */
export function SprintsSection({
  tasks, sprints, canEdit, defaultDates, onMoveTask, onStartSprint, onCloseSprint, onCreateSprint, activeForecast,
  burndowns, velocity,
}: SprintsSectionProps) {
  const { backlog, active, planned } = groupTasksBySprint(tasks, sprints);
  const targets = sprints.filter(s => s.status !== 'cerrado');

  const groups = [...(active ? [active] : []), ...planned];
  // Del más reciente al más antiguo; sólo los que tienen burndown calculado.
  const closed = burndowns
    ? sprints
      .filter(s => s.status === 'cerrado' && burndowns[s.id])
      .sort((a, b) => b.endDate.localeCompare(a.endDate) || b.startDate.localeCompare(a.startDate))
    : [];

  return (
    <section className="space-y-4" aria-labelledby="sprints-heading">
      <h2 id="sprints-heading" className="text-sm font-semibold text-[var(--text-primary)]">Sprints</h2>

      {groups.map(({ sprint, tasks: sprintTasks, estimateTotal }) => (
        <article key={sprint.id} className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <header className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">{sprint.name}</h3>
            <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${SPRINT_STATUS_CHIP[sprint.status]}`}>
              {SPRINT_STATUS_LABEL[sprint.status]}
            </span>
            <span className="text-xs text-[var(--text-muted)]">{sprintDates(sprint)}</span>
            <span className="ml-auto"><Totals tasks={sprintTasks} estimateTotal={estimateTotal} /></span>
          </header>
          {sprint.goal && <p className="mt-1 text-xs text-[var(--text-secondary)]">{sprint.goal}</p>}
          {sprint.status === 'activo' && activeForecast && <ForecastSummary {...activeForecast} />}
          {sprint.status === 'activo' && burndowns?.[sprint.id] && (
            <div className="mt-3">
              <h4 className="mb-2 text-xs font-medium text-[var(--text-secondary)]">Burndown</h4>
              <BurndownChart burndown={burndowns[sprint.id]} />
            </div>
          )}
          <div className="mt-2">
            <TaskList
              tasks={sprintTasks}
              emptyText="No hay tareas en este sprint"
              targets={targets}
              canEdit={canEdit}
              onMoveTask={onMoveTask}
            />
          </div>
          {canEdit && sprint.status === 'activo' && (
            <button
              type="button"
              onClick={() => onCloseSprint(sprint.id)}
              className="mt-3 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
            >
              Cerrar sprint
            </button>
          )}
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

      {closed.length > 0 && burndowns && (
        <article className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Sprints cerrados</h3>
          <div className="mt-2 divide-y divide-[var(--border)]">
            {closed.map(sprint => (
              <details key={sprint.id} className="py-2">
                <summary className="cursor-pointer text-sm text-[var(--text-primary)]">
                  <span className="font-medium">{sprint.name}</span>
                  <span className="ml-2 text-xs text-[var(--text-muted)]">{sprintDates(sprint)}</span>
                </summary>
                <div className="mt-3">
                  <BurndownChart burndown={burndowns[sprint.id]} />
                </div>
              </details>
            ))}
          </div>
        </article>
      )}

      {velocity && (
        <article className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Velocidad</h3>
          <VelocityChart velocity={velocity} />
        </article>
      )}

      {canEdit && (
        <article className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Nuevo sprint</h3>
          <NewSprintForm defaultDates={defaultDates} onSubmit={onCreateSprint} />
        </article>
      )}
    </section>
  );
}

import { ForecastSummary } from '@/components/forecast/forecast-summary';
import { formatShortDateRD } from '@/lib/date-utils';
import type { BacktestResult, Forecast } from '@/lib/forecast';
import { NO_TASKS_LABEL, type SharedProjectView as SharedProjectViewData } from '@/lib/share-view';

export type SharedProjectViewProps = { view: SharedProjectViewData };

const ALL_DONE_LABEL = 'Todas sus tareas están terminadas';

const HEALTH_CHIP: Record<string, string> = {
  verde: 'bg-green-100 text-green-700',
  amarillo: 'bg-amber-100 text-amber-800',
  rojo: 'bg-red-100 text-red-700',
};
const HEALTH_CHIP_UNDECLARED = 'bg-gray-100 text-gray-700';

const MILESTONE_CHIP: Record<string, string> = {
  cumplido: 'bg-green-100 text-green-700',
  atrasado: 'bg-red-100 text-red-700',
  en_curso: 'bg-sky-100 text-sky-700',
};

/**
 * Pronóstico de un hito o del ciclo de trabajo actual. Distingue «sin trabajo» de «terminado»:
 * sin tareas nunca dice «Todo el trabajo está terminado».
 */
function ForecastBlock({ taskCount, openTasks, forecast, backtest, today }: {
  taskCount: number;
  openTasks: number;
  forecast: Forecast | null;
  backtest: BacktestResult;
  today: string;
}) {
  if (taskCount === 0) return <p className="mt-2 text-xs text-[var(--text-muted)]">{NO_TASKS_LABEL}</p>;
  if (openTasks === 0 || !forecast) return <p className="mt-2 text-xs text-[var(--text-muted)]">{ALL_DONE_LABEL}</p>;
  return <ForecastSummary forecast={forecast} backtest={backtest} today={today} />;
}

/**
 * Estado de un proyecto para interesados sin cuenta (presentación pura, sin hooks ni fetch).
 * Sólo pinta el DTO de buildSharedProjectView: sin personas, correos ni comentarios.
 */
export function SharedProjectView({ view }: SharedProjectViewProps) {
  const short = (date: string) => formatShortDateRD(date, view.today);
  const healthChip = view.health.code ? HEALTH_CHIP[view.health.code] : HEALTH_CHIP_UNDECLARED;

  return (
    <main className="min-h-full bg-[var(--bg-primary)]">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <header className="mb-8">
          <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Estado del proyecto</p>
          <h1 className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">{view.name}</h1>
          {view.objective && <p className="mt-2 text-sm text-[var(--text-secondary)]">{view.objective}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-full px-2 py-0.5 font-medium ${healthChip}`}>
              {`Salud: ${view.health.label}`}
            </span>
            {view.status.label && (
              <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[var(--text-secondary)]">
                {`Proyecto ${view.status.label.toLowerCase()}`}
              </span>
            )}
          </div>
        </header>

        <section aria-labelledby="share-progress" className="mb-8 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <h2 id="share-progress" className="text-sm font-medium text-[var(--text-primary)]">Avance</h2>
          <p className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{view.progressLabel}</p>
          {view.percentComplete !== null && (
            <>
              <div
                className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[var(--bg-hover)]"
                role="progressbar"
                aria-label="Avance del proyecto"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={view.percentComplete}
              >
                <div className="h-full bg-[var(--chart-done)]" style={{ width: `${view.percentComplete}%` }} />
              </div>
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                {`${view.completedTasks} de ${view.totalTasks} ${view.totalTasks === 1 ? 'tarea terminada' : 'tareas terminadas'}`}
              </p>
              <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
                {view.statusCounts.map(s => (
                  <li key={s.status}>{`${s.label}: ${s.count}`}</li>
                ))}
              </ul>
            </>
          )}
        </section>

        {view.activeSprint && (
          <section aria-labelledby="share-cycle" className="mb-8 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <h2 id="share-cycle" className="text-sm font-medium text-[var(--text-primary)]">Ciclo de trabajo actual</h2>
            <ForecastBlock
              taskCount={view.activeSprint.taskCount}
              openTasks={view.activeSprint.openTasks}
              forecast={view.activeSprint.forecast}
              backtest={view.backtest}
              today={view.today}
            />
          </section>
        )}

        <section aria-labelledby="share-milestones" className="mb-8">
          <h2 id="share-milestones" className="mb-2 text-sm font-medium text-[var(--text-primary)]">Hitos</h2>
          {view.milestones.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">Sin hitos definidos</p>
          ) : (
            <ul className="space-y-2">
              {view.milestones.map((m, i) => (
                <li key={`${i}-${m.name}`} className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-[var(--text-primary)]">{m.name}</span>
                    <span className="flex items-center gap-2 text-xs">
                      <span className="text-[var(--text-secondary)]">{`Fecha meta: ${short(m.targetDate)}`}</span>
                      <span className={`rounded-full px-2 py-0.5 font-medium ${MILESTONE_CHIP[m.status]}`}>{m.statusLabel}</span>
                    </span>
                  </div>
                  {m.status !== 'cumplido' && (
                    <ForecastBlock
                      taskCount={m.taskCount}
                      openTasks={m.openTasks}
                      forecast={m.forecast}
                      backtest={view.backtest}
                      today={view.today}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="share-risks" className="mb-8">
          <h2 id="share-risks" className="mb-2 text-sm font-medium text-[var(--text-primary)]">Riesgos</h2>
          {view.risks.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No hay riesgos señalados</p>
          ) : (
            <ul className="space-y-2">
              {view.risks.map((r, i) => (
                <li key={`${i}-${r.title}`} className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3">
                  <p className="text-sm text-[var(--text-primary)]">{r.title}</p>
                  <p className="mt-1 text-xs text-red-700">{r.reasons.join(' · ')}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer className="text-xs text-[var(--text-muted)]">
          {`Vista de sólo lectura. Datos al ${short(view.today)}.`}
        </footer>
      </div>
    </main>
  );
}

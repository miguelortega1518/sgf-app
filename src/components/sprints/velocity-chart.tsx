// Velocidad de los últimos sprints cerrados: una barra por sprint y la media móvil
// encima. Presentación pura, sin hooks ni fetch: SprintsPanel carga los datos.
// Barras en puntos, o en tareas si ningún sprint tiene puntos. Los colores salen
// sólo de variables CSS (SPRINT_CHART_VAR).

import { SPRINT_CHART_VAR } from '@/lib/labels';
import { formatDateRD } from '@/lib/date-utils';
import { MOVING_AVERAGE_WINDOW, type BurndownUnit, type VelocityReport } from '@/lib/sprint-metrics';
import { formatUnit } from './burndown-chart';

const WIDTH = 600;
const HEIGHT = 160;
/** Fracción del hueco de cada sprint que ocupa la barra. */
const BAR_FRACTION = 0.6;

const coord = (n: number) => String(Math.round(n * 10) / 10);

export function VelocityChart({ velocity }: { velocity: VelocityReport }) {
  if (!velocity.enough || velocity.rows.length === 0) {
    return <p className="text-xs text-[var(--text-muted)]">Aún no hay datos suficientes</p>;
  }

  const { rows } = velocity;
  const unit: BurndownUnit = rows.every(r => r.points === 0) ? 'tareas' : 'puntos';
  const value = (r: VelocityReport['rows'][number]) => (unit === 'puntos' ? r.points : r.tasks);
  const average = (r: VelocityReport['rows'][number]) => (unit === 'puntos' ? r.avgPoints : r.avgTasks);

  const max = Math.max(1, ...rows.map(value), ...rows.map(average));
  const slot = WIDTH / rows.length;
  const barWidth = slot * BAR_FRACTION;
  const y = (v: number) => HEIGHT - (v / max) * HEIGHT;
  const center = (i: number) => i * slot + slot / 2;
  const averageLine = rows.map((r, i) => `${coord(center(i))},${coord(y(average(r)))}`).join(' ');

  const last = rows[rows.length - 1];
  const ariaLabel = `Velocidad de los últimos ${rows.length} sprints cerrados, en ${unit}: `
    + rows.map(r => `${r.name}, ${formatUnit(value(r), unit)}`).join('; ')
    + `. Media móvil de ${MOVING_AVERAGE_WINDOW} del último: ${formatUnit(average(last), unit)}.`;

  return (
    <div>
      <div className="flex gap-2">
        <div className="flex flex-col justify-between text-[10px] text-[var(--text-muted)] tabular" aria-hidden="true">
          <span>{max}</span>
          <span>0</span>
        </div>
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={ariaLabel}
          className="w-full h-36 rounded"
        >
          {rows.map((r, i) => (
            <rect
              key={r.sprintId}
              data-bar=""
              x={coord(center(i) - barWidth / 2)}
              y={coord(y(value(r)))}
              width={coord(barWidth)}
              height={coord(HEIGHT - y(value(r)))}
              fill={SPRINT_CHART_VAR.actual}
            />
          ))}
          <polyline
            data-series="average"
            points={averageLine}
            fill="none"
            stroke={SPRINT_CHART_VAR.average}
            strokeWidth={2.5}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>

      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
        <li className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: SPRINT_CHART_VAR.actual }} aria-hidden="true" />
          {`Completado (${unit})`}
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span className="inline-block w-4 border-t-2" style={{ borderColor: SPRINT_CHART_VAR.average }} aria-hidden="true" />
          {`Media móvil de ${MOVING_AVERAGE_WINDOW} sprints`}
        </li>
      </ul>

      <table className="mt-3 w-full text-xs text-[var(--text-secondary)]">
        <caption className="sr-only">Velocidad por sprint</caption>
        <thead>
          <tr className="text-left text-[var(--text-muted)]">
            <th scope="col" className="py-1 font-medium">Sprint</th>
            <th scope="col" className="py-1 font-medium">Puntos</th>
            <th scope="col" className="py-1 font-medium">Tareas</th>
            <th scope="col" className="py-1 font-medium">Media</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {rows.map(r => (
            <tr key={r.sprintId}>
              <th scope="row" className="py-1 pr-2 text-left font-normal text-[var(--text-primary)]">
                {r.name}
                <span className="ml-1 text-[var(--text-muted)]">{`${formatDateRD(r.startDate)} – ${formatDateRD(r.endDate)}`}</span>
              </th>
              <td className="py-1 pr-2 tabular">{formatUnit(r.points, 'puntos')}</td>
              <td className="py-1 pr-2 tabular">{formatUnit(r.tasks, 'tareas')}</td>
              <td className="py-1 tabular">{formatUnit(average(r), unit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

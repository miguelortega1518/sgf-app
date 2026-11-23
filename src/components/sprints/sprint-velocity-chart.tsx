// Velocidad por sprint cerrado (barras) con su media móvil (línea). Presentación
// pura, sin hooks ni fetch: recibe el resultado de buildSprintVelocity.
// Los colores salen sólo de variables CSS (--chart-bar, --chart-marker).

import type { SprintVelocity, VelocitySprint } from '@/lib/sprint-velocity';

const WIDTH = 480;
const HEIGHT = 180;
const PLOT_TOP = 22;
const PLOT_BOTTOM = 152;
const MAX_BAR = 48;
const NAME_MAX = 12;

const fmtNumber = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

function unitLabel(n: number, unit: SprintVelocity['unit']): string {
  const [one, many] = unit === 'points' ? ['punto', 'puntos'] : ['tarea', 'tareas'];
  return `${fmtNumber(n)} ${n === 1 ? one : many}`;
}

const valueOf = (s: VelocitySprint, unit: SprintVelocity['unit']) => (unit === 'points' ? s.points : s.tasks);
const avgOf = (s: VelocitySprint, unit: SprintVelocity['unit']) => (unit === 'points' ? s.avgPoints : s.avgTasks);
const shortName = (name: string) => (name.length > NAME_MAX ? `${name.slice(0, NAME_MAX - 1)}…` : name);

/** Resumen accesible: valor y media de cada sprint mostrado. */
export function velocityAriaLabel(v: SprintVelocity): string {
  const unitName = v.unit === 'points' ? 'puntos' : 'tareas';
  const items = v.sprints.map(s => {
    const avg = avgOf(s, v.unit);
    return `${s.name}: ${unitLabel(valueOf(s, v.unit), v.unit)}${avg === null ? '' : ` (media ${unitLabel(avg, v.unit)})`}`;
  });
  return `Velocidad de los últimos ${v.sprints.length} sprints cerrados, en ${unitName}. ${items.join('; ')}.`;
}

export function SprintVelocityChart({ velocity }: { velocity: SprintVelocity }) {
  if (!velocity.enoughData) {
    return <p className="text-sm text-[var(--text-muted)]">Aún no hay datos suficientes</p>;
  }

  const { sprints, unit } = velocity;
  const n = sprints.length;
  const slot = WIDTH / n;
  const barW = Math.min(MAX_BAR, slot - 16);
  const center = (i: number) => i * slot + slot / 2;
  const max = Math.max(1, ...sprints.flatMap(s => [valueOf(s, unit), avgOf(s, unit) ?? 0]));
  const y = (v: number) => PLOT_BOTTOM - (v / max) * (PLOT_BOTTOM - PLOT_TOP);

  const avgPoints = sprints
    .map((s, i) => ({ i, v: avgOf(s, unit) }))
    .filter((p): p is { i: number; v: number } => p.v !== null);

  return (
    <div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={velocityAriaLabel(velocity)} className="w-full h-auto">
        {sprints.map((s, i) => {
          const v = valueOf(s, unit);
          const top = y(v);
          return (
            <g key={s.id}>
              {v > 0 && (
                <rect
                  data-series="bar" x={center(i) - barW / 2} y={top} width={barW} height={PLOT_BOTTOM - top} rx={2}
                  fill="var(--chart-bar)"
                />
              )}
              {v === 0 && <rect data-series="bar" x={center(i) - barW / 2} y={PLOT_BOTTOM - 1} width={barW} height={1} fill="var(--chart-bar)" />}
              {/* Una etiqueta por columna, centrada en su hueco: no se pisan aunque los valores coincidan. */}
              <text
                data-label="value" x={center(i)} y={top - 5} textAnchor="middle" fontSize={10}
                className="fill-[var(--text-secondary)] tabular"
              >
                {fmtNumber(v)}
              </text>
              <text x={center(i)} y={HEIGHT - 6} textAnchor="middle" fontSize={10} className="fill-[var(--text-muted)]">
                <title>{s.name}</title>
                {shortName(s.name)}
              </text>
            </g>
          );
        })}
        <line x1={0} x2={WIDTH} y1={PLOT_BOTTOM} y2={PLOT_BOTTOM} stroke="var(--border-strong)" strokeWidth={1} />
        {avgPoints.length > 0 && (
          <polyline
            points={avgPoints.map(p => `${center(p.i)},${y(p.v)}`).join(' ')}
            fill="none" stroke="var(--chart-marker)" strokeWidth={2} strokeLinejoin="round"
          />
        )}
        {avgPoints.map(p => (
          <circle key={p.i} cx={center(p.i)} cy={y(p.v)} r={3} fill="var(--chart-marker)" />
        ))}
      </svg>

      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]" aria-hidden="true">
        <li className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--chart-bar)' }} />
          {unit === 'points' ? 'Puntos completados por sprint' : 'Tareas completadas por sprint'}
        </li>
        <li className="inline-flex items-center gap-1.5">
          <svg width="16" height="4" aria-hidden="true">
            <line x1={0} x2={16} y1={2} y2={2} stroke="var(--chart-marker)" strokeWidth={2} />
          </svg>
          Media móvil (3 sprints)
        </li>
      </ul>

      <table className="sr-only">
        <caption>Velocidad por sprint cerrado</caption>
        <thead>
          <tr>
            <th scope="col">Sprint</th>
            <th scope="col">Puntos</th>
            <th scope="col">Tareas</th>
            <th scope="col">Media móvil</th>
          </tr>
        </thead>
        <tbody>
          {sprints.map(s => {
            const avg = avgOf(s, unit);
            return (
              <tr key={s.id}>
                <th scope="row">{s.name}</th>
                <td>{unitLabel(s.points, 'points')}</td>
                <td>{unitLabel(s.tasks, 'tasks')}</td>
                <td>{avg === null ? 'Sin media' : unitLabel(avg, unit)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

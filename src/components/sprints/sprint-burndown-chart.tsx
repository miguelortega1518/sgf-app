// Burndown de un sprint: línea ideal (discontinua) y lo que queda (continua, se
// corta en los días sin dato). Presentación pura, sin hooks ni fetch: SprintsPanel
// carga los datos (GET /api/sprints/[id]/burndown).
// Los colores salen sólo de variables CSS (--chart-bar, --chart-marker).

import { formatDateRD } from '@/lib/date-utils';
import type { BurndownEntry, SprintBurndown } from '@/lib/sprint-burndown';

const WIDTH = 600;
const HEIGHT = 200;

const fmt = (n: number) => String(Math.round(n * 10) / 10);
const fmtNumber = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

/** «1 punto», «2,5 puntos», «3 tareas». */
export function burndownUnitLabel(n: number, unit: SprintBurndown['unit']): string {
  const [one, many] = unit === 'points' ? ['punto', 'puntos'] : ['tarea', 'tareas'];
  return `${fmtNumber(n)} ${n === 1 ? one : many}`;
}

const dayLabel = (e: BurndownEntry) => (e.kind === 'start' ? `Inicio (${formatDateRD(e.date)})` : formatDateRD(e.date));

/** Resumen accesible: rango, alcance inicial y el último día con datos. */
export function burndownAriaLabel(b: SprintBurndown): string {
  const first = b.entries[0];
  const last = b.entries[b.entries.length - 1];
  const unitName = b.unit === 'points' ? 'puntos' : 'tareas';
  const lastKnown = [...b.entries].reverse().find(e => e.remaining !== null && e.scope !== null);
  const known = lastKnown
    ? ` Último dato (${formatDateRD(lastKnown.date)}): quedan ${burndownUnitLabel(lastKnown.remaining!, b.unit)} de ${burndownUnitLabel(lastKnown.scope!, b.unit)}.`
    : '';
  return `Burndown del ${formatDateRD(first.date)} al ${formatDateRD(last.date)}, en ${unitName}. `
    + `Al inicio, ${burndownUnitLabel(first.scope ?? 0, b.unit)}.${known}`;
}

export function SprintBurndownChart({ burndown }: { burndown: SprintBurndown }) {
  const { entries, unit } = burndown;
  if (entries.length === 0 || entries.every(e => !e.scope)) {
    return <p className="text-sm text-[var(--text-muted)]">Sin tareas en este sprint</p>;
  }

  const values = entries.flatMap(e => [e.ideal, e.scope ?? 0, e.remaining ?? 0]);
  const max = Math.max(1, ...values);
  const n = entries.length;
  const x = (i: number) => (n === 1 ? 0 : (i / (n - 1)) * WIDTH);
  const y = (v: number) => HEIGHT - (v / max) * HEIGHT;
  const pt = (i: number, v: number) => `${fmt(x(i))},${fmt(y(v))}`;

  const idealPath = entries.map((e, i) => `${i === 0 ? 'M' : 'L'}${pt(i, e.ideal)}`).join(' ');

  // Tramos de días con dato: un 'M' al empezar cada tramo.
  let remainingPath = '';
  const isolated: { i: number; v: number }[] = [];
  entries.forEach((e, i) => {
    if (e.remaining === null) return;
    const prev = entries[i - 1]?.remaining ?? null;
    const next = entries[i + 1]?.remaining ?? null;
    remainingPath += `${prev === null ? ' M' : ' L'}${pt(i, e.remaining)}`;
    if (prev === null && next === null) isolated.push({ i, v: e.remaining });
  });

  return (
    <div>
      <div className="flex gap-2">
        <div className="flex flex-col justify-between text-[10px] text-[var(--text-muted)] tabular" aria-hidden="true">
          <span>{fmtNumber(max)}</span>
          <span>0</span>
        </div>
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={burndownAriaLabel(burndown)}
          className="w-full h-40 rounded"
        >
          <line x1={0} x2={WIDTH} y1={HEIGHT} y2={HEIGHT} stroke="var(--border-strong)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <path
            data-series="ideal" d={idealPath} fill="none" stroke="var(--chart-marker)" strokeWidth={1.5}
            strokeDasharray="5 4" vectorEffect="non-scaling-stroke"
          />
          <path
            data-series="remaining" d={remainingPath.trim()} fill="none" stroke="var(--chart-bar)" strokeWidth={2.5}
            strokeLinejoin="round" vectorEffect="non-scaling-stroke"
          />
          {isolated.map(p => (
            <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={3} fill="var(--chart-bar)" vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
      </div>
      <div className="flex justify-between mt-1 pl-6 text-[10px] text-[var(--text-muted)] tabular" aria-hidden="true">
        <span>{formatDateRD(entries[0].date)}</span>
        <span>{formatDateRD(entries[n - 1].date)}</span>
      </div>

      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]" aria-hidden="true">
        <li className="inline-flex items-center gap-1.5">
          <svg width="16" height="4" aria-hidden="true">
            <line x1={0} x2={16} y1={2} y2={2} stroke="var(--chart-marker)" strokeWidth={1.5} strokeDasharray="4 3" />
          </svg>
          Ideal
        </li>
        <li className="inline-flex items-center gap-1.5">
          <svg width="16" height="4" aria-hidden="true">
            <line x1={0} x2={16} y1={2} y2={2} stroke="var(--chart-bar)" strokeWidth={2.5} />
          </svg>
          Quedan
        </li>
      </ul>

      <table className="sr-only">
        <caption>{`Burndown en ${unit === 'points' ? 'puntos' : 'tareas'}`}</caption>
        <thead>
          <tr>
            <th scope="col">Día</th>
            <th scope="col">Quedan</th>
            <th scope="col">Alcance</th>
            <th scope="col">Ideal</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={`${e.kind}-${e.date}-${i}`}>
              <th scope="row">{dayLabel(e)}</th>
              <td>{e.remaining === null ? 'Sin datos' : burndownUnitLabel(e.remaining, unit)}</td>
              <td>{e.scope === null ? 'Sin datos' : burndownUnitLabel(e.scope, unit)}</td>
              <td>{burndownUnitLabel(e.ideal, unit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

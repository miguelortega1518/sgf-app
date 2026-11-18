// Burndown de un sprint: lo pendiente real en cada corte frente a la línea ideal.
// Presentación pura, sin hooks ni fetch: SprintsPanel carga los datos.
// Los colores salen sólo de variables CSS (SPRINT_CHART_VAR). No hay rótulos sobre
// las líneas, sólo una leyenda: así no se pisan cuando la real coincide con la ideal.

import { SPRINT_CHART_VAR } from '@/lib/labels';
import { formatDateRD } from '@/lib/date-utils';
import type { BurndownPoint, BurndownResult, BurndownUnit } from '@/lib/sprint-metrics';

const WIDTH = 600;
const HEIGHT = 160;

const coord = (n: number) => String(Math.round(n * 10) / 10);

// 'es' y no 'es-DO': en CLDR es-DO usa punto decimal y aquí se quiere coma (2,5).
const DECIMAL = new Intl.NumberFormat('es', { maximumFractionDigits: 1 });

/** Cifra con coma decimal y como mucho 1 decimal (2,5). */
export function formatMetric(n: number): string {
  return DECIMAL.format(n);
}

const UNIT_FORMS: Record<BurndownUnit, [string, string]> = {
  puntos: ['punto', 'puntos'],
  tareas: ['tarea', 'tareas'],
};

/** «1 punto», «2,5 puntos», «3 tareas». */
export function formatUnit(n: number, unit: BurndownUnit): string {
  const [singular, plural] = UNIT_FORMS[unit];
  return `${formatMetric(n)} ${n === 1 ? singular : plural}`;
}

const pendingWord = (n: number) => (n === 1 ? 'pendiente' : 'pendientes');

/** Resumen accesible: unidad, valor de inicio y el del último corte con datos. */
export function burndownAriaLabel(unit: BurndownUnit, points: BurndownPoint[]): string {
  const start = points[0];
  const last = [...points].reverse().find(p => !p.isStart && p.remaining !== null);
  const startText = `Inicio: ${formatUnit(start.remaining ?? 0, unit)}.`;
  const lastText = last
    ? ` Último corte, ${formatDateRD(last.date)}: ${formatUnit(last.remaining ?? 0, unit)} ${pendingWord(last.remaining ?? 0)}.`
    : '';
  return `Burndown en ${unit}. ${startText}${lastText}`;
}

/** Trazo de la línea real, cortado en los puntos sin datos (días futuros). */
function actualPath(points: BurndownPoint[], x: (i: number) => number, y: (v: number) => number): string {
  const parts: string[] = [];
  let open = false;
  points.forEach((p, i) => {
    if (p.remaining === null) {
      open = false;
      return;
    }
    parts.push(`${open ? 'L' : 'M'}${coord(x(i))},${coord(y(p.remaining))}`);
    open = true;
  });
  return parts.join(' ');
}

const cell = (v: number | null) => (v === null ? '—' : formatMetric(v));

export function BurndownChart({ burndown }: { burndown: BurndownResult }) {
  if (burndown.kind === 'empty') {
    return <p className="text-xs text-[var(--text-muted)]">No hay tareas en este sprint</p>;
  }
  if (burndown.kind === 'too_long') {
    return <p className="text-xs text-[var(--text-muted)]">El sprint es demasiado largo para mostrar su burndown</p>;
  }

  const { unit, points } = burndown;
  const values = points.flatMap(p => [p.remaining, p.scope, p.ideal]).filter((v): v is number => v !== null);
  const max = Math.max(1, ...values);
  const n = points.length;
  const x = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * WIDTH);
  const y = (v: number) => HEIGHT - (v / max) * HEIGHT;
  const ideal = points.map((p, i) => `${coord(x(i))},${coord(y(p.ideal))}`).join(' ');
  const first = points[0];
  const last = points[n - 1];

  return (
    <div>
      <div className="flex gap-2">
        <div className="flex flex-col justify-between text-[10px] text-[var(--text-muted)] tabular" aria-hidden="true">
          <span>{formatMetric(max)}</span>
          <span>0</span>
        </div>
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={burndownAriaLabel(unit, points)}
          className="w-full h-36 rounded"
        >
          <polyline
            data-series="ideal"
            points={ideal}
            fill="none"
            stroke={SPRINT_CHART_VAR.ideal}
            strokeWidth={1.5}
            strokeDasharray="6 4"
            vectorEffect="non-scaling-stroke"
          />
          <path
            data-series="actual"
            d={actualPath(points, x, y)}
            fill="none"
            stroke={SPRINT_CHART_VAR.actual}
            strokeWidth={2.5}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
      <div className="flex justify-between mt-1 pl-6 text-[10px] text-[var(--text-muted)] tabular" aria-hidden="true">
        <span>{formatDateRD(first.date)}</span>
        <span>{formatDateRD(last.date)}</span>
      </div>

      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
        <li className="inline-flex items-center gap-1.5">
          <span className="inline-block w-4 border-t-2" style={{ borderColor: SPRINT_CHART_VAR.actual }} aria-hidden="true" />
          {`Pendiente real (${unit})`}
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: SPRINT_CHART_VAR.ideal }} aria-hidden="true" />
          Ideal
        </li>
      </ul>

      <table className="sr-only">
        <caption>{`Burndown por día, en ${unit}`}</caption>
        <thead>
          <tr>
            <th scope="col">Fecha</th>
            <th scope="col">Pendiente</th>
            <th scope="col">Alcance</th>
            <th scope="col">Ideal</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p, i) => (
            <tr key={i}>
              <th scope="row">{p.isStart ? `Inicio (${formatDateRD(p.date)})` : formatDateRD(p.date)}</th>
              <td>{cell(p.remaining)}</td>
              <td>{cell(p.scope)}</td>
              <td>{formatMetric(p.ideal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

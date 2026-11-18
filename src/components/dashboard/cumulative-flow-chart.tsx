// Diagrama de flujo acumulado (CFD): áreas apiladas por estado, un punto por día.
// Presentación pura, sin hooks ni fetch: flow-metrics.tsx carga los datos.
// Los colores salen sólo de variables CSS (--chart-*, ver STATUS_CHART_VAR).

import { STATUS_CHART_VAR, STATUS_LABEL, STATUS_ORDER, type TaskStatus } from '@/lib/labels';
import { formatDateRD } from '@/lib/date-utils';
import type { CfdEntry } from '@/lib/flow-metrics';

/** Orden de apilado, de abajo arriba: lo terminado en la base. */
export const CFD_STACK_ORDER: readonly TaskStatus[] = ['completada', 'en_revision', 'en_proceso', 'bloqueada', 'no_iniciada'];

const WIDTH = 600;
const HEIGHT = 200;

const fmt = (n: number) => String(Math.round(n * 10) / 10);

function daySummary(e: CfdEntry): string {
  return `${formatDateRD(e.date)}: ${STATUS_ORDER.map(s => `${STATUS_LABEL[s]} ${e.counts[s]}`).join(', ')}`;
}

/** Resumen accesible: rango de fechas y recuentos del primer y el último día. */
export function cfdAriaLabel(data: CfdEntry[]): string {
  const first = data[0];
  const last = data[data.length - 1];
  return `Flujo acumulado del ${formatDateRD(first.date)} al ${formatDateRD(last.date)}. `
    + `Primer día, ${daySummary(first)}. Último día, ${daySummary(last)}.`;
}

export function CumulativeFlowChart({ data }: { data: CfdEntry[] }) {
  if (data.length === 0 || data.every(e => e.total === 0)) {
    return <p className="text-sm text-[var(--text-muted)]">Sin tareas en este periodo.</p>;
  }

  const max = Math.max(1, ...data.map(e => e.total));
  const n = data.length;
  const x = (i: number) => (n === 1 ? (i === 0 ? 0 : WIDTH) : (i / (n - 1)) * WIDTH);
  // Con un solo día se dibuja una franja plana a lo ancho.
  const points = n === 1 ? [data[0], data[0]] : data;
  const y = (v: number) => HEIGHT - (v / max) * HEIGHT;

  const base = points.map(() => 0);
  const areas = CFD_STACK_ORDER.map(status => {
    const lower = [...base];
    const upper = points.map((e, i) => lower[i] + e.counts[status]);
    upper.forEach((v, i) => { base[i] = v; });
    const top = upper.map((v, i) => `${fmt(x(i))},${fmt(y(v))}`);
    const bottom = lower.map((v, i) => `${fmt(x(i))},${fmt(y(v))}`).reverse();
    return { status, d: `M${top.join(' L')} L${bottom.join(' L')} Z` };
  });

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
          aria-label={cfdAriaLabel(data)}
          className="w-full h-48 rounded"
        >
          {areas.map(a => (
            <path key={a.status} data-status={a.status} d={a.d} fill={STATUS_CHART_VAR[a.status]} />
          ))}
        </svg>
      </div>
      <div className="flex justify-between mt-1 pl-6 text-[10px] text-[var(--text-muted)] tabular" aria-hidden="true">
        <span>{formatDateRD(data[0].date)}</span>
        <span>{formatDateRD(data[data.length - 1].date)}</span>
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
        {[...CFD_STACK_ORDER].reverse().map(s => (
          <li key={s} className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: STATUS_CHART_VAR[s] }} aria-hidden="true" />
            {STATUS_LABEL[s]}
          </li>
        ))}
      </ul>

      <table className="sr-only">
        <caption>Tareas por estado y día</caption>
        <thead>
          <tr>
            <th scope="col">Fecha</th>
            {STATUS_ORDER.map(s => <th key={s} scope="col">{STATUS_LABEL[s]}</th>)}
            <th scope="col">Total</th>
          </tr>
        </thead>
        <tbody>
          {data.map(e => (
            <tr key={e.date}>
              <th scope="row">{formatDateRD(e.date)}</th>
              {STATUS_ORDER.map(s => <td key={s}>{e.counts[s]}</td>)}
              <td>{e.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

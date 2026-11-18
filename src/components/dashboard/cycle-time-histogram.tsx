// Histograma del tiempo de ciclo real con las líneas de mediana y p85.
// Presentación pura, sin hooks ni fetch: flow-metrics.tsx carga los datos.
// Los colores salen sólo de variables CSS (--chart-bar, --chart-marker).

import { CYCLE_BUCKETS, histogramMarkerPosition, type CycleHistogram } from '@/lib/flow-metrics';

const SLOT = 60;
const WIDTH = SLOT * CYCLE_BUCKETS.length;
const PLOT_TOP = 30;
const PLOT_BOTTOM = 150;
const HEIGHT = 170;
const BAR_GAP = 8;

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const fmtDays = (n: number) => `${n} ${plural(n, 'día', 'días')}`;
const fmtTasks = (n: number) => `${n} ${plural(n, 'tarea', 'tareas')}`;

export const medianLabel = (v: number) => `Mediana ${fmtDays(v)}`;
export const p85Label = (v: number) => `p85 ${fmtDays(v)}`;

/** Resumen accesible: tareas de cada cubo, mediana y p85. */
export function histogramAriaLabel(h: CycleHistogram): string {
  const buckets = h.buckets.map(b => `${b.label} días: ${fmtTasks(b.count)}`).join(', ');
  const markers = [h.median !== null ? medianLabel(h.median) : null, h.p85 !== null ? p85Label(h.p85) : null]
    .filter(Boolean).join(', ');
  return `Tiempo de ciclo de ${fmtTasks(h.count)} ${plural(h.count, 'terminada', 'terminadas')}. ${buckets}.${markers ? ` ${markers}.` : ''}`;
}

export function CycleTimeHistogram({ histogram }: { histogram: CycleHistogram }) {
  if (histogram.count === 0) {
    return <p className="text-sm text-[var(--text-muted)]">Aún no hay tareas terminadas en este periodo.</p>;
  }

  const max = Math.max(1, ...histogram.buckets.map(b => b.count));
  const plotH = PLOT_BOTTOM - PLOT_TOP;
  const markers = [
    histogram.median !== null ? { key: 'median', value: histogram.median, label: medianLabel(histogram.median), dy: 0 } : null,
    histogram.p85 !== null ? { key: 'p85', value: histogram.p85, label: p85Label(histogram.p85), dy: 13 } : null,
  ].filter((m): m is NonNullable<typeof m> => m !== null);

  return (
    <div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={histogramAriaLabel(histogram)}
        className="w-full h-auto"
      >
        {histogram.buckets.map((b, i) => {
          const h = (b.count / max) * plotH;
          const x = i * SLOT + BAR_GAP / 2;
          return (
            <g key={b.label}>
              {b.count > 0 && (
                <rect x={x} y={PLOT_BOTTOM - h} width={SLOT - BAR_GAP} height={h} rx={2} fill="var(--chart-bar)" />
              )}
              <text x={i * SLOT + SLOT / 2} y={PLOT_BOTTOM - h - 4} textAnchor="middle" fontSize={10} className="fill-[var(--text-secondary)] tabular">
                {b.count || ''}
              </text>
              <text x={i * SLOT + SLOT / 2} y={HEIGHT - 4} textAnchor="middle" fontSize={10} className="fill-[var(--text-muted)]">
                {b.label}
              </text>
            </g>
          );
        })}
        <line x1={0} x2={WIDTH} y1={PLOT_BOTTOM} y2={PLOT_BOTTOM} stroke="var(--border-strong)" strokeWidth={1} />
        {markers.map(m => {
          const x = histogramMarkerPosition(m.value) * SLOT;
          const anchor = x > WIDTH / 2 ? 'end' : 'start';
          return (
            <g key={m.key}>
              <line
                x1={x} x2={x} y1={PLOT_TOP - 8 + m.dy} y2={PLOT_BOTTOM}
                stroke="var(--chart-marker)" strokeWidth={1.5} strokeDasharray={m.key === 'p85' ? '4 3' : undefined}
              />
              <text
                x={anchor === 'end' ? x - 4 : x + 4} y={PLOT_TOP - 12 + m.dy} textAnchor={anchor} fontSize={10}
                fill="var(--chart-marker)" fontWeight={600}
              >
                {m.label}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="mt-2 text-[11px] text-[var(--text-muted)]">
        Días desde el inicio del trabajo hasta el cierre, tareas terminadas en los últimos 60 días.
        {histogram.withoutStart > 0 && ` ${fmtTasks(histogram.withoutStart)} sin inicio registrado ${plural(histogram.withoutStart, 'se mide', 'se miden')} desde su creación.`}
      </p>
    </div>
  );
}

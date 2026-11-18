import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CycleTimeHistogram } from '../src/components/dashboard/cycle-time-histogram';
import { CYCLE_BUCKETS, type CycleHistogram } from '../src/lib/flow-metrics';

const histogram = (counts: number[], over: Partial<CycleHistogram> = {}): CycleHistogram => ({
  buckets: CYCLE_BUCKETS.map((b, i) => ({ ...b, count: counts[i] ?? 0 })),
  count: counts.reduce((s, n) => s + n, 0),
  median: 2,
  p85: 9,
  withoutStart: 0,
  ...over,
});

const render = (h: CycleHistogram) => renderToStaticMarkup(createElement(CycleTimeHistogram, { histogram: h }));
const ariaLabel = (html: string) => html.match(/<svg[^>]*aria-label="([^"]*)"/)?.[1] ?? '';

describe('CycleTimeHistogram', () => {
  it('el SVG tiene role="img" y un aria-label con cada cubo, la mediana y el p85', () => {
    const html = render(histogram([2, 1, 0, 3, 0, 1, 0]));
    expect(html).toMatch(/<svg[^>]*role="img"/);
    const label = ariaLabel(html);
    expect(label).toContain('0–1 días: 2 tareas');
    expect(label).toContain('1–2 días: 1 tarea');
    expect(label).not.toContain('1 tareas');
    expect(label).toContain('2–3 días: 0 tareas');
    expect(label).toContain('13+ días: 0 tareas');
    expect(label).toContain('Mediana 2 días');
    expect(label).toContain('p85 9 días');
  });

  it('rotula las líneas de mediana y p85 con concordancia', () => {
    const html = render(histogram([1, 1], { median: 1, p85: 1.5 }));
    expect(html).toContain('Mediana 1 día');
    expect(html).not.toContain('Mediana 1 días');
    expect(html).toContain('p85 1.5 días');
  });

  it('dibuja las barras y las líneas con variables CSS y sin colores literales', () => {
    const html = render(histogram([2, 1, 0, 3, 0, 1, 0]));
    expect(html).toContain('var(--chart-bar)');
    expect(html).toContain('var(--chart-marker)');
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(html).not.toContain('oklch(');
    for (const b of CYCLE_BUCKETS) expect(html).toContain(b.label);
  });

  it('sin tareas terminadas muestra el estado vacío y no hay SVG', () => {
    const html = render(histogram([], { median: null, p85: null }));
    expect(html).toContain('Aún no hay tareas terminadas en este periodo.');
    expect(html).not.toContain('<svg');
  });
});

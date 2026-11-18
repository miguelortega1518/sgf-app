import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CumulativeFlowChart } from '../src/components/dashboard/cumulative-flow-chart';
import type { CfdEntry } from '../src/lib/flow-metrics';
import { STATUS_LABEL } from '../src/lib/labels';

const entry = (date: string, c: Partial<CfdEntry['counts']>): CfdEntry => {
  const counts = { no_iniciada: 0, en_proceso: 0, en_revision: 0, completada: 0, bloqueada: 0, ...c };
  return { date, counts, total: Object.values(counts).reduce((s, n) => s + n, 0) };
};

const data: CfdEntry[] = [
  entry('2026-11-15', { no_iniciada: 3, en_proceso: 1 }),
  entry('2026-11-16', { no_iniciada: 2, en_proceso: 1, en_revision: 1 }),
  entry('2026-11-17', { no_iniciada: 1, en_proceso: 1, completada: 2, bloqueada: 1 }),
];

const render = (d: CfdEntry[]) => renderToStaticMarkup(createElement(CumulativeFlowChart, { data: d }));
const ariaLabel = (html: string) => html.match(/<svg[^>]*aria-label="([^"]*)"/)?.[1] ?? '';

describe('CumulativeFlowChart', () => {
  it('el SVG tiene role="img" y un aria-label con el primer y el último día por estado', () => {
    const html = render(data);
    expect(html).toMatch(/<svg[^>]*role="img"/);
    const label = ariaLabel(html);
    expect(label).toContain('15/11/2026');
    expect(label).toContain('17/11/2026');
    expect(label).toContain('Por hacer 3');
    expect(label).toContain('Por hacer 1');
    expect(label).toContain('Hecho 2');
    expect(label).toContain('Bloqueada 1');
  });

  it('incluye una tabla sr-only con una fila por día', () => {
    const html = render(data);
    const table = html.match(/<table class="sr-only"[\s\S]*?<\/table>/)?.[0] ?? '';
    expect(table).not.toBe('');
    expect(table.match(/<tbody>[\s\S]*<\/tbody>/)?.[0].match(/<tr>/g)).toHaveLength(3);
    expect(table).toContain('16/11/2026');
    for (const label of Object.values(STATUS_LABEL)) expect(table).toContain(label);
  });

  it('muestra la leyenda con las etiquetas de estado', () => {
    const html = render(data);
    for (const label of Object.values(STATUS_LABEL)) expect(html).toContain(label);
  });

  it('pinta las áreas con variables CSS y sin colores literales', () => {
    const html = render(data);
    expect(html).toContain('var(--chart-done)');
    expect(html).toContain('var(--chart-todo)');
    expect(html).toContain('var(--chart-doing)');
    expect(html).toContain('var(--chart-review)');
    expect(html).toContain('var(--chart-blocked)');
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(html).not.toContain('oklch(');
  });

  it('apila Hecho abajo y Por hacer arriba', () => {
    const html = render(data);
    const order = [...html.matchAll(/<path[^>]*data-status="([a-z_]+)"/g)].map(m => m[1]);
    expect(order).toEqual(['completada', 'en_revision', 'en_proceso', 'bloqueada', 'no_iniciada']);
  });

  it('sin datos muestra el estado vacío y no hay SVG', () => {
    for (const empty of [[], [entry('2026-11-17', {})]]) {
      const html = render(empty);
      expect(html).toContain('Sin tareas en este periodo.');
      expect(html).not.toContain('<svg');
    }
  });
});

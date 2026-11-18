import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BurndownChart } from '../src/components/sprints/burndown-chart';
import type { BurndownPoint, BurndownResult } from '../src/lib/sprint-metrics';

function point(date: string, remaining: number | null, scope: number | null, ideal: number, isStart = false): BurndownPoint {
  return { date, isStart, remaining, scope, ideal };
}

const closed: BurndownResult = {
  kind: 'data',
  unit: 'puntos',
  points: [
    point('2026-11-02', 8, 8, 8, true),
    point('2026-11-02', 8, 8, 6),
    point('2026-11-03', 5, 8, 4),
    point('2026-11-04', 5, 10, 2),
    point('2026-11-05', 1, 10, 0),
  ],
};

const render = (burndown: BurndownResult) => renderToStaticMarkup(createElement(BurndownChart, { burndown }));
const ariaLabel = (html: string) => html.match(/<svg[^>]*aria-label="([^"]*)"/)?.[1] ?? '';

describe('BurndownChart', () => {
  it('pinta la línea real y la ideal (discontinua) con variables CSS', () => {
    const html = render(closed);
    const actual = html.match(/<(?:path|polyline)[^>]*data-series="actual"[^>]*>/)?.[0] ?? '';
    const ideal = html.match(/<(?:path|polyline)[^>]*data-series="ideal"[^>]*>/)?.[0] ?? '';
    expect(actual).toContain('var(--chart-bar)');
    expect(ideal).toContain('var(--chart-marker)');
    expect(ideal).toContain('stroke-dasharray');
    expect(actual).not.toContain('stroke-dasharray');
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(html).not.toContain('oklch(');
  });

  it('el SVG tiene role="img" y un aria-label con la unidad, el inicio y el último corte', () => {
    const html = render(closed);
    expect(html).toMatch(/<svg[^>]*role="img"/);
    const label = ariaLabel(html);
    expect(label).toContain('puntos');
    expect(label).toContain('Inicio: 8 puntos');
    expect(label).toContain('05/11/2026: 1 punto pendiente');
  });

  it('incluye una tabla sr-only con una fila por punto y fechas DD/MM/YYYY', () => {
    const html = render(closed);
    const table = html.match(/<table class="sr-only"[\s\S]*?<\/table>/)?.[0] ?? '';
    expect(table).not.toBe('');
    for (const head of ['Fecha', 'Pendiente', 'Alcance', 'Ideal']) expect(table).toContain(head);
    expect(table.match(/<tbody>[\s\S]*<\/tbody>/)?.[0].match(/<tr>/g)).toHaveLength(5);
    expect(table).toContain('Inicio');
    expect(table).toContain('03/11/2026');
  });

  it('muestra las fechas de inicio y fin', () => {
    const html = render(closed);
    expect(html).toContain('02/11/2026');
    expect(html).toContain('05/11/2026');
  });

  it('los decimales usan coma y los días futuros se muestran como —', () => {
    const html = render({
      kind: 'data',
      unit: 'tareas',
      points: [
        point('2026-11-02', 3, 3, 3, true),
        point('2026-11-02', 3, 3, 1.5),
        point('2026-11-03', null, null, 0),
      ],
    });
    const table = html.match(/<table class="sr-only"[\s\S]*?<\/table>/)?.[0] ?? '';
    expect(table).toContain('1,5');
    expect(table).toContain('—');
    expect(ariaLabel(html)).toContain('tareas');
    expect(ariaLabel(html)).toContain('02/11/2026: 3 tareas pendientes');
  });

  it('la línea real se corta en los puntos sin datos', () => {
    const html = render({
      kind: 'data',
      unit: 'tareas',
      points: [
        point('2026-11-02', 2, 2, 2, true),
        point('2026-11-02', 2, 2, 1),
        point('2026-11-03', null, null, 0),
      ],
    });
    const d = html.match(/data-series="actual"[^>]*d="([^"]*)"/)?.[1]
      ?? html.match(/d="([^"]*)"[^>]*data-series="actual"/)?.[1] ?? '';
    expect(d.match(/[ML]/g)).toHaveLength(2);
  });

  it('si la real coincide con la ideal hay leyenda y no hay rótulos sobre las líneas', () => {
    const html = render({
      kind: 'data',
      unit: 'tareas',
      points: [point('2026-11-02', 2, 2, 2, true), point('2026-11-02', 1, 2, 1), point('2026-11-03', 0, 2, 0)],
    });
    expect(html).not.toContain('<text');
    const legend = html.match(/<ul[\s\S]*?<\/ul>/)?.[0] ?? '';
    expect(legend).toContain('Pendiente');
    expect(legend).toContain('Ideal');
  });

  it("con kind 'empty' muestra «No hay tareas en este sprint» y nada de «terminado»", () => {
    const html = render({ kind: 'empty' });
    expect(html).toContain('No hay tareas en este sprint');
    expect(html).not.toContain('<svg');
    expect(html.toLowerCase()).not.toContain('terminad');
  });
});

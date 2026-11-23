import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SprintBurndownChart, burndownAriaLabel } from '../src/components/sprints/sprint-burndown-chart';
import type { BurndownEntry, SprintBurndown } from '../src/lib/sprint-burndown';

function burndown(entries: BurndownEntry[], overrides: Partial<SprintBurndown> = {}): SprintBurndown {
  return {
    unit: 'points', businessDaysOnly: false, startDate: entries[0].date, endDate: entries.at(-1)!.date, entries, ...overrides,
  };
}

const full = burndown([
  { date: '2026-11-02', kind: 'start', remaining: 2, scope: 2, ideal: 2 },
  { date: '2026-11-02', kind: 'day', remaining: 2, scope: 2, ideal: 1.3 },
  { date: '2026-11-03', kind: 'day', remaining: 1, scope: 2, ideal: 0.7 },
  { date: '2026-11-04', kind: 'day', remaining: null, scope: null, ideal: 0 },
]);

const render = (b: SprintBurndown) => renderToStaticMarkup(createElement(SprintBurndownChart, { burndown: b }));

function pathOf(html: string, series: string): string {
  const match = html.match(new RegExp(`<path[^>]*data-series="${series}"[^>]*d="([^"]*)"`))
    ?? html.match(new RegExp(`<path[^>]*d="([^"]*)"[^>]*data-series="${series}"`));
  return match ? match[1] : '';
}

describe('SprintBurndownChart', () => {
  it('pinta la línea ideal discontinua y la de restante continua', () => {
    const html = render(full);
    expect(html).toContain('<svg');
    expect(html).toMatch(/<path[^>]*data-series="ideal"[^>]*stroke-dasharray/);
    expect(html).toMatch(/<path[^>]*data-series="remaining"/);
    expect(html).not.toMatch(/<path[^>]*data-series="remaining"[^>]*stroke-dasharray/);
    // Ideal: 4 puntos. Restante: sólo los 3 no nulos, en un tramo.
    expect(pathOf(html, 'ideal').match(/[ML]/g)).toHaveLength(4);
    expect(pathOf(html, 'remaining').match(/[ML]/g)).toHaveLength(3);
    expect(pathOf(html, 'remaining').match(/M/g)).toHaveLength(1);
  });

  it('la línea de restante se corta en los null', () => {
    const html = render(burndown([
      { date: '2026-11-02', kind: 'start', remaining: 3, scope: 3, ideal: 3 },
      { date: '2026-11-02', kind: 'day', remaining: 3, scope: 3, ideal: 2 },
      { date: '2026-11-03', kind: 'day', remaining: null, scope: null, ideal: 1 },
      { date: '2026-11-04', kind: 'day', remaining: 1, scope: 3, ideal: 0 },
      { date: '2026-11-05', kind: 'day', remaining: 0, scope: 3, ideal: 0 },
    ]));
    expect(pathOf(html, 'remaining').match(/M/g)).toHaveLength(2);
  });

  it('eje Y con máximo y 0, primera y última fecha y leyenda', () => {
    const html = render(full);
    expect(html).toContain('>2<');
    expect(html).toContain('>0<');
    expect(html).toContain('02/11/2026');
    expect(html).toContain('04/11/2026');
    expect(html).toContain('Ideal');
    expect(html).toContain('Quedan');
  });

  it('aria-label con fechas y valores', () => {
    const label = burndownAriaLabel(full);
    expect(label).toContain('02/11/2026');
    expect(label).toContain('04/11/2026');
    expect(label).toContain('2 puntos');
    expect(label).toContain('quedan 1 punto de 2 puntos');
    expect(render(full)).toContain(`aria-label="${label}"`);
  });

  it('tabla sr-only con Día, Quedan, Alcance e Ideal concordando singular y plural', () => {
    const html = render(full);
    expect(html).toContain('<table class="sr-only"');
    for (const col of ['Día', 'Quedan', 'Alcance', 'Ideal']) expect(html).toContain(`>${col}</th>`);
    expect(html).toContain('<td>1 punto</td>');
    expect(html).toContain('<td>2 puntos</td>');
    expect(html).toContain('<td>0,7 puntos</td>');
    expect(html).not.toContain('1 puntos');

    const tasks = render(burndown([
      { date: '2026-11-02', kind: 'start', remaining: 1, scope: 1, ideal: 1 },
      { date: '2026-11-02', kind: 'day', remaining: 1, scope: 1, ideal: 0 },
    ], { unit: 'tasks' }));
    expect(tasks).toContain('<td>1 tarea</td>');
    expect(tasks).toContain('<td>0 tareas</td>');
    expect(tasks).not.toContain('1 tareas');
  });

  it('sin alcance muestra «Sin tareas en este sprint» y nunca «terminado»', () => {
    const html = render(burndown([
      { date: '2026-11-02', kind: 'start', remaining: 0, scope: 0, ideal: 0 },
      { date: '2026-11-02', kind: 'day', remaining: 0, scope: 0, ideal: 0 },
      { date: '2026-11-03', kind: 'day', remaining: null, scope: null, ideal: 0 },
    ]));
    expect(html).toContain('Sin tareas en este sprint');
    expect(html.toLowerCase()).not.toContain('terminado');
    expect(html).not.toContain('<svg');
  });

  it('sólo usa colores de variables CSS', () => {
    const html = render(full);
    expect(html).toContain('var(--chart-bar)');
    expect(html).toContain('var(--chart-marker)');
    expect(html).not.toMatch(/#[0-9a-f]{3,6}\b/i);
    expect(html).not.toMatch(/rgb\(|hsl\(|oklch\(/);
  });
});

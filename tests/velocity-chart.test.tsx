import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { VelocityChart } from '../src/components/sprints/velocity-chart';
import type { VelocityReport, VelocityRow } from '../src/lib/sprint-metrics';

function row(n: number, points: number, tasks: number, avgPoints: number, avgTasks: number): VelocityRow {
  return {
    sprintId: `s-${n}`, name: `Sprint ${n}`, startDate: '2026-10-05', endDate: '2026-10-09',
    points, tasks, avgPoints, avgTasks,
  };
}

const render = (velocity: VelocityReport) => renderToStaticMarkup(createElement(VelocityChart, { velocity }));

describe('VelocityChart', () => {
  it('con enough=false muestra «Aún no hay datos suficientes» sin svg ni media', () => {
    for (const velocity of [
      { enough: false, closedCount: 0, rows: [] },
      { enough: false, closedCount: 1, rows: [row(1, 3, 2, 3, 2)] },
    ]) {
      const html = render(velocity);
      expect(html).toContain('Aún no hay datos suficientes');
      expect(html).not.toContain('<svg');
      expect(html).not.toContain('data-series="average"');
      expect(html).not.toContain('Media');
    }
  });

  it('con enough=true pinta una barra por sprint y la línea de media con variables CSS', () => {
    const html = render({
      enough: true, closedCount: 3,
      rows: [row(1, 3, 2, 3, 2), row(2, 1, 1, 2, 1.5), row(3, 5, 3, 3, 2)],
    });
    expect(html.match(/<rect[^>]*data-bar/g)).toHaveLength(3);
    expect(html).toMatch(/<rect[^>]*fill="var\(--chart-bar\)"/);
    expect(html).toMatch(/<polyline[^>]*data-series="average"[^>]*stroke="var\(--chart-review\)"|<polyline[^>]*stroke="var\(--chart-review\)"[^>]*data-series="average"/);
    expect(html).toMatch(/<svg[^>]*role="img"/);
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(html).not.toContain('Aún no hay datos suficientes');
  });

  it('la lista visible concuerda en singular y plural', () => {
    const html = render({
      enough: true, closedCount: 2,
      rows: [row(1, 1, 1, 1, 1), row(2, 3, 2, 2, 1.5)],
    });
    expect(html).toContain('Sprint 1');
    expect(html).toContain('Sprint 2');
    expect(html).toContain('1 punto<');
    expect(html).toContain('1 tarea<');
    expect(html).toContain('3 puntos');
    expect(html).toContain('2 tareas');
    expect(html).not.toContain('1 puntos');
    expect(html).not.toContain('1 tareas');
  });

  it('la media usa coma decimal', () => {
    const html = render({
      enough: true, closedCount: 3,
      rows: [row(1, 1, 1, 1, 1), row(2, 2, 1, 1.5, 1), row(3, 4, 1, 2.3, 1)],
    });
    expect(html).toContain('1,5 puntos');
    expect(html).toContain('2,3 puntos');
  });

  it('el máximo del eje Y con decimales usa coma', () => {
    // La media (2,7) supera a las barras: el eje llega a 2,7.
    const html = render({
      enough: true, closedCount: 3,
      rows: [row(1, 2, 1, 2, 1), row(2, 2, 1, 2, 1), row(3, 1, 1, 2.7, 1)],
    });
    expect(html).toContain('<span>2,7</span>');
    expect(html).not.toContain('<span>2.7</span>');
  });

  it('si todos los sprints tienen 0 puntos, las barras y la media usan tareas', () => {
    const html = render({
      enough: true, closedCount: 2,
      rows: [row(1, 0, 2, 0, 2), row(2, 0, 4, 0, 3)],
    });
    const label = html.match(/<svg[^>]*aria-label="([^"]*)"/)?.[1] ?? '';
    expect(label).toContain('tareas');
    expect(label).not.toContain('puntos');
    expect(html).toContain('3 tareas');
    // La barra del segundo (4 tareas) es la más alta: llega arriba del todo.
    const heights = [...html.matchAll(/<rect[^>]*data-bar[^>]*height="([\d.]+)"/g)].map(m => Number(m[1]));
    expect(heights).toHaveLength(2);
    expect(heights[1]).toBeGreaterThan(heights[0]);
  });
});

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SprintVelocityChart } from '../src/components/sprints/sprint-velocity-chart';
import { buildSprintVelocity, type SprintVelocity, type VelocitySprintInput } from '../src/lib/sprint-velocity';

function closed(i: number, tasks: number, points: number): VelocitySprintInput {
  const m = String(i).padStart(2, '0');
  return { id: `s${i}`, name: `Sprint ${i}`, startDate: `2026-${m}-01`, endDate: `2026-${m}-14`, completed: { tasks, points } };
}

const render = (velocity: SprintVelocity) => renderToStaticMarkup(createElement(SprintVelocityChart, { velocity }));

describe('SprintVelocityChart', () => {
  it('sin datos suficientes muestra el mensaje y ningún svg', () => {
    for (const v of [buildSprintVelocity([]), buildSprintVelocity([closed(1, 2, 5)])]) {
      const html = render(v);
      expect(html).toContain('Aún no hay datos suficientes');
      expect(html).not.toContain('<svg');
      expect(html).not.toContain('<rect');
      expect(html).not.toContain('<polyline');
    }
  });

  it('una barra por sprint, la media sobre los puntos no nulos y los nombres en el eje X', () => {
    const html = render(buildSprintVelocity([closed(1, 2, 8), closed(2, 3, 13), closed(3, 1, 5)]));
    expect(html.match(/<rect[^>]*data-series="bar"/g)).toHaveLength(3);
    expect(html).toMatch(/<rect[^>]*fill="var\(--chart-bar\)"/);
    const polyline = html.match(/<polyline[^>]*points="([^"]*)"/);
    expect(polyline).not.toBeNull();
    // La media del 1.º es null: sólo 2 puntos.
    expect(polyline![1].trim().split(/\s+/)).toHaveLength(2);
    expect(html).toMatch(/<polyline[^>]*stroke="var\(--chart-marker\)"/);
    for (const name of ['Sprint 1', 'Sprint 2', 'Sprint 3']) expect(html).toContain(name);
  });

  it('tabla sr-only con Sprint, Puntos, Tareas y Media móvil', () => {
    const html = render(buildSprintVelocity([closed(1, 1, 1), closed(2, 3, 13)]));
    expect(html).toContain('<table class="sr-only"');
    for (const col of ['Sprint', 'Puntos', 'Tareas', 'Media móvil']) expect(html).toContain(`>${col}</th>`);
    expect(html).toContain('<td>1 punto</td>');
    expect(html).toContain('<td>1 tarea</td>');
    expect(html).toContain('<td>13 puntos</td>');
    expect(html).toContain('<td>7 puntos</td>');
    expect(html).toContain('<td>Sin media</td>');
  });

  it('en tareas cuando ningún sprint tiene puntos', () => {
    const html = render(buildSprintVelocity([closed(1, 2, 0), closed(2, 4, 0)]));
    expect(html).toContain('Tareas completadas por sprint');
    expect(html).toContain('<td>3 tareas</td>');
  });

  it('con valores iguales las etiquetas no se solapan', () => {
    const html = render(buildSprintVelocity([closed(1, 5, 5), closed(2, 5, 5), closed(3, 5, 5)]));
    const labels = [...html.matchAll(/<text[^>]*data-label="value"[^>]*x="([^"]+)"[^>]*y="([^"]+)"/g)]
      .map(m => `${m[1]},${m[2]}`);
    expect(labels).toHaveLength(3);
    expect(new Set(labels).size).toBe(3);
    const xs = labels.map(l => Number(l.split(',')[0])).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(30);
  });

  it('aria-label con los valores y sólo colores de variables CSS', () => {
    const html = render(buildSprintVelocity([closed(1, 2, 8), closed(2, 3, 13)]));
    expect(html).toMatch(/aria-label="Velocidad de los últimos 2 sprints cerrados, en puntos[^"]*Sprint 1: 8 puntos[^"]*Sprint 2: 13 puntos/);
    expect(html).not.toMatch(/#[0-9a-f]{3,6}\b/i);
    expect(html).not.toMatch(/rgb\(|hsl\(|oklch\(/);
  });
});

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SprintSummaryView } from '../src/components/sprints/sprint-summary-view';
import type { SprintSummary } from '../src/lib/sprint-summary';

function summary(overrides: Partial<SprintSummary> = {}): SprintSummary {
  return {
    version: 1,
    closedOn: '2026-11-16',
    businessDaysOnly: true,
    committed: { tasks: 5, points: 13 },
    completed: { tasks: 4, points: 10 },
    carriedOver: { tasks: 2, points: 3, to: { sprintId: crypto.randomUUID(), name: 'Sprint 8' } },
    addedMidSprint: { tasks: 1, points: 2 },
    blockersByArea: [{ area: 'diseno', count: 2 }, { area: 'otro', count: 1 }],
    cycleTime: { basis: 'cycle', unit: 'business', count: 4, median: 3, p85: 5, withoutStart: 0 },
    byPerson: [],
    ...overrides,
  };
}

function render(s: SprintSummary | null) {
  return renderToStaticMarkup(createElement(SprintSummaryView, { summary: s }));
}

describe('SprintSummaryView', () => {
  it('muestra comprometido, completado, arrastrado con destino y añadido', () => {
    const html = render(summary());
    expect(html).toContain('Comprometido');
    expect(html).toContain('5 tareas · 13 puntos');
    expect(html).toContain('Completado');
    expect(html).toContain('4 tareas · 10 puntos');
    expect(html).toContain('Arrastrado');
    expect(html).toContain('2 tareas · 3 puntos → Sprint 8');
    expect(html).toContain('Añadido a mitad de sprint');
    expect(html).toContain('1 tarea · 2 puntos');
  });

  it('arrastrado al backlog lo indica', () => {
    const html = render(summary({ carriedOver: { tasks: 1, points: 1, to: { sprintId: null, name: 'Backlog' } } }));
    expect(html).toContain('1 tarea · 1 punto → Backlog');
    expect(html).not.toContain('1 tareas');
    expect(html).not.toContain('1 puntos');
  });

  it('bloqueos por área con AREA_LABEL y contador concordado', () => {
    const html = render(summary());
    expect(html).toContain('Diseño: 2 tareas');
    expect(html).toContain('Otro: 1 tarea<');
  });

  it('sin bloqueos lo dice', () => {
    const html = render(summary({ blockersByArea: [] }));
    expect(html).toContain('Ninguno al cierre');
  });

  it('tiempo de ciclo en días hábiles', () => {
    const html = render(summary());
    expect(html).toContain('Mediana 3 días hábiles · p85 5 días hábiles');
    expect(html).toContain('4 tareas completadas');
  });

  it('tiempo de ciclo en días naturales, singular y sin inicio', () => {
    const html = render(summary({
      businessDaysOnly: false,
      cycleTime: { basis: 'cycle', unit: 'calendar', count: 1, median: 1, p85: 1, withoutStart: 1 },
    }));
    expect(html).toContain('Mediana 1 día · p85 1 día');
    expect(html).not.toContain('hábil');
    expect(html).toContain('1 tarea completada');
    expect(html).toContain('1 sin fecha de inicio');
  });

  it('sin tareas completadas no hay mediana', () => {
    const html = render(summary({
      completed: { tasks: 0, points: 0 },
      cycleTime: { basis: 'cycle', unit: 'business', count: 0, median: null, p85: null, withoutStart: 0 },
    }));
    expect(html).toContain('Sin tareas completadas');
    expect(html).not.toContain('Mediana');
  });

  it('summary null → texto de sprint cerrado antes de la retrospectiva', () => {
    const html = render(null);
    expect(html).toContain('Sin resumen: este sprint se cerró antes de la retrospectiva automática');
  });
});

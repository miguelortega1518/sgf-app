import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  SprintsSection,
  type SprintsSectionProps,
  type SprintSectionSprint,
  type SprintSectionTask,
} from '../src/components/sprints/sprints-section';

const active: SprintSectionSprint = {
  id: 's-active', name: 'Sprint 7', goal: 'Filtros guardados', status: 'activo',
  startDate: '2026-11-03', endDate: '2026-11-16',
};
const planned: SprintSectionSprint = {
  id: 's-planned', name: 'Sprint 8', goal: null, status: 'planificado',
  startDate: '2026-11-17', endDate: '2026-11-30',
};
const closed: SprintSectionSprint = {
  id: 's-closed', name: 'Sprint 6', goal: null, status: 'cerrado',
  startDate: '2026-10-20', endDate: '2026-11-02',
};

function task(overrides: Partial<SprintSectionTask>): SprintSectionTask {
  return {
    id: crypto.randomUUID(), number: 1, title: 'Tarea', status: 'no_iniciada',
    estimate: null, sprintId: null, ...overrides,
  };
}

function render(overrides: Partial<SprintsSectionProps> = {}) {
  return renderToStaticMarkup(createElement(SprintsSection, {
    tasks: [],
    sprints: [],
    canEdit: true,
    defaultDates: { startDate: '2026-11-17', endDate: '2026-11-30' },
    onMoveTask: () => {},
    onStartSprint: () => {},
    onCloseSprint: () => {},
    onCreateSprint: () => {},
    ...overrides,
  }));
}

describe('SprintsSection', () => {
  it('muestra el título y el estado vacío del backlog', () => {
    const html = render();
    expect(html).toContain('Sprints');
    expect(html).toContain('No hay tareas en el backlog');
  });

  it('el sprint activo con 2 tareas (3 y sin estimar) muestra «2 tareas» y «3 puntos»', () => {
    const html = render({
      sprints: [active],
      tasks: [
        task({ title: 'Guardar filtro', sprintId: active.id, estimate: 3 }),
        task({ title: 'Borrar filtro', sprintId: active.id, estimate: null }),
      ],
    });
    expect(html).toContain('Sprint 7');
    expect(html).toContain('Filtros guardados');
    expect(html).toContain('03/11/2026');
    expect(html).toContain('16/11/2026');
    expect(html).toContain('Activo');
    expect(html).toContain('2 tareas');
    expect(html).toContain('3 puntos');
    expect(html).toContain('Cerrar sprint');
  });

  it('con 1 tarea y 1 punto concuerda en singular', () => {
    const html = render({
      sprints: [active],
      tasks: [task({ sprintId: active.id, estimate: 1 })],
    });
    expect(html).toContain('1 tarea<');
    expect(html).toContain('1 punto<');
    expect(html).not.toContain('1 tareas');
    expect(html).not.toContain('1 puntos');
  });

  it('los planificados tienen «Iniciar sprint», deshabilitado si ya hay uno activo', () => {
    const withActive = render({ sprints: [active, planned] });
    expect(withActive).toMatch(/<button[^>]*disabled=""[^>]*>[^<]*Iniciar sprint/);

    const withoutActive = render({ sprints: [planned] });
    expect(withoutActive).toContain('Iniciar sprint');
    expect(withoutActive).not.toMatch(/<button[^>]*disabled=""[^>]*>[^<]*Iniciar sprint/);
    expect(withoutActive).not.toContain('Cerrar sprint');
  });

  it('el selector «Mover a…» ofrece Backlog y los sprints no cerrados', () => {
    const html = render({
      sprints: [active, planned, closed],
      tasks: [task({ number: 12, title: 'Guardar filtro', sprintId: active.id })],
    });
    expect(html).toContain('Mover a…');
    expect(html).toMatch(/<select[^>]*aria-label="Mover FOR-12 Guardar filtro a otro sprint"/);
    expect(html).toContain('<option value="backlog">Backlog</option>');
    expect(html).toContain(`<option value="${planned.id}">Sprint 8</option>`);
    expect(html).not.toContain(`<option value="${closed.id}"`);
    // El sprint de un cerrado no se pinta como tarjeta.
    expect(html).not.toContain('Sprint 6');
  });

  it('con canEdit=false no hay selectores, botones ni formulario', () => {
    const html = render({
      canEdit: false,
      sprints: [active, planned],
      tasks: [task({ sprintId: null }), task({ sprintId: active.id })],
    });
    expect(html).not.toContain('<select');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('<form');
    expect(html).not.toContain('Nuevo sprint');
  });

  it('con canEdit=true incluye el formulario de nuevo sprint', () => {
    const html = render();
    expect(html).toContain('Nuevo sprint');
    expect(html).toContain('<form');
  });

  it('una tarea completada sin sprint no sale en el backlog', () => {
    const html = render({
      tasks: [
        task({ title: 'Hecha hace tiempo', status: 'completada' }),
        task({ title: 'Pendiente', status: 'no_iniciada', estimate: 5 }),
      ],
    });
    expect(html).not.toContain('Hecha hace tiempo');
    expect(html).toContain('Pendiente');
    expect(html).toContain('5 puntos');
    expect(html).not.toContain('No hay tareas en el backlog');
  });
});

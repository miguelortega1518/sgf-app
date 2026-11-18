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
    onSaveCapacity: () => {},
    businessDaysOnly: true,
    onToggleBusinessDays: () => {},
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
    // El cerrado no se pinta como tarjeta: sólo en el bloque «Sprints cerrados».
    const openPart = html.slice(0, html.indexOf('Sprints cerrados'));
    expect(openPart).not.toContain('Sprint 6');
  });

  it('bloque «Sprints cerrados» del más reciente al más antiguo, plegable, con su resumen', () => {
    const older: SprintSectionSprint = {
      id: 's-older', name: 'Sprint 5', goal: null, status: 'cerrado',
      startDate: '2026-10-06', endDate: '2026-10-19', summary: null,
    };
    const html = render({ sprints: [older, { ...closed, summary: null }, active] });
    expect(html).toContain('Sprints cerrados');
    const block = html.slice(html.indexOf('Sprints cerrados'));
    expect(block.indexOf('Sprint 6')).toBeGreaterThan(-1);
    expect(block.indexOf('Sprint 6')).toBeLessThan(block.indexOf('Sprint 5'));
    expect(block).toContain('<details');
    expect(block).toContain('<summary');
    expect(block).toContain('Sin resumen: este sprint se cerró antes de la retrospectiva automática');
  });

  it('sin sprints cerrados no hay bloque', () => {
    const html = render({ sprints: [active] });
    expect(html).not.toContain('Sprints cerrados');
  });

  it('los sprints abiertos con capacity pintan la tabla y el aviso de sobrecarga', () => {
    const html = render({
      sprints: [{
        ...active,
        capacity: [{ personId: 'p1', name: 'Ana', points: 5, isDefault: false, assigned: 8, overloaded: true }],
      }],
    });
    expect(html).toContain('Capacidad del equipo');
    expect(html).toContain('Supera su capacidad en 3 puntos');
    expect(html).toMatch(/<input[^>]*aria-label="Capacidad de Ana en Sprint 7"/);
  });

  it('sin canEdit la capacidad es de sólo lectura', () => {
    const html = render({
      canEdit: false,
      sprints: [{
        ...active,
        capacity: [{ personId: 'p1', name: 'Ana', points: 5, isDefault: false, assigned: 2, overloaded: false }],
      }],
    });
    expect(html).toContain('Capacidad del equipo');
    expect(html).not.toMatch(/<input[^>]*aria-label="Capacidad de Ana/);
  });

  it('casilla «Contar sólo días hábiles (RD)»: marcada según el ajuste y deshabilitada sin canEdit', () => {
    const editable = render({ businessDaysOnly: true });
    expect(editable).toContain('Contar sólo días hábiles (RD)');
    expect(editable).toMatch(/<input[^>]*type="checkbox"[^>]*checked=""/);
    expect(editable).not.toMatch(/<input[^>]*type="checkbox"[^>]*disabled=""/);

    const readOnly = render({ canEdit: false, businessDaysOnly: false });
    expect(readOnly).toContain('Contar sólo días hábiles (RD)');
    expect(readOnly).toMatch(/<input[^>]*type="checkbox"[^>]*disabled=""/);
    expect(readOnly).not.toMatch(/<input[^>]*type="checkbox"[^>]*checked=""/);
  });

  it('el diálogo de cierre no se pinta hasta pulsar «Cerrar sprint»', () => {
    const html = render({ sprints: [active] });
    expect(html).toContain('Cerrar sprint');
    expect(html).not.toContain('role="dialog"');
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

  it('con activeForecast, el sprint activo muestra el pronóstico y los planificados no', () => {
    const html = render({
      sprints: [active, planned],
      activeForecast: {
        forecast: {
          kind: 'forecast', remaining: 4, p50: '2026-11-10', p70: '2026-11-12', p85: '2026-11-15',
          probability: 0.7, targetDate: '2026-11-16',
        },
        backtest: { hits: 8, total: 10, enough: true },
        today: '2026-11-05',
      },
    });
    const activeCard = html.slice(html.indexOf('Sprint 7'), html.indexOf('Sprint 8'));
    const plannedCard = html.slice(html.indexOf('Sprint 8'));
    expect(activeCard).toContain('Probabilidad de llegar al 16 nov: 70 %. Fecha al 85 %: 15 nov');
    expect(activeCard).toContain('Rango: 50 % 10 nov · 70 % 12 nov · 85 % 15 nov');
    expect(activeCard).toContain('Acierto hacia atrás: 8 de 10 dentro del rango del 85 %');
    expect(plannedCard).not.toContain('Probabilidad');
    expect(plannedCard).not.toContain('Rango:');
  });

  it('sin activeForecast no hay texto de pronóstico', () => {
    const html = render({ sprints: [active, planned] });
    expect(html).not.toContain('Probabilidad');
    expect(html).not.toContain('Rango:');
    expect(html).not.toContain('Pronóstico');
    expect(html).not.toContain('Acierto');
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

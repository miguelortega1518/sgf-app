import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SharedProjectView } from '../src/components/share/shared-project-view';
import { buildSharedProjectView, type SharedViewTask } from '../src/lib/share-view';
import type { ProjectForecast } from '../src/lib/forecast';

const TODAY = '2026-11-23';

function task(id: string, overrides: Partial<SharedViewTask>): SharedViewTask {
  return {
    id,
    title: `Tarea ${id}`,
    status: 'no_iniciada',
    dueDate: null,
    blockedByArea: null,
    milestoneId: null,
    sprintId: null,
    completedAt: null,
    createdAt: new Date('2026-10-01T12:00:00Z'),
    archived: false,
    ...overrides,
  };
}

const forecast: ProjectForecast = {
  activeSprint: {
    id: 's1',
    forecast: {
      kind: 'forecast', remaining: 3, p50: '2026-11-28', p70: '2026-11-30', p85: '2026-12-02',
      probability: 0.7, targetDate: '2026-11-30',
    },
  },
  milestones: [
    { id: 'm1', forecast: { kind: 'insufficient', closedTasks: 4, historyWeeks: 2 } },
    { id: 'm2', forecast: { kind: 'done' } },
  ],
  backtest: { hits: 6, total: 8, enough: true },
};

function view() {
  return buildSharedProjectView({
    space: { name: 'Portal de proveedores', objective: 'Facturas en línea', declaredHealth: 'amarillo', status: 'activo' },
    milestones: [
      { id: 'm1', name: 'Piloto con Compras', targetDate: '2026-12-10', completed: false, order: 1, createdAt: new Date() },
      { id: 'm2', name: 'Capacitación', targetDate: '2026-12-20', completed: false, order: 2, createdAt: new Date() },
      { id: 'm3', name: 'Diseño aprobado', targetDate: '2026-11-01', completed: true, order: 0, createdAt: new Date() },
    ],
    tasks: [
      task('1', { title: 'Formulario de alta', status: 'en_proceso', sprintId: 's1', milestoneId: 'm1' }),
      task('2', { title: 'Pantalla de consulta', status: 'en_revision', sprintId: 's1' }),
      task('3', { title: 'Orden de compra', status: 'bloqueada', blockedByArea: 'compras', sprintId: 's1' }),
      task('4', { title: 'Contrato marco', status: 'en_proceso', dueDate: '2026-11-18' }),
      task('5', { title: 'Logo', status: 'completada', completedAt: new Date('2026-11-10') }),
    ],
    forecast,
    today: TODAY,
  });
}

function render(v = view()) {
  return renderToStaticMarkup(createElement(SharedProjectView, { view: v }));
}

describe('SharedProjectView', () => {
  it('pinta nombre, objetivo, salud declarada y avance', () => {
    const html = render();
    expect(html).toContain('Portal de proveedores');
    expect(html).toContain('Facturas en línea');
    expect(html).toContain('Requiere atención');
    expect(html).toContain('20 % completado');
  });

  it('usa el vocabulario para no técnicos', () => {
    const html = render();
    expect(html).toContain('En curso');
    expect(html).toContain('Esperando revisión');
    expect(html).toContain('Bloqueado por Compras');
    expect(html).toContain('Vencida desde el 18 nov');
    expect(html).toContain('Contrato marco');
  });

  it('no contiene jerga, correos ni personas', () => {
    const html = render();
    expect(html).not.toContain('PR');
    expect(html).not.toContain('FOR-');
    expect(html.toLowerCase()).not.toContain('code review');
    expect(html).not.toContain('En progreso');
    expect(html).not.toContain('@');
  });

  it('pinta los hitos con fecha, estado y pronóstico', () => {
    const html = render();
    expect(html).toContain('Piloto con Compras');
    expect(html).toContain('10 dic');
    expect(html).toContain('Diseño aprobado');
    expect(html).toContain('Cumplido');
    expect(html).toContain('Pronóstico disponible cuando haya más historial (4 de 15 tareas)');
  });

  it('un hito sin tareas dice «Sin tareas todavía» y no «Todo el trabajo está terminado»', () => {
    const html = render();
    const capacitacion = html.slice(html.indexOf('Capacitación'));
    expect(capacitacion).toContain('Sin tareas todavía');
    expect(html).not.toContain('Todo el trabajo está terminado');
  });

  it('pinta el pronóstico del sprint activo con ForecastSummary', () => {
    const html = render();
    expect(html).toContain('Probabilidad de llegar al 30 nov: 70 %');
  });

  it('proyecto sin tareas: «Sin tareas todavía» y sin porcentaje', () => {
    const empty = buildSharedProjectView({
      space: { name: 'Nuevo', objective: null, declaredHealth: null, status: 'activo' },
      milestones: [],
      tasks: [],
      forecast: { activeSprint: null, milestones: [], backtest: { hits: 0, total: 0, enough: false } },
      today: TODAY,
    });
    const html = render(empty);
    expect(html).toContain('Sin tareas todavía');
    expect(html).toContain('Sin declarar');
    expect(html).not.toContain('%');
    expect(html).toContain('No hay riesgos señalados');
  });
});

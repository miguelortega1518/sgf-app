import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KanbanBoard, TaskCardBoard, type BoardTask } from '../src/components/tasks/kanban-board';

const baseTask: BoardTask = {
  id: 'task-1',
  number: 8,
  title: 'Filtros guardados en el tablero',
  status: 'en_proceso',
  priority: 'normal',
  dueDate: '2026-11-13',
  dueDateOriginal: null,
  responsibleName: 'Ileana Pérez',
  companyName: null,
  blockedByArea: null,
  requiresApproval: false,
};

const noop = () => {};

const render = (task: Partial<BoardTask>) =>
  renderToStaticMarkup(createElement(TaskCardBoard, {
    task: { ...baseTask, ...task },
    dragging: false,
    readOnly: true,
    onDragStart: noop,
    onDragEnd: noop,
    onMove: noop,
  }));

describe('TaskCardBoard: fecha límite relativa', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-12T15:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('muestra la fecha absoluta y "Mañana" si vence mañana', () => {
    const html = render({ dueDate: '2026-11-13' });
    expect(html).toContain('13/11/2026');
    expect(html).toContain('Mañana');
  });

  it('muestra "en 2 días" si vence en dos días', () => {
    const html = render({ dueDate: '2026-11-14' });
    expect(html).toContain('14/11/2026');
    expect(html).toContain('en 2 días');
  });

  it('en una tarea vencida la fecha y el texto relativo van en rojo', () => {
    const html = render({ dueDate: '2026-11-11' });
    expect(html).toMatch(/<span class="[^"]*shrink-0[^"]*text-red-700[^"]*">11\/11\/2026<\/span>/);
    expect(html).toMatch(/<span class="[^"]*text-red-700[^"]*"[^>]*>·\s*Ayer<\/span>/);
  });

  it('el texto relativo nunca se recorta: la fila hace wrap y fecha + relativo van juntos sin encogerse', () => {
    const html = render({ dueDate: '2026-07-15', estimate: 13 });
    expect(html).toContain('13 pts');
    // Nada de truncate/ellipsis en la tarjeta del tablero para la fecha.
    expect(html).not.toMatch(/<span class="[^"]*truncate[^"]*"[^>]*>·/);
    // Fecha absoluta y relativa dentro de un mismo bloque que no se encoge.
    expect(html).toMatch(/<span class="[^"]*shrink-0[^"]*"><span class="[^"]*">15\/07\/2026<\/span><span class="[^"]*">·\s*hace 120 días<\/span><\/span>/);
    // La fila de metadatos puede pasar a una segunda línea en columnas estrechas.
    expect(html).toMatch(/<div class="[^"]*flex-wrap[^"]*"/);
    // El avatar sigue alineado al final.
    expect(html).toMatch(/<span class="ml-auto[^"]*shrink-0[^"]*" title="Ileana Pérez">IP<\/span>/);
  });

  it('una tarea completada muestra solo la fecha absoluta', () => {
    const html = render({ status: 'completada', dueDate: '2026-11-13' });
    expect(html).toContain('13/11/2026');
    expect(html).not.toContain('Mañana');
  });
});

describe('KanbanBoard: límites de trabajo en curso', () => {
  const tasks: BoardTask[] = [
    { ...baseTask, id: 'a', number: 1, status: 'en_proceso' },
    { ...baseTask, id: 'b', number: 2, status: 'en_revision' },
    { ...baseTask, id: 'c', number: 3, status: 'no_iniciada' },
  ];
  const renderBoard = (props: Record<string, unknown>) =>
    renderToStaticMarkup(createElement(KanbanBoard, { tasks, readOnly: true, onMove: async () => true, ...props }));
  const section = (html: string, label: string) =>
    html.match(new RegExp(`<section[^>]*aria-label="${label}[^"]*"[^>]*>[\\s\\S]*?</header>`))?.[0] ?? '';

  it('con límite superado muestra «3/2» en rojo y el aviso en el aria-label de la columna', () => {
    const html = renderBoard({ wipLimits: { en_proceso: 2, en_revision: null }, wipCounts: { en_proceso: 3 } });
    const col = section(html, 'En progreso');
    expect(col).toContain('data-wip-state="over"');
    expect(col).toContain('3/2');
    expect(col).toContain('bg-red-100');
    // Las tarjetas visibles (1, p. ej. con filtros) y el recuento WIP del proyecto (3) pueden diferir.
    expect(col).toMatch(/aria-label="En progreso, 1 tarea\. Límite de trabajo en curso superado: 3 de 2"/);
    // En code review no tiene límite: sólo el número de tarjetas.
    const review = section(html, 'En code review');
    expect(review).not.toContain('data-wip-state');
    expect(review).toMatch(/aria-label="En code review, 1 tarea"/);
  });

  it('sin límites las cabeceras no cambian', () => {
    const html = renderBoard({});
    expect(html).not.toContain('data-wip-state');
    expect(section(html, 'En progreso')).toMatch(/aria-label="En progreso, 1 tarea"/);
  });

  it('Por hacer nunca muestra límite', () => {
    const html = renderBoard({ wipLimits: { en_proceso: 1, en_revision: 1 }, wipCounts: { no_iniciada: 9 } });
    expect(section(html, 'Por hacer')).not.toContain('data-wip-state');
  });
});

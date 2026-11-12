import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskCardBoard, type BoardTask } from '../src/components/tasks/kanban-board';

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

  it('en una tarea vencida el texto relativo va en rojo junto a la fecha', () => {
    const html = render({ dueDate: '2026-11-11' });
    expect(html).toMatch(/<span class="[^"]*text-red-700[^"]*">11\/11\/2026[^<]*·[^<]*Ayer<\/span>/);
  });

  it('una tarea completada muestra solo la fecha absoluta', () => {
    const html = render({ status: 'completada', dueDate: '2026-11-13' });
    expect(html).toContain('13/11/2026');
    expect(html).not.toContain('Mañana');
  });
});

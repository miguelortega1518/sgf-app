import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskCard } from '../src/components/tasks/task-card';

type Task = Parameters<typeof TaskCard>[0]['task'];

const baseTask: Task = {
  id: 'task-1',
  number: 7,
  title: 'Timeout en el login con VPN activa',
  status: 'en_proceso',
  dueDate: '2026-11-13',
  dueDateOriginal: null,
  priority: 'normal',
  spaceName: 'Sprint 24',
  spaceType: 'proyecto',
  companyName: null,
  blockedByArea: null,
};

const render = (task: Partial<Task>, isOverdue = false) =>
  renderToStaticMarkup(createElement(TaskCard, { task: { ...baseTask, ...task }, isOverdue }));

describe('TaskCard: fecha límite relativa', () => {
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

  it('en una tarea vencida muestra el texto relativo y el icono de vencida', () => {
    const html = render({ dueDate: '2026-11-09' }, true);
    expect(html).toContain('09/11/2026');
    expect(html).toContain('hace 3 días');
    expect(html).toContain('aria-label="Vencida"');
  });

  it('una tarea completada muestra solo la fecha absoluta', () => {
    const html = render({ status: 'completada', dueDate: '2026-11-13' });
    expect(html).toContain('13/11/2026');
    expect(html).not.toContain('Mañana');
  });

  it('una tarea sin fecha límite no muestra texto relativo', () => {
    const html = render({ dueDate: null });
    expect(html).not.toContain('Hoy');
    expect(html).not.toContain('días');
  });
});

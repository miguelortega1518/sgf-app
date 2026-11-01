import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildNewTaskPayload, NewTaskForm } from '../src/components/tasks/new-task-form';

describe('NewTaskForm', () => {
  it('renders a visible, accessible optional description field', () => {
    const html = renderToStaticMarkup(createElement(NewTaskForm, {
      spaceId: 'space-1',
      people: [],
      companies: [],
      onCreated: () => {},
      onCancel: () => {},
    }));

    expect(html).toContain('Descripción (opcional)');
    expect(html).toContain('for="task-description"');
    expect(html).toContain('<textarea id="task-description"');
    expect(html).toContain('maxLength="5000"');
  });
});

describe('buildNewTaskPayload', () => {
  it('includes the entered description in the task creation payload', () => {
    const payload = buildNewTaskPayload({
      spaceId: 'space-1',
      title: 'Preparar presupuesto',
      description: '  Reunir cifras y validar supuestos.  ',
      responsibleId: 'person-1',
      companyId: '',
      dueDate: '',
      kind: 'feature',
      estimate: '',
      requiresApproval: true,
    });

    expect(payload).toEqual({
      spaceId: 'space-1',
      title: 'Preparar presupuesto',
      description: 'Reunir cifras y validar supuestos.',
      responsibleId: 'person-1',
      kind: 'feature',
      requiresApproval: true,
    });
  });

  it('omits an empty optional description', () => {
    const payload = buildNewTaskPayload({
      spaceId: 'space-1',
      title: 'Preparar presupuesto',
      description: '   ',
      responsibleId: 'person-1',
      companyId: '',
      dueDate: '',
      kind: 'feature',
      estimate: '',
      requiresApproval: true,
    });

    expect(payload).not.toHaveProperty('description');
  });
});

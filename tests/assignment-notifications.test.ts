import { describe, expect, it } from 'vitest';
import { buildAssignmentNotifications } from '../src/lib/assignment-notifications';

const actor = crypto.randomUUID();
const ana = crypto.randomUUID();
const beto = crypto.randomUUID();
const carla = crypto.randomUUID();
const taskId = crypto.randomUUID();

function task(overrides: Partial<{ number: number | null; responsibleId: string; reviewerId: string | null }> = {}) {
  return {
    id: taskId,
    number: 12 as number | null,
    title: 'Filtros guardados',
    responsibleId: ana,
    reviewerId: null as string | null,
    ...overrides,
  };
}

describe('buildAssignmentNotifications: creación', () => {
  it('avisa task_assigned al responsable ajeno con el título exacto', () => {
    const intents = buildAssignmentNotifications({ actorId: actor, task: task(), previous: null, notifyReviewer: false });
    expect(intents).toEqual([
      {
        recipientId: ana,
        type: 'task_assigned',
        title: 'Te asignaron: FOR-12 Filtros guardados',
        body: 'Ahora eres responsable de esta tarea.',
        taskId,
      },
    ]);
  });

  it('no avisa si el actor se autoasigna', () => {
    const intents = buildAssignmentNotifications({
      actorId: actor, task: task({ responsibleId: actor }), previous: null, notifyReviewer: false,
    });
    expect(intents).toEqual([]);
  });

  it('no avisa al revisor si notifyReviewer es false', () => {
    const intents = buildAssignmentNotifications({
      actorId: actor, task: task({ responsibleId: actor, reviewerId: beto }), previous: null, notifyReviewer: false,
    });
    expect(intents).toEqual([]);
  });

  it('avisa review_assigned al revisor si notifyReviewer es true', () => {
    const intents = buildAssignmentNotifications({
      actorId: actor, task: task({ responsibleId: actor, reviewerId: beto }), previous: null, notifyReviewer: true,
    });
    expect(intents).toEqual([
      {
        recipientId: beto,
        type: 'review_assigned',
        title: 'Te pidieron revisar: FOR-12 Filtros guardados',
        body: 'Te asignaron como revisor de esta tarea.',
        taskId,
      },
    ]);
  });

  it('no avisa al revisor si es el actor', () => {
    const intents = buildAssignmentNotifications({
      actorId: actor, task: task({ responsibleId: actor, reviewerId: actor }), previous: null, notifyReviewer: true,
    });
    expect(intents).toEqual([]);
  });

  it('sin number, el título no lleva espacio inicial', () => {
    const intents = buildAssignmentNotifications({
      actorId: actor, task: task({ number: null, reviewerId: beto }), previous: null, notifyReviewer: true,
    });
    expect(intents.map(i => i.title)).toEqual([
      'Te asignaron: Filtros guardados',
      'Te pidieron revisar: Filtros guardados',
    ]);
  });
});

describe('buildAssignmentNotifications: cambios', () => {
  it('al cambiar de responsable avisa sólo a la persona nueva', () => {
    const intents = buildAssignmentNotifications({
      actorId: actor,
      task: task({ responsibleId: beto }),
      previous: { responsibleId: ana, reviewerId: null },
      notifyReviewer: false,
    });
    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({ recipientId: beto, type: 'task_assigned' });
    expect(intents.some(i => i.recipientId === ana)).toBe(false);
  });

  it('no avisa si el responsable no cambia', () => {
    const intents = buildAssignmentNotifications({
      actorId: actor,
      task: task({ responsibleId: ana }),
      previous: { responsibleId: ana, reviewerId: null },
      notifyReviewer: false,
    });
    expect(intents).toEqual([]);
  });

  it('no avisa si el nuevo responsable es el actor', () => {
    const intents = buildAssignmentNotifications({
      actorId: actor,
      task: task({ responsibleId: actor }),
      previous: { responsibleId: ana, reviewerId: null },
      notifyReviewer: false,
    });
    expect(intents).toEqual([]);
  });

  it('avisa review_assigned al revisor nuevo', () => {
    const intents = buildAssignmentNotifications({
      actorId: actor,
      task: task({ reviewerId: carla }),
      previous: { responsibleId: ana, reviewerId: beto },
      notifyReviewer: true,
    });
    expect(intents).toEqual([
      expect.objectContaining({ recipientId: carla, type: 'review_assigned' }),
    ]);
  });

  it('no avisa si el revisor pasa a nulo', () => {
    const intents = buildAssignmentNotifications({
      actorId: actor,
      task: task({ reviewerId: null }),
      previous: { responsibleId: ana, reviewerId: beto },
      notifyReviewer: true,
    });
    expect(intents).toEqual([]);
  });

  it('no avisa si el revisor no cambia', () => {
    const intents = buildAssignmentNotifications({
      actorId: actor,
      task: task({ reviewerId: beto }),
      previous: { responsibleId: ana, reviewerId: beto },
      notifyReviewer: true,
    });
    expect(intents).toEqual([]);
  });

  it('la misma persona nueva como responsable y revisora recibe dos avisos', () => {
    const intents = buildAssignmentNotifications({
      actorId: actor,
      task: task({ responsibleId: carla, reviewerId: carla }),
      previous: { responsibleId: ana, reviewerId: beto },
      notifyReviewer: true,
    });
    expect(intents.map(i => [i.recipientId, i.type])).toEqual([
      [carla, 'task_assigned'],
      [carla, 'review_assigned'],
    ]);
  });
});

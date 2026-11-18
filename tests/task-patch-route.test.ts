import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  const txSelect = vi.fn();
  const txUpdate = vi.fn();
  const txSet = vi.fn();
  return {
    requireSession: vi.fn(),
    requireTaskAccess: vi.fn(),
    requireProjectAccess: vi.fn(),
    validateTaskReferences: vi.fn(),
    logAudit: vi.fn(),
    notify: vi.fn(),
    select: vi.fn(),
    transaction: vi.fn(),
    txSelect,
    txUpdate,
    txSet,
    tx: { select: txSelect, update: txUpdate },
  };
});

vi.mock('@/lib/auth', () => ({ requireSession: mocks.requireSession }));
vi.mock('@/lib/db', () => ({ db: { select: mocks.select, transaction: mocks.transaction } }));
vi.mock('@/lib/audit', () => ({ logAudit: mocks.logAudit }));
vi.mock('@/lib/notify', () => ({ notify: mocks.notify }));
vi.mock('@/lib/project-access', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/project-access')>()),
  requireTaskAccess: mocks.requireTaskAccess,
  requireProjectAccess: mocks.requireProjectAccess,
  validateTaskReferences: mocks.validateTaskReferences,
}));

import { PATCH } from '../src/app/api/tasks/[id]/route';
import { logger } from '../src/lib/logger';

const taskId = crypto.randomUUID();
const userId = crypto.randomUUID();
const spaceId = crypto.randomUUID();
const ana = crypto.randomUUID();
const beto = crypto.randomUUID();
const carla = crypto.randomUUID();

type TaskRow = { id: string; number: number; title: string; spaceId: string; responsibleId: string; reviewerId: string | null; dueDate: string | null; sprintId: string | null };

let current: TaskRow;

function ctx() {
  return { params: Promise.resolve({ id: taskId }) };
}

function patchRequest(body: unknown) {
  return new NextRequest(`http://localhost/api/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function chain(result: unknown) {
  const builder: Record<string, unknown> = {};
  for (const method of ['from', 'where', 'limit', 'for']) builder[method] = () => builder;
  builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

function httpError(message: string, httpStatus: number) {
  return Object.assign(new Error(message), { httpStatus });
}

beforeEach(() => {
  vi.clearAllMocks();
  current = {
    id: taskId, number: 12, title: 'Filtros guardados', spaceId,
    responsibleId: ana, reviewerId: null, dueDate: null, sprintId: null,
  };
  mocks.requireSession.mockResolvedValue({ id: userId, role: 'miembro' });
  mocks.requireTaskAccess.mockImplementation(async () => ({ ...current }));
  mocks.select.mockImplementation(() => chain([{ id: spaceId, ownerId: userId, type: 'equipo', leaderId: null }]));
  mocks.requireProjectAccess.mockResolvedValue({ id: spaceId });
  mocks.validateTaskReferences.mockResolvedValue(undefined);
  mocks.logAudit.mockResolvedValue(undefined);
  mocks.notify.mockResolvedValue(null);
  mocks.txSelect.mockImplementation(() => chain([{ ...current }]));
  mocks.txUpdate.mockReturnValue({ set: mocks.txSet });
  mocks.txSet.mockImplementation((input: Record<string, unknown>) => {
    const builder = { where: () => builder, returning: async () => [{ ...current, ...input }] };
    return builder;
  });
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mocks.tx));
});

afterEach(() => {
  vi.restoreAllMocks();
});

function intentsOfType(type: string) {
  return mocks.notify.mock.calls.map(c => c[0]).filter(i => i.type === type);
}

describe('PATCH /api/tasks/[id] (campos): avisos de asignación', () => {
  it('al cambiar de responsable avisa task_assigned sólo al nuevo', async () => {
    const res = await PATCH(patchRequest({ responsibleId: beto }), ctx());

    expect(res.status).toBe(200);
    expect(mocks.notify).toHaveBeenCalledTimes(1);
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({
      recipientId: beto,
      type: 'task_assigned',
      taskId,
      title: 'Te asignaron: FOR-12 Filtros guardados',
    }));
    expect(mocks.notify.mock.calls.some(c => c[0].recipientId === ana)).toBe(false);
  });

  it('envía los avisos después de cerrar la transacción', async () => {
    let notifyCallsInsideTx = -1;
    mocks.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const result = await fn(mocks.tx);
      notifyCallsInsideTx = mocks.notify.mock.calls.length;
      return result;
    });

    const res = await PATCH(patchRequest({ responsibleId: beto }), ctx());

    expect(res.status).toBe(200);
    expect(notifyCallsInsideTx).toBe(0);
    expect(mocks.notify).toHaveBeenCalledTimes(1);
    expect(mocks.notify.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.logAudit.mock.invocationCallOrder[0]);
  });

  it('sigue auditando responsible_changed dentro del tx', async () => {
    await PATCH(patchRequest({ responsibleId: beto }), ctx());

    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'responsible_changed', previousValue: ana, newValue: beto }),
      mocks.tx,
    );
  });

  it('no avisa si el responsable es el mismo', async () => {
    const res = await PATCH(patchRequest({ responsibleId: ana }), ctx());

    expect(res.status).toBe(200);
    expect(intentsOfType('task_assigned')).toEqual([]);
  });

  it('no avisa si el PATCH no trae responsibleId', async () => {
    const res = await PATCH(patchRequest({ title: 'Nuevo título' }), ctx());

    expect(res.status).toBe(200);
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('no avisa si el nuevo responsable es quien hace el cambio', async () => {
    const res = await PATCH(patchRequest({ responsibleId: userId }), ctx());

    expect(res.status).toBe(200);
    expect(intentsOfType('task_assigned')).toEqual([]);
  });

  it('avisa review_assigned al asignar revisor', async () => {
    const res = await PATCH(patchRequest({ reviewerId: carla }), ctx());

    expect(res.status).toBe(200);
    expect(intentsOfType('review_assigned')).toEqual([
      expect.objectContaining({
        recipientId: carla,
        taskId,
        title: 'Te pidieron revisar: FOR-12 Filtros guardados',
      }),
    ]);
    expect(intentsOfType('task_assigned')).toEqual([]);
  });

  it('no avisa al quitar el revisor (reviewerId null)', async () => {
    current.reviewerId = beto;

    const res = await PATCH(patchRequest({ reviewerId: null }), ctx());

    expect(res.status).toBe(200);
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('no avisa si el revisor no cambia', async () => {
    current.reviewerId = beto;

    const res = await PATCH(patchRequest({ reviewerId: beto }), ctx());

    expect(res.status).toBe(200);
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('la misma persona como responsable y revisora recibe los dos avisos', async () => {
    const res = await PATCH(patchRequest({ responsibleId: carla, reviewerId: carla }), ctx());

    expect(res.status).toBe(200);
    expect(mocks.notify.mock.calls.map(c => [c[0].recipientId, c[0].type])).toEqual([
      [carla, 'task_assigned'],
      [carla, 'review_assigned'],
    ]);
  });

  it('responde 200 con la tarea aunque notify rechace', async () => {
    mocks.notify.mockRejectedValue(new Error('smtp caído'));

    const res = await PATCH(patchRequest({ responsibleId: beto }), ctx());

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: taskId, responsibleId: beto });
  });

  it('no llama a notify si zod rechaza el cuerpo (400)', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    const res = await PATCH(patchRequest({ responsibleId: 'no-es-uuid' }), ctx());

    expect(res.status).toBe(400);
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('no llama a notify sin permisos sobre la tarea (403)', async () => {
    mocks.requireTaskAccess.mockRejectedValue(httpError('Sin acceso a esta tarea', 403));

    const res = await PATCH(patchRequest({ responsibleId: beto }), ctx());

    expect(res.status).toBe(403);
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('no llama a notify si se pierde el acceso dentro del tx (403)', async () => {
    mocks.requireProjectAccess.mockRejectedValue(httpError('Sin permisos de escritura en este proyecto', 403));

    const res = await PATCH(patchRequest({ responsibleId: beto }), ctx());

    expect(res.status).toBe(403);
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('no llama a notify si validateTaskReferences lanza 400', async () => {
    mocks.validateTaskReferences.mockRejectedValue(httpError('Responsable inválido', 400));

    const res = await PATCH(patchRequest({ responsibleId: beto }), ctx());

    expect(res.status).toBe(400);
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/tasks/[id] (campos): sprint de la tarea', () => {
  const sprintA = { id: crypto.randomUUID(), name: 'Sprint 7', status: 'activo' };
  const sprintB = { id: crypto.randomUUID(), name: 'Sprint 8', status: 'planificado' };

  /** Resultados de tx.select tras la relectura FOR UPDATE de la tarea. */
  function queueSprintLookups(...results: unknown[][]) {
    const queue: unknown[][] = [[{ ...current }], ...results];
    mocks.txSelect.mockImplementation(() => chain(queue.shift() ?? []));
  }

  function sprintAudits() {
    return mocks.logAudit.mock.calls.filter(c => c[0].action === 'task_sprint_changed');
  }

  it('sprint de otro proyecto o inexistente → 400 sin update ni auditoría', async () => {
    queueSprintLookups([]);

    const res = await PATCH(patchRequest({ sprintId: crypto.randomUUID() }), ctx());

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('El sprint no pertenece al proyecto');
    expect(mocks.txUpdate).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('sprint cerrado → 409 sin update ni auditoría', async () => {
    queueSprintLookups([{ ...sprintA, status: 'cerrado' }]);

    const res = await PATCH(patchRequest({ sprintId: sprintA.id }), ctx());

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('El sprint está cerrado');
    expect(mocks.txUpdate).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('del backlog a un sprint: update y task_sprint_changed con nombres, en el tx', async () => {
    queueSprintLookups([sprintA]);

    const res = await PATCH(patchRequest({ sprintId: sprintA.id }), ctx());

    expect(res.status).toBe(200);
    expect(mocks.txSet).toHaveBeenCalledWith(expect.objectContaining({ sprintId: sprintA.id }));
    expect(sprintAudits()).toEqual([[
      {
        actorId: userId,
        action: 'task_sprint_changed',
        taskId,
        spaceId,
        previousValue: 'Backlog',
        newValue: 'Sprint 7',
        reason: JSON.stringify({ from: null, to: sprintA.id }),
      },
      mocks.tx,
    ]]);
  });

  it('de un sprint a otro: valores con los dos nombres, nunca UUID', async () => {
    current.sprintId = sprintA.id;
    queueSprintLookups([sprintB], [{ name: sprintA.name }]);

    const res = await PATCH(patchRequest({ sprintId: sprintB.id }), ctx());

    expect(res.status).toBe(200);
    expect(sprintAudits()).toHaveLength(1);
    expect(sprintAudits()[0][0]).toMatchObject({ previousValue: 'Sprint 7', newValue: 'Sprint 8' });
    // Los UUID sólo van en `reason` (referencia interna); los valores visibles son nombres.
    const { previousValue, newValue, reason } = sprintAudits()[0][0];
    for (const sprintId of [sprintA.id, sprintB.id]) {
      expect(previousValue).not.toContain(sprintId);
      expect(newValue).not.toContain(sprintId);
    }
    expect(JSON.parse(reason)).toEqual({ from: sprintA.id, to: sprintB.id });
  });

  it('sprintId null desde un sprint → newValue Backlog', async () => {
    current.sprintId = sprintA.id;
    queueSprintLookups([{ name: sprintA.name }]);

    const res = await PATCH(patchRequest({ sprintId: null }), ctx());

    expect(res.status).toBe(200);
    expect(mocks.txSet).toHaveBeenCalledWith(expect.objectContaining({ sprintId: null }));
    expect(sprintAudits()).toHaveLength(1);
    expect(sprintAudits()[0][0]).toMatchObject({
      previousValue: 'Sprint 7',
      newValue: 'Backlog',
      reason: JSON.stringify({ from: sprintA.id, to: null }),
    });
  });

  it('el mismo sprintId que ya tiene → sin auditoría', async () => {
    current.sprintId = sprintA.id;
    queueSprintLookups([sprintA]);

    const res = await PATCH(patchRequest({ sprintId: sprintA.id }), ctx());

    expect(res.status).toBe(200);
    expect(sprintAudits()).toEqual([]);
  });

  it('sprintId null sin sprint previo → sin auditoría', async () => {
    queueSprintLookups();

    const res = await PATCH(patchRequest({ sprintId: null }), ctx());

    expect(res.status).toBe(200);
    expect(sprintAudits()).toEqual([]);
  });

  it('sprintId no uuid → 400 sin registrar errores', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    const res = await PATCH(patchRequest({ sprintId: 'sprint-7' }), ctx());

    expect(res.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

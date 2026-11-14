import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  const txSelect = vi.fn();
  const txFrom = vi.fn();
  const txWhere = vi.fn();
  const txLimit = vi.fn();
  const txFor = vi.fn();
  const txInsert = vi.fn();
  const txValues = vi.fn();
  const txInsertReturning = vi.fn();
  const txUpdate = vi.fn();
  const txSet = vi.fn();
  const txUpdateWhere = vi.fn();
  const txUpdateReturning = vi.fn();
  const txDelete = vi.fn();
  const txDeleteWhere = vi.fn();
  return {
    requireSession: vi.fn(),
    requireTaskAccess: vi.fn(),
    logAudit: vi.fn(),
    transaction: vi.fn(),
    txSelect,
    txFrom,
    txWhere,
    txLimit,
    txFor,
    txInsert,
    txValues,
    txInsertReturning,
    txUpdate,
    txSet,
    txUpdateWhere,
    txUpdateReturning,
    txDelete,
    txDeleteWhere,
    tx: { select: txSelect, insert: txInsert, update: txUpdate, delete: txDelete },
  };
});

vi.mock('@/lib/auth', () => ({
  requireSession: mocks.requireSession,
}));
vi.mock('@/lib/db', () => ({
  db: { transaction: mocks.transaction },
}));
vi.mock('@/lib/audit', () => ({
  logAudit: mocks.logAudit,
}));
vi.mock('@/lib/project-access', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/project-access')>()),
  requireTaskAccess: mocks.requireTaskAccess,
}));
vi.mock('@/lib/db/schema', () => ({
  subtasks: { id: 'id', taskId: 'taskId', title: 'title', completed: 'completed', order: 'order' },
}));
vi.mock('drizzle-orm', () => ({
  and: (...conditions: unknown[]) => ({ operator: 'and', conditions }),
  eq: (left: unknown, right: unknown) => ({ operator: 'eq', left, right }),
  max: (column: unknown) => ({ operator: 'max', column }),
}));

import { POST, PATCH, DELETE } from '../src/app/api/tasks/[id]/subtasks/route';
import { logger } from '../src/lib/logger';

const taskId = crypto.randomUUID();
const subtaskId = crypto.randomUUID();
const userId = crypto.randomUUID();

const scopedWhere = {
  operator: 'and',
  conditions: [
    { operator: 'eq', left: 'id', right: subtaskId },
    { operator: 'eq', left: 'taskId', right: taskId },
  ],
};

function currentRow(overrides: Record<string, unknown> = {}) {
  return { id: subtaskId, taskId, title: 'Sub', completed: false, order: 1, ...overrides };
}

function ctx() {
  return { params: Promise.resolve({ id: taskId }) };
}

function jsonRequest(method: 'POST' | 'PATCH', body: unknown) {
  return new NextRequest(`http://localhost/api/tasks/${taskId}/subtasks`, {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function deleteRequest(id?: string) {
  const query = id === undefined ? '' : `?subtaskId=${encodeURIComponent(id)}`;
  return new NextRequest(`http://localhost/api/tasks/${taskId}/subtasks${query}`, {
    method: 'DELETE',
  });
}

describe('/api/tasks/[id]/subtasks', () => {
  let loggerError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    loggerError = vi.spyOn(logger, 'error').mockImplementation(() => {});
    mocks.requireSession.mockResolvedValue({ id: userId, role: 'miembro' });
    mocks.requireTaskAccess.mockResolvedValue({ id: taskId, title: 'Tarea' });
    mocks.logAudit.mockResolvedValue(undefined);
    mocks.transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(mocks.tx));

    // Lectura con bloqueo: select → from → where → limit → for.
    mocks.txSelect.mockReturnValue({ from: mocks.txFrom });
    mocks.txFrom.mockReturnValue({ where: mocks.txWhere });
    mocks.txWhere.mockReturnValue({ limit: mocks.txLimit });
    mocks.txLimit.mockReturnValue({ for: mocks.txFor });
    mocks.txFor.mockResolvedValue([currentRow()]);

    mocks.txInsert.mockReturnValue({ values: mocks.txValues });
    mocks.txValues.mockReturnValue({ returning: mocks.txInsertReturning });
    mocks.txInsertReturning.mockResolvedValue([currentRow({ title: 'Título', order: 3 })]);

    mocks.txUpdate.mockReturnValue({ set: mocks.txSet });
    mocks.txSet.mockReturnValue({ where: mocks.txUpdateWhere });
    mocks.txUpdateWhere.mockReturnValue({ returning: mocks.txUpdateReturning });
    mocks.txUpdateReturning.mockResolvedValue([currentRow({ completed: true })]);

    mocks.txDelete.mockReturnValue({ where: mocks.txDeleteWhere });
    mocks.txDeleteWhere.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST', () => {
    beforeEach(() => {
      // El máximo de `order` se lee directamente con select → from → where.
      mocks.txWhere.mockResolvedValue([{ max: 2 }]);
    });

    it('registra subtask_added en la misma transacción', async () => {
      const response = await POST(jsonRequest('POST', { title: 'Título' }), ctx());

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual(currentRow({ title: 'Título', order: 3 }));
      expect(mocks.transaction).toHaveBeenCalledTimes(1);
      expect(mocks.txWhere).toHaveBeenCalledWith({ operator: 'eq', left: 'taskId', right: taskId });
      expect(mocks.txValues).toHaveBeenCalledWith({ taskId, title: 'Título', order: 3 });
      expect(mocks.logAudit).toHaveBeenCalledTimes(1);
      expect(mocks.logAudit).toHaveBeenCalledWith(
        { actorId: userId, action: 'subtask_added', taskId, newValue: 'Título' },
        mocks.tx,
      );
      expect(mocks.logAudit.mock.calls[0][0]).not.toHaveProperty('previousValue');
    });

    it('responde 400 con título vacío, sin transacción ni auditoría', async () => {
      const response = await POST(jsonRequest('POST', { title: '   ' }), ctx());

      expect(response.status).toBe(400);
      expect(mocks.transaction).not.toHaveBeenCalled();
      expect(mocks.logAudit).not.toHaveBeenCalled();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('responde 403 a un observador, sin auditar', async () => {
      mocks.requireSession.mockResolvedValue({ id: userId, role: 'observador' });

      const response = await POST(jsonRequest('POST', { title: 'Título' }), ctx());

      expect(response.status).toBe(403);
      expect(mocks.transaction).not.toHaveBeenCalled();
      expect(mocks.logAudit).not.toHaveBeenCalled();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('responde 401 sin sesión, sin auditar', async () => {
      mocks.requireSession.mockRejectedValue(new Error('UNAUTHORIZED'));

      const response = await POST(jsonRequest('POST', { title: 'Título' }), ctx());

      expect(response.status).toBe(401);
      expect(mocks.transaction).not.toHaveBeenCalled();
      expect(mocks.logAudit).not.toHaveBeenCalled();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('no responde 2xx si falla la auditoría dentro de la transacción', async () => {
      mocks.logAudit.mockRejectedValue(new Error('audit failed'));

      const response = await POST(jsonRequest('POST', { title: 'Título' }), ctx());

      expect(mocks.logAudit).toHaveBeenCalledTimes(1);
      expect(response.status).toBe(500);
      expect(loggerError).toHaveBeenCalled();
    });
  });

  describe('PATCH', () => {
    it('lee la subtarea con bloqueo acotada a id y taskId', async () => {
      const response = await PATCH(jsonRequest('PATCH', { subtaskId, completed: true }), ctx());

      expect(response.status).toBe(200);
      expect(mocks.transaction).toHaveBeenCalledTimes(1);
      expect(mocks.txWhere).toHaveBeenCalledWith(scopedWhere);
      expect(mocks.txLimit).toHaveBeenCalledWith(1);
      expect(mocks.txFor).toHaveBeenCalledWith('update');
    });

    it('registra subtask_completion_changed al marcarla hecha', async () => {
      const response = await PATCH(jsonRequest('PATCH', { subtaskId, completed: true }), ctx());

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(currentRow({ completed: true }));
      expect(mocks.txUpdate).toHaveBeenCalledTimes(1);
      expect(mocks.txSet).toHaveBeenCalledWith({ completed: true });
      expect(mocks.txUpdateWhere).toHaveBeenCalledWith(scopedWhere);
      expect(mocks.logAudit).toHaveBeenCalledTimes(1);
      expect(mocks.logAudit).toHaveBeenCalledWith(
        {
          actorId: userId,
          action: 'subtask_completion_changed',
          taskId,
          previousValue: 'Sub: Pendiente',
          newValue: 'Sub: Hecha',
        },
        mocks.tx,
      );
    });

    it('registra subtask_completion_changed al marcarla pendiente', async () => {
      mocks.txFor.mockResolvedValue([currentRow({ completed: true })]);
      mocks.txUpdateReturning.mockResolvedValue([currentRow({ completed: false })]);

      const response = await PATCH(jsonRequest('PATCH', { subtaskId, completed: false }), ctx());

      expect(response.status).toBe(200);
      expect(mocks.txSet).toHaveBeenCalledWith({ completed: false });
      expect(mocks.logAudit).toHaveBeenCalledTimes(1);
      expect(mocks.logAudit).toHaveBeenCalledWith(
        {
          actorId: userId,
          action: 'subtask_completion_changed',
          taskId,
          previousValue: 'Sub: Hecha',
          newValue: 'Sub: Pendiente',
        },
        mocks.tx,
      );
    });

    it('registra subtask_renamed al cambiar sólo el título', async () => {
      mocks.txUpdateReturning.mockResolvedValue([currentRow({ title: 'Nuevo' })]);

      const response = await PATCH(jsonRequest('PATCH', { subtaskId, title: 'Nuevo' }), ctx());

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(currentRow({ title: 'Nuevo' }));
      expect(mocks.txSet).toHaveBeenCalledWith({ title: 'Nuevo' });
      expect(mocks.logAudit).toHaveBeenCalledTimes(1);
      expect(mocks.logAudit).toHaveBeenCalledWith(
        {
          actorId: userId,
          action: 'subtask_renamed',
          taskId,
          previousValue: 'Sub',
          newValue: 'Nuevo',
        },
        mocks.tx,
      );
    });

    it('con título y completed hace un solo update y dos registros en orden', async () => {
      mocks.txUpdateReturning.mockResolvedValue([currentRow({ title: 'Nuevo', completed: true })]);

      const response = await PATCH(
        jsonRequest('PATCH', { subtaskId, title: 'Nuevo', completed: true }),
        ctx(),
      );

      expect(response.status).toBe(200);
      expect(mocks.txUpdate).toHaveBeenCalledTimes(1);
      expect(mocks.txSet).toHaveBeenCalledWith({ title: 'Nuevo', completed: true });
      expect(mocks.logAudit).toHaveBeenCalledTimes(2);
      expect(mocks.logAudit).toHaveBeenNthCalledWith(
        1,
        {
          actorId: userId,
          action: 'subtask_renamed',
          taskId,
          previousValue: 'Sub',
          newValue: 'Nuevo',
        },
        mocks.tx,
      );
      expect(mocks.logAudit).toHaveBeenNthCalledWith(
        2,
        {
          actorId: userId,
          action: 'subtask_completion_changed',
          taskId,
          previousValue: 'Sub: Pendiente',
          newValue: 'Sub: Hecha',
        },
        mocks.tx,
      );
    });

    it('con valores iguales a los actuales responde la fila sin update ni auditoría', async () => {
      const response = await PATCH(
        jsonRequest('PATCH', { subtaskId, title: 'Sub', completed: false }),
        ctx(),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(currentRow());
      expect(mocks.txUpdate).not.toHaveBeenCalled();
      expect(mocks.logAudit).not.toHaveBeenCalled();
    });

    it('responde 404 si la subtarea no existe o es de otra tarea, sin update ni auditoría', async () => {
      mocks.txFor.mockResolvedValue([]);

      const response = await PATCH(jsonRequest('PATCH', { subtaskId, completed: true }), ctx());

      expect(response.status).toBe(404);
      expect((await response.json()).error).toBe('Subtarea no encontrada');
      expect(mocks.txUpdate).not.toHaveBeenCalled();
      expect(mocks.logAudit).not.toHaveBeenCalled();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('responde 400 "No hay cambios" sin campos, sin transacción ni auditoría', async () => {
      const response = await PATCH(jsonRequest('PATCH', { subtaskId }), ctx());

      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe('No hay cambios');
      expect(mocks.transaction).not.toHaveBeenCalled();
      expect(mocks.logAudit).not.toHaveBeenCalled();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it.each([
      ['con subtaskId no UUID', { subtaskId: 'no-es-uuid', completed: true }],
      ['sin subtaskId', { completed: true }],
      ['con título vacío', { subtaskId, title: '   ' }],
    ])('responde 400 %s, sin transacción ni auditoría', async (_label, body) => {
      const response = await PATCH(jsonRequest('PATCH', body), ctx());

      expect(response.status).toBe(400);
      expect(mocks.transaction).not.toHaveBeenCalled();
      expect(mocks.logAudit).not.toHaveBeenCalled();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('responde 403 a un observador, sin auditar', async () => {
      mocks.requireSession.mockResolvedValue({ id: userId, role: 'observador' });

      const response = await PATCH(jsonRequest('PATCH', { subtaskId, completed: true }), ctx());

      expect(response.status).toBe(403);
      expect(mocks.transaction).not.toHaveBeenCalled();
      expect(mocks.logAudit).not.toHaveBeenCalled();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('responde 401 sin sesión, sin auditar', async () => {
      mocks.requireSession.mockRejectedValue(new Error('UNAUTHORIZED'));

      const response = await PATCH(jsonRequest('PATCH', { subtaskId, completed: true }), ctx());

      expect(response.status).toBe(401);
      expect(mocks.transaction).not.toHaveBeenCalled();
      expect(mocks.logAudit).not.toHaveBeenCalled();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('no responde 2xx si falla la auditoría dentro de la transacción', async () => {
      mocks.logAudit.mockRejectedValue(new Error('audit failed'));

      const response = await PATCH(jsonRequest('PATCH', { subtaskId, completed: true }), ctx());

      expect(mocks.logAudit).toHaveBeenCalledTimes(1);
      expect(response.status).toBe(500);
      expect(loggerError).toHaveBeenCalled();
    });
  });

  describe('DELETE', () => {
    it('registra subtask_removed en la misma transacción', async () => {
      const response = await DELETE(deleteRequest(subtaskId), ctx());

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
      expect(mocks.transaction).toHaveBeenCalledTimes(1);
      expect(mocks.txWhere).toHaveBeenCalledWith(scopedWhere);
      expect(mocks.txLimit).toHaveBeenCalledWith(1);
      expect(mocks.txFor).toHaveBeenCalledWith('update');
      expect(mocks.txDelete).toHaveBeenCalledTimes(1);
      expect(mocks.txDeleteWhere).toHaveBeenCalledWith(scopedWhere);
      expect(mocks.logAudit).toHaveBeenCalledTimes(1);
      expect(mocks.logAudit).toHaveBeenCalledWith(
        { actorId: userId, action: 'subtask_removed', taskId, previousValue: 'Sub' },
        mocks.tx,
      );
      expect(mocks.logAudit.mock.calls[0][0]).not.toHaveProperty('newValue');
    });

    it('responde 404 si la subtarea no existe, sin borrar ni auditar', async () => {
      mocks.txFor.mockResolvedValue([]);

      const response = await DELETE(deleteRequest(subtaskId), ctx());

      expect(response.status).toBe(404);
      expect((await response.json()).error).toBe('Subtarea no encontrada');
      expect(mocks.txDelete).not.toHaveBeenCalled();
      expect(mocks.logAudit).not.toHaveBeenCalled();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it.each([
      ['sin subtaskId', undefined],
      ['con subtaskId no UUID', 'no-es-uuid'],
    ])('responde 400 %s, sin transacción ni auditoría', async (_label, id) => {
      const response = await DELETE(deleteRequest(id), ctx());

      expect(response.status).toBe(400);
      expect(mocks.transaction).not.toHaveBeenCalled();
      expect(mocks.logAudit).not.toHaveBeenCalled();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('responde 403 a un observador, sin auditar', async () => {
      mocks.requireSession.mockResolvedValue({ id: userId, role: 'observador' });

      const response = await DELETE(deleteRequest(subtaskId), ctx());

      expect(response.status).toBe(403);
      expect(mocks.transaction).not.toHaveBeenCalled();
      expect(mocks.logAudit).not.toHaveBeenCalled();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('responde 401 sin sesión, sin auditar', async () => {
      mocks.requireSession.mockRejectedValue(new Error('UNAUTHORIZED'));

      const response = await DELETE(deleteRequest(subtaskId), ctx());

      expect(response.status).toBe(401);
      expect(mocks.transaction).not.toHaveBeenCalled();
      expect(mocks.logAudit).not.toHaveBeenCalled();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('no responde 2xx si falla la auditoría dentro de la transacción', async () => {
      mocks.logAudit.mockRejectedValue(new Error('audit failed'));

      const response = await DELETE(deleteRequest(subtaskId), ctx());

      expect(mocks.logAudit).toHaveBeenCalledTimes(1);
      expect(response.status).toBe(500);
      expect(loggerError).toHaveBeenCalled();
    });
  });
});

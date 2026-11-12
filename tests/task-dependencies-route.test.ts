import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  const txExecute = vi.fn();
  const txInsert = vi.fn();
  const txValues = vi.fn();
  const txOnConflictDoNothing = vi.fn();
  const txInsertReturning = vi.fn();
  const txDelete = vi.fn();
  const txDeleteWhere = vi.fn();
  const txDeleteReturning = vi.fn();
  const txSelect = vi.fn();
  const txFrom = vi.fn();
  const txWhere = vi.fn();
  const txLimit = vi.fn();
  return {
    requireSession: vi.fn(),
    requireTaskAccess: vi.fn(),
    logAudit: vi.fn(),
    select: vi.fn(),
    transaction: vi.fn(),
    txExecute,
    txInsert,
    txValues,
    txOnConflictDoNothing,
    txInsertReturning,
    txDelete,
    txDeleteWhere,
    txDeleteReturning,
    txSelect,
    txFrom,
    txWhere,
    txLimit,
    tx: { execute: txExecute, insert: txInsert, delete: txDelete, select: txSelect },
  };
});

vi.mock('@/lib/auth', () => ({
  requireSession: mocks.requireSession,
}));
vi.mock('@/lib/db', () => ({
  db: { select: mocks.select, transaction: mocks.transaction },
}));
vi.mock('@/lib/audit', () => ({
  logAudit: mocks.logAudit,
}));
vi.mock('@/lib/project-access', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/project-access')>()),
  requireTaskAccess: mocks.requireTaskAccess,
}));
vi.mock('@/lib/db/schema', () => ({
  taskDependencies: { taskId: 'taskId', predecessorId: 'predecessorId' },
  tasks: { id: 'id', title: 'title', spaceId: 'spaceId', status: 'status' },
}));
vi.mock('drizzle-orm', () => ({
  and: (...conditions: unknown[]) => ({ operator: 'and', conditions }),
  eq: (left: unknown, right: unknown) => ({ operator: 'eq', left, right }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ operator: 'sql', strings, values }),
}));

import { POST, DELETE } from '../src/app/api/tasks/[id]/dependencies/route';
import { logger } from '../src/lib/logger';

const taskId = crypto.randomUUID();
const predecessorId = crypto.randomUUID();
const spaceId = crypto.randomUUID();
const otherSpaceId = crypto.randomUUID();
const userId = crypto.randomUUID();

function ctx() {
  return { params: Promise.resolve({ id: taskId }) };
}

function postRequest(body: unknown) {
  return new NextRequest(`http://localhost/api/tasks/${taskId}/dependencies`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function deleteRequest(predId?: string) {
  const query = predId === undefined ? '' : `?predecessorId=${encodeURIComponent(predId)}`;
  return new NextRequest(`http://localhost/api/tasks/${taskId}/dependencies${query}`, {
    method: 'DELETE',
  });
}

function mockAccess(predSpaceId = spaceId) {
  mocks.requireTaskAccess.mockImplementation(async (_session: unknown, id: string) => {
    if (id === taskId) return { id: taskId, title: 'Tarea sucesora', spaceId };
    if (id === predecessorId) return { id: predecessorId, title: 'Título predecesor', spaceId: predSpaceId };
    throw Object.assign(new Error('Tarea no encontrada'), { httpStatus: 404 });
  });
}

describe('/api/tasks/[id]/dependencies', () => {
  let loggerError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    loggerError = vi.spyOn(logger, 'error').mockImplementation(() => {});
    mocks.requireSession.mockResolvedValue({ id: userId, role: 'miembro' });
    mockAccess();
    mocks.logAudit.mockResolvedValue(undefined);

    mocks.transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(mocks.tx));
    // Primera llamada: advisory lock. Segunda: consulta de ciclo.
    mocks.txExecute.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    mocks.txInsert.mockReturnValue({ values: mocks.txValues });
    mocks.txValues.mockReturnValue({ onConflictDoNothing: mocks.txOnConflictDoNothing });
    mocks.txOnConflictDoNothing.mockReturnValue({ returning: mocks.txInsertReturning });
    mocks.txInsertReturning.mockResolvedValue([{ taskId, predecessorId }]);

    mocks.txDelete.mockReturnValue({ where: mocks.txDeleteWhere });
    mocks.txDeleteWhere.mockReturnValue({ returning: mocks.txDeleteReturning });
    mocks.txDeleteReturning.mockResolvedValue([{ taskId, predecessorId }]);

    mocks.txSelect.mockReturnValue({ from: mocks.txFrom });
    mocks.txFrom.mockReturnValue({ where: mocks.txWhere });
    mocks.txWhere.mockReturnValue({ limit: mocks.txLimit });
    mocks.txLimit.mockResolvedValue([{ title: 'Pred' }]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST', () => {
    it('registra dependency_added en la misma transacción', async () => {
      const response = await POST(postRequest({ predecessorId }), ctx());

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({ ok: true });
      expect(mocks.transaction).toHaveBeenCalledTimes(1);
      expect(mocks.txExecute).toHaveBeenCalledTimes(2);
      expect(mocks.txValues).toHaveBeenCalledWith({ taskId, predecessorId });
      expect(mocks.txInsertReturning).toHaveBeenCalledTimes(1);
      expect(mocks.logAudit).toHaveBeenCalledTimes(1);
      expect(mocks.logAudit).toHaveBeenCalledWith(
        {
          actorId: userId,
          action: 'dependency_added',
          taskId,
          newValue: 'Título predecesor',
        },
        mocks.tx,
      );
    });

    it('no audita si la dependencia ya existía (conflicto)', async () => {
      mocks.txInsertReturning.mockResolvedValue([]);

      const response = await POST(postRequest({ predecessorId }), ctx());

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({ ok: true });
      expect(mocks.txInsertReturning).toHaveBeenCalledTimes(1);
      expect(mocks.logAudit).not.toHaveBeenCalled();
    });

    it('responde 400 si la tarea depende de sí misma, sin transacción ni auditoría', async () => {
      const response = await POST(postRequest({ predecessorId: taskId }), ctx());

      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe('Una tarea no puede depender de sí misma');
      expect(mocks.transaction).not.toHaveBeenCalled();
      expect(mocks.logAudit).not.toHaveBeenCalled();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('responde 400 si la dependencia crea un ciclo, sin insertar ni auditar', async () => {
      mocks.txExecute.mockReset();
      mocks.txExecute.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: taskId }]);

      const response = await POST(postRequest({ predecessorId }), ctx());

      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe('La dependencia crea un ciclo');
      expect(mocks.txExecute).toHaveBeenCalledTimes(2);
      expect(mocks.txInsert).not.toHaveBeenCalled();
      expect(mocks.logAudit).not.toHaveBeenCalled();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('responde 400 si las tareas son de proyectos distintos, sin transacción ni auditoría', async () => {
      mockAccess(otherSpaceId);

      const response = await POST(postRequest({ predecessorId }), ctx());

      expect(response.status).toBe(400);
      expect(mocks.transaction).not.toHaveBeenCalled();
      expect(mocks.logAudit).not.toHaveBeenCalled();
    });

    it('responde 400 con predecessorId no UUID, sin transacción ni auditoría', async () => {
      const response = await POST(postRequest({ predecessorId: 'no-es-uuid' }), ctx());

      expect(response.status).toBe(400);
      expect(mocks.requireTaskAccess).not.toHaveBeenCalled();
      expect(mocks.transaction).not.toHaveBeenCalled();
      expect(mocks.logAudit).not.toHaveBeenCalled();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('responde 403 a un observador, sin auditar', async () => {
      mocks.requireSession.mockResolvedValue({ id: userId, role: 'observador' });

      const response = await POST(postRequest({ predecessorId }), ctx());

      expect(response.status).toBe(403);
      expect(mocks.transaction).not.toHaveBeenCalled();
      expect(mocks.logAudit).not.toHaveBeenCalled();
    });

    it('responde 401 sin sesión, sin auditar', async () => {
      mocks.requireSession.mockRejectedValue(new Error('UNAUTHORIZED'));

      const response = await POST(postRequest({ predecessorId }), ctx());

      expect(response.status).toBe(401);
      expect(mocks.transaction).not.toHaveBeenCalled();
      expect(mocks.logAudit).not.toHaveBeenCalled();
    });

    it('no responde 2xx si falla la auditoría dentro de la transacción', async () => {
      mocks.logAudit.mockRejectedValue(new Error('audit failed'));

      const response = await POST(postRequest({ predecessorId }), ctx());

      expect(mocks.logAudit).toHaveBeenCalledTimes(1);
      expect(response.status).toBe(500);
      expect(loggerError).toHaveBeenCalled();
    });
  });

  describe('DELETE', () => {
    it('registra dependency_removed en la misma transacción', async () => {
      const response = await DELETE(deleteRequest(predecessorId), ctx());

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
      expect(mocks.transaction).toHaveBeenCalledTimes(1);
      expect(mocks.txDelete).toHaveBeenCalledTimes(1);
      expect(mocks.txDeleteWhere).toHaveBeenCalledWith({
        operator: 'and',
        conditions: [
          { operator: 'eq', left: 'taskId', right: taskId },
          { operator: 'eq', left: 'predecessorId', right: predecessorId },
        ],
      });
      expect(mocks.txDeleteReturning).toHaveBeenCalledTimes(1);
      expect(mocks.logAudit).toHaveBeenCalledTimes(1);
      expect(mocks.logAudit).toHaveBeenCalledWith(
        {
          actorId: userId,
          action: 'dependency_removed',
          taskId,
          previousValue: 'Pred',
        },
        mocks.tx,
      );
      expect(mocks.logAudit.mock.calls[0][0]).not.toHaveProperty('newValue');
      expect(mocks.logAudit.mock.calls[0][0]).not.toHaveProperty('reason');
    });

    it('acota al proyecto la lectura del título del predecesor', async () => {
      const response = await DELETE(deleteRequest(predecessorId), ctx());

      expect(response.status).toBe(200);
      expect(mocks.txWhere).toHaveBeenCalledTimes(1);
      expect(mocks.txWhere).toHaveBeenCalledWith({
        operator: 'and',
        conditions: [
          { operator: 'eq', left: 'id', right: predecessorId },
          { operator: 'eq', left: 'spaceId', right: spaceId },
        ],
      });
      expect(mocks.txLimit).toHaveBeenCalledWith(1);
    });

    it('con un predecesor de otro proyecto audita el id y no el título', async () => {
      // El filtro por spaceId excluye la fila del predecesor de otro proyecto.
      mocks.txLimit.mockResolvedValue([]);

      const response = await DELETE(deleteRequest(predecessorId), ctx());

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
      expect(mocks.txDeleteReturning).toHaveBeenCalledTimes(1);
      expect(mocks.txWhere).toHaveBeenCalledWith({
        operator: 'and',
        conditions: [
          { operator: 'eq', left: 'id', right: predecessorId },
          { operator: 'eq', left: 'spaceId', right: spaceId },
        ],
      });
      expect(mocks.logAudit).toHaveBeenCalledTimes(1);
      expect(mocks.logAudit).toHaveBeenCalledWith(
        {
          actorId: userId,
          action: 'dependency_removed',
          taskId,
          previousValue: predecessorId,
        },
        mocks.tx,
      );
      const audited = JSON.stringify(mocks.logAudit.mock.calls[0][0]);
      expect(audited).not.toContain('Pred');
      expect(audited).not.toContain('Título predecesor');
    });

    it('responde 404 si la dependencia no existe, sin auditar', async () => {
      mocks.txDeleteReturning.mockResolvedValue([]);

      const response = await DELETE(deleteRequest(predecessorId), ctx());

      expect(response.status).toBe(404);
      expect((await response.json()).error).toBe('Dependencia no encontrada');
      expect(mocks.logAudit).not.toHaveBeenCalled();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it.each([
      ['sin predecessorId', undefined],
      ['con predecessorId no UUID', 'no-es-uuid'],
    ])('responde 400 %s, sin transacción ni auditoría', async (_label, predId) => {
      const response = await DELETE(deleteRequest(predId), ctx());

      expect(response.status).toBe(400);
      expect(mocks.transaction).not.toHaveBeenCalled();
      expect(mocks.logAudit).not.toHaveBeenCalled();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('responde 403 a un observador, sin auditar', async () => {
      mocks.requireSession.mockResolvedValue({ id: userId, role: 'observador' });

      const response = await DELETE(deleteRequest(predecessorId), ctx());

      expect(response.status).toBe(403);
      expect(mocks.transaction).not.toHaveBeenCalled();
      expect(mocks.logAudit).not.toHaveBeenCalled();
    });

    it('responde 401 sin sesión, sin auditar', async () => {
      mocks.requireSession.mockRejectedValue(new Error('UNAUTHORIZED'));

      const response = await DELETE(deleteRequest(predecessorId), ctx());

      expect(response.status).toBe(401);
      expect(mocks.transaction).not.toHaveBeenCalled();
      expect(mocks.logAudit).not.toHaveBeenCalled();
    });

    it('no responde 2xx si falla la auditoría dentro de la transacción', async () => {
      mocks.logAudit.mockRejectedValue(new Error('audit failed'));

      const response = await DELETE(deleteRequest(predecessorId), ctx());

      expect(mocks.logAudit).toHaveBeenCalledTimes(1);
      expect(response.status).toBe(500);
      expect(loggerError).toHaveBeenCalled();
    });
  });
});

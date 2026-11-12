import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  const txUpdate = vi.fn();
  const txSet = vi.fn();
  const txUpdateWhere = vi.fn();
  const txReturning = vi.fn();
  const txDelete = vi.fn();
  const txDeleteWhere = vi.fn();
  return {
    requireSession: vi.fn(),
    requireProjectAccess: vi.fn(),
    logAudit: vi.fn(),
    select: vi.fn(),
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    transaction: vi.fn(),
    txUpdate,
    txSet,
    txUpdateWhere,
    txReturning,
    txDelete,
    txDeleteWhere,
    tx: { update: txUpdate, delete: txDelete },
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
  requireProjectAccess: mocks.requireProjectAccess,
}));
vi.mock('@/lib/db/schema', () => ({
  comments: { id: 'id', spaceId: 'spaceId' },
  persons: { id: 'id', name: 'name' },
}));
vi.mock('drizzle-orm', () => ({
  and: (...conditions: unknown[]) => ({ operator: 'and', conditions }),
  eq: (left: unknown, right: unknown) => ({ operator: 'eq', left, right }),
  desc: (column: unknown) => ({ operator: 'desc', column }),
}));

import { PATCH, DELETE } from '../src/app/api/spaces/[id]/comments/route';
import { logger } from '../src/lib/logger';

const spaceId = crypto.randomUUID();
const userId = crypto.randomUUID();
const otherUserId = crypto.randomUUID();

function ctx() {
  return { params: Promise.resolve({ id: spaceId }) };
}

function jsonRequest(method: 'PATCH' | 'DELETE', body: unknown) {
  return new NextRequest(`http://localhost/api/spaces/${spaceId}/comments`, {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function existingComment(overrides: Partial<{ id: string; authorId: string; content: string }> = {}) {
  return {
    id: crypto.randomUUID(),
    spaceId,
    taskId: null,
    authorId: userId,
    content: 'antes',
    editedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('/api/spaces/[id]/comments', () => {
  let loggerError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    loggerError = vi.spyOn(logger, 'error').mockImplementation(() => {});
    mocks.requireSession.mockResolvedValue({ id: userId, role: 'miembro' });
    mocks.requireProjectAccess.mockResolvedValue(undefined);
    mocks.logAudit.mockResolvedValue(undefined);

    mocks.select.mockReturnValue({ from: mocks.from });
    mocks.from.mockReturnValue({ where: mocks.where });
    mocks.where.mockReturnValue({ limit: mocks.limit });
    mocks.limit.mockResolvedValue([]);

    mocks.transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(mocks.tx));
    mocks.txUpdate.mockReturnValue({ set: mocks.txSet });
    mocks.txSet.mockReturnValue({ where: mocks.txUpdateWhere });
    mocks.txUpdateWhere.mockReturnValue({ returning: mocks.txReturning });
    mocks.txDelete.mockReturnValue({ where: mocks.txDeleteWhere });
    mocks.txDeleteWhere.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('PATCH', () => {
    it('registra comment_edited con spaceId en la misma transacción cuando edita el autor', async () => {
      const comment = existingComment();
      mocks.limit.mockResolvedValue([comment]);
      const updated = { ...comment, content: 'después' };
      mocks.txReturning.mockResolvedValue([updated]);

      const response = await PATCH(jsonRequest('PATCH', { commentId: comment.id, content: '<b>después</b>' }), ctx());

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.id).toBe(comment.id);
      expect(body.content).toBe('después');
      expect(mocks.requireProjectAccess).toHaveBeenCalledWith({ id: userId, role: 'miembro' }, spaceId, 'write');
      expect(mocks.transaction).toHaveBeenCalledTimes(1);
      expect(mocks.txUpdate).toHaveBeenCalledTimes(1);
      expect(mocks.txSet).toHaveBeenCalledWith(expect.objectContaining({ content: 'después' }));
      expect(mocks.txUpdateWhere).toHaveBeenCalledWith({
        operator: 'and',
        conditions: [
          { operator: 'eq', left: 'id', right: comment.id },
          { operator: 'eq', left: 'spaceId', right: spaceId },
        ],
      });
      expect(mocks.logAudit).toHaveBeenCalledTimes(1);
      expect(mocks.logAudit).toHaveBeenCalledWith(
        {
          actorId: userId,
          action: 'comment_edited',
          spaceId,
          previousValue: 'antes',
          newValue: 'después',
        },
        mocks.tx,
      );
      expect(mocks.logAudit.mock.calls[0][0]).not.toHaveProperty('reason');
      expect(mocks.logAudit.mock.calls[0][0]).not.toHaveProperty('taskId');
    });

    it('un admin que edita su propio comentario no añade reason', async () => {
      mocks.requireSession.mockResolvedValue({ id: userId, role: 'admin' });
      const comment = existingComment();
      mocks.limit.mockResolvedValue([comment]);
      mocks.txReturning.mockResolvedValue([{ ...comment, content: 'nuevo' }]);

      const response = await PATCH(jsonRequest('PATCH', { commentId: comment.id, content: 'nuevo' }), ctx());

      expect(response.status).toBe(200);
      expect(mocks.logAudit).toHaveBeenCalledTimes(1);
      expect(mocks.logAudit.mock.calls[0][0]).not.toHaveProperty('reason');
      expect(mocks.logAudit.mock.calls[0][0]).not.toHaveProperty('taskId');
    });

    it('añade reason cuando un admin modera un comentario ajeno', async () => {
      mocks.requireSession.mockResolvedValue({ id: userId, role: 'admin' });
      const comment = existingComment({ authorId: otherUserId });
      mocks.limit.mockResolvedValue([comment]);
      mocks.txReturning.mockResolvedValue([{ ...comment, content: 'moderado' }]);

      const response = await PATCH(jsonRequest('PATCH', { commentId: comment.id, content: 'moderado' }), ctx());

      expect(response.status).toBe(200);
      expect(mocks.logAudit).toHaveBeenCalledTimes(1);
      expect(mocks.logAudit).toHaveBeenCalledWith(
        {
          actorId: userId,
          action: 'comment_edited',
          spaceId,
          previousValue: 'antes',
          newValue: 'moderado',
          reason: 'Moderado por admin',
        },
        mocks.tx,
      );
      expect(mocks.logAudit.mock.calls[0][0]).not.toHaveProperty('taskId');
    });

    it('responde 403 si no es autor ni admin, sin auditar', async () => {
      const comment = existingComment({ authorId: otherUserId });
      mocks.limit.mockResolvedValue([comment]);

      const response = await PATCH(jsonRequest('PATCH', { commentId: comment.id, content: 'x' }), ctx());

      expect(response.status).toBe(403);
      expect((await response.json()).error).toBe('Sin permisos');
      expect(mocks.transaction).not.toHaveBeenCalled();
      expect(mocks.logAudit).not.toHaveBeenCalled();
    });

    it('responde 404 si el comentario no existe o es de otro proyecto, sin auditar', async () => {
      mocks.limit.mockResolvedValue([]);

      const response = await PATCH(jsonRequest('PATCH', { commentId: crypto.randomUUID(), content: 'x' }), ctx());

      expect(response.status).toBe(404);
      expect((await response.json()).error).toBe('Comentario no encontrado');
      expect(mocks.transaction).not.toHaveBeenCalled();
      expect(mocks.logAudit).not.toHaveBeenCalled();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it.each([
      ['commentId no UUID', { commentId: 'no-es-uuid', content: 'x' }],
      ['content vacío', { commentId: crypto.randomUUID(), content: '   ' }],
      ['content sólo HTML', { commentId: crypto.randomUUID(), content: '<b></b>' }],
    ])('responde 400 con %s, sin auditar', async (_label, body) => {
      const response = await PATCH(jsonRequest('PATCH', body), ctx());

      expect(response.status).toBe(400);
      expect(mocks.select).not.toHaveBeenCalled();
      expect(mocks.transaction).not.toHaveBeenCalled();
      expect(mocks.logAudit).not.toHaveBeenCalled();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('responde 401 sin sesión, sin auditar', async () => {
      mocks.requireSession.mockRejectedValue(new Error('UNAUTHORIZED'));

      const response = await PATCH(jsonRequest('PATCH', { commentId: crypto.randomUUID(), content: 'x' }), ctx());

      expect(response.status).toBe(401);
      expect(mocks.transaction).not.toHaveBeenCalled();
      expect(mocks.logAudit).not.toHaveBeenCalled();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('no responde 200 si falla la auditoría dentro de la transacción', async () => {
      const comment = existingComment();
      mocks.limit.mockResolvedValue([comment]);
      mocks.txReturning.mockResolvedValue([{ ...comment, content: 'nuevo' }]);
      mocks.logAudit.mockRejectedValue(new Error('audit failed'));

      const response = await PATCH(jsonRequest('PATCH', { commentId: comment.id, content: 'nuevo' }), ctx());

      expect(mocks.logAudit).toHaveBeenCalledTimes(1);
      expect(response.status).toBe(500);
      expect(loggerError).toHaveBeenCalled();
    });
  });

  describe('DELETE', () => {
    it('registra comment_deleted con spaceId en la misma transacción cuando borra el autor', async () => {
      const comment = existingComment({ content: 'texto borrado' });
      mocks.limit.mockResolvedValue([comment]);

      const response = await DELETE(jsonRequest('DELETE', { commentId: comment.id }), ctx());

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ deleted: true });
      expect(mocks.transaction).toHaveBeenCalledTimes(1);
      expect(mocks.txDelete).toHaveBeenCalledTimes(1);
      expect(mocks.txDeleteWhere).toHaveBeenCalledWith({
        operator: 'and',
        conditions: [
          { operator: 'eq', left: 'id', right: comment.id },
          { operator: 'eq', left: 'spaceId', right: spaceId },
        ],
      });
      expect(mocks.logAudit).toHaveBeenCalledTimes(1);
      expect(mocks.logAudit).toHaveBeenCalledWith(
        {
          actorId: userId,
          action: 'comment_deleted',
          spaceId,
          previousValue: 'texto borrado',
        },
        mocks.tx,
      );
      expect(mocks.logAudit.mock.calls[0][0]).not.toHaveProperty('newValue');
      expect(mocks.logAudit.mock.calls[0][0]).not.toHaveProperty('reason');
      expect(mocks.logAudit.mock.calls[0][0]).not.toHaveProperty('taskId');
    });

    it('un admin que borra su propio comentario no añade reason', async () => {
      mocks.requireSession.mockResolvedValue({ id: userId, role: 'admin' });
      const comment = existingComment();
      mocks.limit.mockResolvedValue([comment]);

      const response = await DELETE(jsonRequest('DELETE', { commentId: comment.id }), ctx());

      expect(response.status).toBe(200);
      expect(mocks.logAudit).toHaveBeenCalledTimes(1);
      expect(mocks.logAudit.mock.calls[0][0]).not.toHaveProperty('reason');
    });

    it('añade reason cuando un admin modera un comentario ajeno', async () => {
      mocks.requireSession.mockResolvedValue({ id: userId, role: 'admin' });
      const comment = existingComment({ authorId: otherUserId, content: 'ofensivo' });
      mocks.limit.mockResolvedValue([comment]);

      const response = await DELETE(jsonRequest('DELETE', { commentId: comment.id }), ctx());

      expect(response.status).toBe(200);
      expect(mocks.logAudit).toHaveBeenCalledTimes(1);
      expect(mocks.logAudit).toHaveBeenCalledWith(
        {
          actorId: userId,
          action: 'comment_deleted',
          spaceId,
          previousValue: 'ofensivo',
          reason: 'Moderado por admin',
        },
        mocks.tx,
      );
      expect(mocks.logAudit.mock.calls[0][0]).not.toHaveProperty('taskId');
    });

    it('responde 403 si no es autor ni admin, sin auditar', async () => {
      const comment = existingComment({ authorId: otherUserId });
      mocks.limit.mockResolvedValue([comment]);

      const response = await DELETE(jsonRequest('DELETE', { commentId: comment.id }), ctx());

      expect(response.status).toBe(403);
      expect((await response.json()).error).toBe('Sin permisos');
      expect(mocks.transaction).not.toHaveBeenCalled();
      expect(mocks.logAudit).not.toHaveBeenCalled();
    });

    it('responde 404 si el comentario no existe o es de otro proyecto, sin auditar', async () => {
      mocks.limit.mockResolvedValue([]);

      const response = await DELETE(jsonRequest('DELETE', { commentId: crypto.randomUUID() }), ctx());

      expect(response.status).toBe(404);
      expect((await response.json()).error).toBe('Comentario no encontrado');
      expect(mocks.transaction).not.toHaveBeenCalled();
      expect(mocks.logAudit).not.toHaveBeenCalled();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('responde 400 con commentId no UUID, sin auditar', async () => {
      const response = await DELETE(jsonRequest('DELETE', { commentId: 'no-es-uuid' }), ctx());

      expect(response.status).toBe(400);
      expect(mocks.select).not.toHaveBeenCalled();
      expect(mocks.transaction).not.toHaveBeenCalled();
      expect(mocks.logAudit).not.toHaveBeenCalled();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('responde 401 sin sesión, sin auditar', async () => {
      mocks.requireSession.mockRejectedValue(new Error('UNAUTHORIZED'));

      const response = await DELETE(jsonRequest('DELETE', { commentId: crypto.randomUUID() }), ctx());

      expect(response.status).toBe(401);
      expect(mocks.transaction).not.toHaveBeenCalled();
      expect(mocks.logAudit).not.toHaveBeenCalled();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('no responde 200 si falla la auditoría dentro de la transacción', async () => {
      const comment = existingComment();
      mocks.limit.mockResolvedValue([comment]);
      mocks.logAudit.mockRejectedValue(new Error('audit failed'));

      const response = await DELETE(jsonRequest('DELETE', { commentId: comment.id }), ctx());

      expect(mocks.logAudit).toHaveBeenCalledTimes(1);
      expect(response.status).toBe(500);
      expect(loggerError).toHaveBeenCalled();
    });
  });
});

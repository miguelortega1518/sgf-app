import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  const txSelect = vi.fn();
  const txFrom = vi.fn();
  const txWhere = vi.fn();
  const txLimit = vi.fn();
  const txFor = vi.fn();
  const txUpdate = vi.fn();
  const txSet = vi.fn();
  const txUpdateWhere = vi.fn();
  const txReturning = vi.fn();
  const txDelete = vi.fn();
  const txDeleteWhere = vi.fn();
  return {
    requireSession: vi.fn(),
    requireTaskAccess: vi.fn(),
    logAudit: vi.fn(),
    select: vi.fn(),
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    transaction: vi.fn(),
    txSelect,
    txFrom,
    txWhere,
    txLimit,
    txFor,
    txUpdate,
    txSet,
    txUpdateWhere,
    txReturning,
    txDelete,
    txDeleteWhere,
    tx: { select: txSelect, update: txUpdate, delete: txDelete },
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
  comments: { id: 'id', taskId: 'taskId' },
}));
vi.mock('drizzle-orm', () => ({
  and: (...conditions: unknown[]) => ({ operator: 'and', conditions }),
  eq: (left: unknown, right: unknown) => ({ operator: 'eq', left, right }),
  inArray: (left: unknown, values: unknown[]) => ({ operator: 'inArray', left, values }),
}));

import { PATCH, DELETE } from '../src/app/api/tasks/[id]/comments/route';
import { logger } from '../src/lib/logger';

const taskId = crypto.randomUUID();
const userId = crypto.randomUUID();
const otherUserId = crypto.randomUUID();

function ctx() {
  return { params: Promise.resolve({ id: taskId }) };
}

function patchRequest(body: unknown) {
  return new NextRequest(`http://localhost/api/tasks/${taskId}/comments`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function deleteRequest(commentId?: string) {
  const query = commentId === undefined ? '' : `?commentId=${encodeURIComponent(commentId)}`;
  return new NextRequest(`http://localhost/api/tasks/${taskId}/comments${query}`, {
    method: 'DELETE',
  });
}

function existingComment(overrides: Partial<{ id: string; authorId: string; content: string }> = {}) {
  return {
    id: crypto.randomUUID(),
    taskId,
    authorId: userId,
    content: 'antes',
    editedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function expectedLockedFilter(commentId: string) {
  return {
    operator: 'and',
    conditions: [
      { operator: 'eq', left: 'id', right: commentId },
      { operator: 'eq', left: 'taskId', right: taskId },
    ],
  };
}

describe('/api/tasks/[id]/comments', () => {
  let loggerError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    loggerError = vi.spyOn(logger, 'error').mockImplementation(() => {});
    mocks.requireSession.mockResolvedValue({ id: userId, role: 'miembro' });
    mocks.requireTaskAccess.mockResolvedValue({ id: taskId });
    mocks.logAudit.mockResolvedValue(undefined);

    // Lectura fuera de la transacción: la ruta no debe usarla.
    mocks.select.mockReturnValue({ from: mocks.from });
    mocks.from.mockReturnValue({ where: mocks.where });
    mocks.where.mockReturnValue({ limit: mocks.limit });
    mocks.limit.mockResolvedValue([]);

    mocks.transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(mocks.tx));
    mocks.txSelect.mockReturnValue({ from: mocks.txFrom });
    mocks.txFrom.mockReturnValue({ where: mocks.txWhere });
    mocks.txWhere.mockReturnValue({ limit: mocks.txLimit });
    mocks.txLimit.mockReturnValue({ for: mocks.txFor });
    mocks.txFor.mockResolvedValue([]);
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
    it('registra comment_edited en la misma transacción cuando edita el autor', async () => {
      const comment = existingComment();
      mocks.txFor.mockResolvedValue([comment]);
      const updated = { ...comment, content: 'después' };
      mocks.txReturning.mockResolvedValue([updated]);

      const response = await PATCH(patchRequest({ commentId: comment.id, content: '<b>después</b>' }), ctx());

      expect(response.status).toBe(200);
      expect((await response.json()).content).toBe('después');
      expect(mocks.transaction).toHaveBeenCalledTimes(1);
      expect(mocks.txUpdate).toHaveBeenCalledTimes(1);
      expect(mocks.txSet).toHaveBeenCalledWith(expect.objectContaining({ content: 'después' }));
      expect(mocks.logAudit).toHaveBeenCalledTimes(1);
      expect(mocks.logAudit).toHaveBeenCalledWith(
        {
          actorId: userId,
          action: 'comment_edited',
          taskId,
          previousValue: 'antes',
          newValue: 'después',
        },
        mocks.tx,
      );
      expect(mocks.logAudit.mock.calls[0][0]).not.toHaveProperty('reason');
    });

    it('lee el comentario con FOR UPDATE dentro de la transacción y usa su contenido como previousValue', async () => {
      const commentId = crypto.randomUUID();
      // Fila obsoleta (C1) si se leyera fuera de la transacción; la bloqueada es C2.
      mocks.limit.mockResolvedValue([existingComment({ id: commentId, content: 'C1' })]);
      const locked = existingComment({ id: commentId, content: 'C2' });
      mocks.txFor.mockResolvedValue([locked]);
      mocks.txReturning.mockResolvedValue([{ ...locked, content: 'C3' }]);

      const response = await PATCH(patchRequest({ commentId, content: 'C3' }), ctx());

      expect(response.status).toBe(200);
      expect(mocks.select).not.toHaveBeenCalled();
      expect(mocks.txSelect).toHaveBeenCalledTimes(1);
      expect(mocks.txWhere).toHaveBeenCalledWith(expectedLockedFilter(commentId));
      expect(mocks.txLimit).toHaveBeenCalledWith(1);
      expect(mocks.txFor).toHaveBeenCalledWith('update');
      expect(mocks.logAudit).toHaveBeenCalledWith(
        {
          actorId: userId,
          action: 'comment_edited',
          taskId,
          previousValue: 'C2',
          newValue: 'C3',
        },
        mocks.tx,
      );
    });

    it('un admin que edita su propio comentario no añade reason', async () => {
      mocks.requireSession.mockResolvedValue({ id: userId, role: 'admin' });
      const comment = existingComment();
      mocks.txFor.mockResolvedValue([comment]);
      mocks.txReturning.mockResolvedValue([{ ...comment, content: 'nuevo' }]);

      const response = await PATCH(patchRequest({ commentId: comment.id, content: 'nuevo' }), ctx());

      expect(response.status).toBe(200);
      expect(mocks.logAudit).toHaveBeenCalledTimes(1);
      expect(mocks.logAudit.mock.calls[0][0]).not.toHaveProperty('reason');
    });

    it('añade reason cuando un admin modera un comentario ajeno', async () => {
      mocks.requireSession.mockResolvedValue({ id: userId, role: 'admin' });
      const comment = existingComment({ authorId: otherUserId });
      mocks.txFor.mockResolvedValue([comment]);
      mocks.txReturning.mockResolvedValue([{ ...comment, content: 'moderado' }]);

      const response = await PATCH(patchRequest({ commentId: comment.id, content: 'moderado' }), ctx());

      expect(response.status).toBe(200);
      expect(mocks.logAudit).toHaveBeenCalledTimes(1);
      expect(mocks.logAudit).toHaveBeenCalledWith(
        {
          actorId: userId,
          action: 'comment_edited',
          taskId,
          previousValue: 'antes',
          newValue: 'moderado',
          reason: 'Moderado por admin',
        },
        mocks.tx,
      );
    });

    it.each(['miembro', 'observador'])('responde 403 si no es autor ni admin (%s), sin auditar', async role => {
      mocks.requireSession.mockResolvedValue({ id: userId, role });
      const comment = existingComment({ authorId: otherUserId });
      mocks.txFor.mockResolvedValue([comment]);

      const response = await PATCH(patchRequest({ commentId: comment.id, content: 'x' }), ctx());

      expect(response.status).toBe(403);
      expect((await response.json()).error).toBe('Solo puedes editar tus propios comentarios');
      expect(mocks.txFor).toHaveBeenCalledWith('update');
      expect(mocks.txUpdate).not.toHaveBeenCalled();
      expect(mocks.logAudit).not.toHaveBeenCalled();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('responde 404 si el comentario no existe, sin auditar', async () => {
      mocks.txFor.mockResolvedValue([]);

      const response = await PATCH(patchRequest({ commentId: crypto.randomUUID(), content: 'x' }), ctx());

      expect(response.status).toBe(404);
      expect((await response.json()).error).toBe('Comentario no encontrado');
      expect(mocks.txUpdate).not.toHaveBeenCalled();
      expect(mocks.logAudit).not.toHaveBeenCalled();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it.each([
      ['commentId no UUID', { commentId: 'no-es-uuid', content: 'x' }],
      ['content vacío', { commentId: crypto.randomUUID(), content: '   ' }],
      ['content sólo HTML', { commentId: crypto.randomUUID(), content: '<b></b>' }],
    ])('responde 400 con %s, sin auditar', async (_label, body) => {
      const response = await PATCH(patchRequest(body), ctx());

      expect(response.status).toBe(400);
      expect(mocks.select).not.toHaveBeenCalled();
      expect(mocks.transaction).not.toHaveBeenCalled();
      expect(mocks.logAudit).not.toHaveBeenCalled();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('responde 401 sin sesión, sin auditar', async () => {
      mocks.requireSession.mockRejectedValue(new Error('UNAUTHORIZED'));

      const response = await PATCH(patchRequest({ commentId: crypto.randomUUID(), content: 'x' }), ctx());

      expect(response.status).toBe(401);
      expect(mocks.transaction).not.toHaveBeenCalled();
      expect(mocks.logAudit).not.toHaveBeenCalled();
    });

    it('no responde 200 si falla la auditoría dentro de la transacción', async () => {
      const comment = existingComment();
      mocks.txFor.mockResolvedValue([comment]);
      mocks.txReturning.mockResolvedValue([{ ...comment, content: 'nuevo' }]);
      mocks.logAudit.mockRejectedValue(new Error('audit failed'));

      const response = await PATCH(patchRequest({ commentId: comment.id, content: 'nuevo' }), ctx());

      expect(mocks.logAudit).toHaveBeenCalledTimes(1);
      expect(response.status).toBe(500);
      expect(loggerError).toHaveBeenCalled();
    });
  });

  describe('DELETE', () => {
    it('registra comment_deleted en la misma transacción cuando borra el autor', async () => {
      const comment = existingComment({ content: 'texto borrado' });
      mocks.txFor.mockResolvedValue([comment]);

      const response = await DELETE(deleteRequest(comment.id), ctx());

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
      expect(mocks.transaction).toHaveBeenCalledTimes(1);
      expect(mocks.txDelete).toHaveBeenCalledTimes(1);
      expect(mocks.txDeleteWhere).toHaveBeenCalledWith({ operator: 'eq', left: 'id', right: comment.id });
      expect(mocks.logAudit).toHaveBeenCalledTimes(1);
      expect(mocks.logAudit).toHaveBeenCalledWith(
        {
          actorId: userId,
          action: 'comment_deleted',
          taskId,
          previousValue: 'texto borrado',
        },
        mocks.tx,
      );
      expect(mocks.logAudit.mock.calls[0][0]).not.toHaveProperty('newValue');
      expect(mocks.logAudit.mock.calls[0][0]).not.toHaveProperty('reason');
    });

    it('lee el comentario con FOR UPDATE dentro de la transacción y audita el texto realmente borrado', async () => {
      const commentId = crypto.randomUUID();
      // Fila obsoleta (C1) si se leyera fuera de la transacción; la bloqueada es C2.
      mocks.limit.mockResolvedValue([existingComment({ id: commentId, content: 'C1' })]);
      mocks.txFor.mockResolvedValue([existingComment({ id: commentId, content: 'C2' })]);

      const response = await DELETE(deleteRequest(commentId), ctx());

      expect(response.status).toBe(200);
      expect(mocks.select).not.toHaveBeenCalled();
      expect(mocks.txSelect).toHaveBeenCalledTimes(1);
      expect(mocks.txWhere).toHaveBeenCalledWith(expectedLockedFilter(commentId));
      expect(mocks.txLimit).toHaveBeenCalledWith(1);
      expect(mocks.txFor).toHaveBeenCalledWith('update');
      expect(mocks.logAudit).toHaveBeenCalledWith(
        {
          actorId: userId,
          action: 'comment_deleted',
          taskId,
          previousValue: 'C2',
        },
        mocks.tx,
      );
      expect(mocks.logAudit.mock.calls[0][0]).not.toHaveProperty('newValue');
    });

    it('añade reason cuando un admin modera un comentario ajeno', async () => {
      mocks.requireSession.mockResolvedValue({ id: userId, role: 'admin' });
      const comment = existingComment({ authorId: otherUserId, content: 'ofensivo' });
      mocks.txFor.mockResolvedValue([comment]);

      const response = await DELETE(deleteRequest(comment.id), ctx());

      expect(response.status).toBe(200);
      expect(mocks.logAudit).toHaveBeenCalledTimes(1);
      expect(mocks.logAudit).toHaveBeenCalledWith(
        {
          actorId: userId,
          action: 'comment_deleted',
          taskId,
          previousValue: 'ofensivo',
          reason: 'Moderado por admin',
        },
        mocks.tx,
      );
    });

    it.each(['miembro', 'observador'])('responde 403 si no es autor ni admin (%s), sin auditar', async role => {
      mocks.requireSession.mockResolvedValue({ id: userId, role });
      const comment = existingComment({ authorId: otherUserId });
      mocks.txFor.mockResolvedValue([comment]);

      const response = await DELETE(deleteRequest(comment.id), ctx());

      expect(response.status).toBe(403);
      expect((await response.json()).error).toBe('Solo puedes eliminar tus propios comentarios');
      expect(mocks.txFor).toHaveBeenCalledWith('update');
      expect(mocks.txDelete).not.toHaveBeenCalled();
      expect(mocks.logAudit).not.toHaveBeenCalled();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('responde 404 si el comentario no existe, sin auditar', async () => {
      mocks.txFor.mockResolvedValue([]);

      const response = await DELETE(deleteRequest(crypto.randomUUID()), ctx());

      expect(response.status).toBe(404);
      expect((await response.json()).error).toBe('Comentario no encontrado');
      expect(mocks.txDelete).not.toHaveBeenCalled();
      expect(mocks.logAudit).not.toHaveBeenCalled();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('responde 400 sin commentId, sin auditar', async () => {
      const response = await DELETE(deleteRequest(), ctx());

      expect(response.status).toBe(400);
      expect(mocks.transaction).not.toHaveBeenCalled();
      expect(mocks.logAudit).not.toHaveBeenCalled();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('responde 400 con commentId no UUID, sin auditar', async () => {
      const response = await DELETE(deleteRequest('no-es-uuid'), ctx());

      expect(response.status).toBe(400);
      expect(mocks.select).not.toHaveBeenCalled();
      expect(mocks.transaction).not.toHaveBeenCalled();
      expect(mocks.logAudit).not.toHaveBeenCalled();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('responde 401 sin sesión, sin auditar', async () => {
      mocks.requireSession.mockRejectedValue(new Error('UNAUTHORIZED'));

      const response = await DELETE(deleteRequest(crypto.randomUUID()), ctx());

      expect(response.status).toBe(401);
      expect(mocks.transaction).not.toHaveBeenCalled();
      expect(mocks.logAudit).not.toHaveBeenCalled();
    });

    it('no responde 200 si falla la auditoría dentro de la transacción', async () => {
      const comment = existingComment();
      mocks.txFor.mockResolvedValue([comment]);
      mocks.logAudit.mockRejectedValue(new Error('audit failed'));

      const response = await DELETE(deleteRequest(comment.id), ctx());

      expect(mocks.logAudit).toHaveBeenCalledTimes(1);
      expect(response.status).toBe(500);
      expect(loggerError).toHaveBeenCalled();
    });
  });
});

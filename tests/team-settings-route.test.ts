import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  requireRole: vi.fn(),
  logAudit: vi.fn(),
  select: vi.fn(),
  transaction: vi.fn(),
  txSelect: vi.fn(),
  txInsert: vi.fn(),
  txValues: vi.fn(),
  txOnConflictDoUpdate: vi.fn(),
  tx: {} as Record<string, unknown>,
}));
mocks.tx.select = mocks.txSelect;
mocks.tx.insert = mocks.txInsert;

vi.mock('@/lib/auth', () => ({ requireSession: mocks.requireSession, requireRole: mocks.requireRole }));
vi.mock('@/lib/db', () => ({ db: { select: mocks.select, transaction: mocks.transaction } }));
vi.mock('@/lib/audit', () => ({ logAudit: mocks.logAudit }));

import { GET, PATCH } from '../src/app/api/settings/team/route';
import { teamSettings } from '../src/lib/db/schema';
import { logger } from '../src/lib/logger';

const adminId = crypto.randomUUID();
let storedRows: { showPersonMetrics: boolean }[];
let loggerError: ReturnType<typeof vi.spyOn>;

function chain(result: () => unknown) {
  const builder: Record<string, unknown> = {};
  for (const method of ['from', 'where', 'limit', 'for']) builder[method] = () => builder;
  builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve().then(result).then(resolve, reject);
  return builder;
}

function patch(body: unknown) {
  return new NextRequest('http://localhost/api/settings/team', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  loggerError = vi.spyOn(logger, 'error').mockImplementation(() => {});
  storedRows = [];
  mocks.requireSession.mockResolvedValue({ id: adminId, role: 'miembro' });
  mocks.requireRole.mockResolvedValue({ id: adminId, role: 'admin' });
  mocks.logAudit.mockResolvedValue(undefined);
  mocks.select.mockImplementation(() => chain(() => storedRows));
  mocks.txSelect.mockImplementation(() => chain(() => storedRows));
  mocks.txInsert.mockImplementation(() => ({ values: mocks.txValues }));
  mocks.txValues.mockImplementation(() => ({ onConflictDoUpdate: mocks.txOnConflictDoUpdate }));
  mocks.txOnConflictDoUpdate.mockResolvedValue(undefined);
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mocks.tx));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/settings/team', () => {
  it('sin fila devuelve las métricas por persona activadas', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ showPersonMetrics: true });
  });

  it('con fila devuelve el valor guardado, a cualquier rol', async () => {
    mocks.requireSession.mockResolvedValue({ id: adminId, role: 'observador' });
    storedRows = [{ showPersonMetrics: false }];
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ showPersonMetrics: false });
  });

  it('responde 401 sin sesión y no registra errores', async () => {
    mocks.requireSession.mockRejectedValue(new Error('UNAUTHORIZED'));
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/settings/team', () => {
  it('exige el rol admin', async () => {
    await PATCH(patch({ showPersonMetrics: false }));
    expect(mocks.requireRole).toHaveBeenCalledWith('admin');
  });

  it('un miembro u observador recibe 403 y no se escribe ni audita', async () => {
    mocks.requireRole.mockRejectedValue(new Error('FORBIDDEN'));
    const res = await PATCH(patch({ showPersonMetrics: false }));
    expect(res.status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('responde 401 sin sesión', async () => {
    mocks.requireRole.mockRejectedValue(new Error('UNAUTHORIZED'));
    const res = await PATCH(patch({ showPersonMetrics: false }));
    expect(res.status).toBe(401);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it.each([
    ['vacío', {}],
    ['no booleano', { showPersonMetrics: 'no' }],
    ['con un campo extra', { showPersonMetrics: false, extra: 1 }],
  ])('cuerpo %s → 400 sin escribir ni auditar', async (_name, body) => {
    const res = await PATCH(patch(body));
    expect(res.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.txInsert).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('JSON inválido → 400', async () => {
    const res = await PATCH(patch('{no-json'));
    expect(res.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('de activado a desactivado: upsert con el admin y auditoría con el tx', async () => {
    const res = await PATCH(patch({ showPersonMetrics: false }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ showPersonMetrics: false });

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.txInsert).toHaveBeenCalledWith(teamSettings);
    expect(mocks.txValues).toHaveBeenCalledWith(expect.objectContaining({
      id: 1, showPersonMetrics: false, updatedBy: adminId, updatedAt: expect.any(Date),
    }));
    expect(mocks.txOnConflictDoUpdate).toHaveBeenCalledWith(expect.objectContaining({
      target: teamSettings.id,
      set: expect.objectContaining({ showPersonMetrics: false, updatedBy: adminId, updatedAt: expect.any(Date) }),
    }));

    expect(mocks.logAudit).toHaveBeenCalledTimes(1);
    const [entry, executor] = mocks.logAudit.mock.calls[0];
    expect(entry).toEqual({
      actorId: adminId,
      action: 'person_metrics_setting_changed',
      previousValue: 'Métricas por persona: activadas',
      newValue: 'Métricas por persona: desactivadas',
    });
    expect(executor).toBe(mocks.tx);
  });

  it('de desactivado a activado audita los valores al revés', async () => {
    storedRows = [{ showPersonMetrics: false }];
    const res = await PATCH(patch({ showPersonMetrics: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ showPersonMetrics: true });
    expect(mocks.logAudit.mock.calls[0][0]).toMatchObject({
      previousValue: 'Métricas por persona: desactivadas',
      newValue: 'Métricas por persona: activadas',
    });
  });

  it('con el mismo valor responde 200 con el estado actual y no escribe ni audita', async () => {
    const res = await PATCH(patch({ showPersonMetrics: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ showPersonMetrics: true });
    expect(mocks.txInsert).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });
});

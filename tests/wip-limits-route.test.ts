import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  const txSelect = vi.fn();
  const txUpdate = vi.fn();
  const txSet = vi.fn();
  return {
    requireSession: vi.fn(),
    requireProjectAccess: vi.fn(),
    logAudit: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
    txSelect,
    txUpdate,
    txSet,
    tx: { select: txSelect, update: txUpdate },
  };
});

vi.mock('@/lib/auth', () => ({ requireSession: mocks.requireSession }));
vi.mock('@/lib/db', () => ({
  db: { select: mocks.select, update: mocks.update, transaction: mocks.transaction },
}));
vi.mock('@/lib/audit', () => ({ logAudit: mocks.logAudit }));
vi.mock('@/lib/project-access', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/project-access')>()),
  requireProjectAccess: mocks.requireProjectAccess,
}));
vi.mock('@/lib/db/schema', () => ({
  spaces: { id: 'spaces.id', wipLimits: 'spaces.wipLimits' },
}));
vi.mock('drizzle-orm', () => ({
  and: (...conditions: unknown[]) => ({ operator: 'and', conditions }),
  eq: (left: unknown, right: unknown) => ({ operator: 'eq', left, right }),
}));

import { PUT } from '../src/app/api/spaces/[id]/wip-limits/route';
import { logger } from '../src/lib/logger';

const spaceId = crypto.randomUUID();
const userId = crypto.randomUUID();

type SpaceRow = { id: string; name: string; status: string; wipLimits: unknown };

let current: SpaceRow;
let txForCalls: unknown[];

function ctx(id = spaceId) {
  return { params: Promise.resolve({ id }) };
}

function putRequest(body: unknown, id = spaceId) {
  return new NextRequest(`http://localhost/api/spaces/${id}/wip-limits`, {
    method: 'PUT',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function httpError(message: string, httpStatus: number) {
  return Object.assign(new Error(message), { httpStatus });
}

function chain(result: unknown, onFor?: (arg: unknown) => void) {
  const builder: Record<string, unknown> = {};
  for (const method of ['from', 'where', 'limit']) builder[method] = () => builder;
  builder.for = (arg: unknown) => { onFor?.(arg); return builder; };
  builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

let loggerError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  loggerError = vi.spyOn(logger, 'error').mockImplementation(() => {});
  current = { id: spaceId, name: 'Portal', status: 'activo', wipLimits: {} };
  txForCalls = [];
  mocks.requireSession.mockResolvedValue({ id: userId, role: 'miembro' });
  mocks.requireProjectAccess.mockImplementation(async () => ({ ...current }));
  mocks.logAudit.mockResolvedValue(undefined);
  mocks.txSelect.mockImplementation(() => chain([{ ...current }], arg => txForCalls.push(arg)));
  mocks.txUpdate.mockImplementation(() => ({ set: mocks.txSet }));
  mocks.txSet.mockImplementation((input: Record<string, unknown>) => {
    const builder = { where: () => builder, returning: async () => [{ ...current, ...input }] };
    return builder;
  });
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mocks.tx));
});

afterEach(() => {
  vi.restoreAllMocks();
});

const expectNoSideEffects = () => {
  expect(mocks.transaction).not.toHaveBeenCalled();
  expect(mocks.logAudit).not.toHaveBeenCalled();
  expect(loggerError).not.toHaveBeenCalled();
};

describe('PUT /api/spaces/[id]/wip-limits: validación y permisos', () => {
  it('sin sesión → 401 sin registrar errores', async () => {
    mocks.requireSession.mockRejectedValue(new Error('UNAUTHORIZED'));

    const res = await PUT(putRequest({ en_proceso: 4, en_revision: null }), ctx());

    expect(res.status).toBe(401);
    expect(mocks.requireProjectAccess).not.toHaveBeenCalled();
    expectNoSideEffects();
  });

  it('observador global → 403 sin tocar la BD', async () => {
    mocks.requireSession.mockResolvedValue({ id: userId, role: 'observador' });

    const res = await PUT(putRequest({ en_proceso: 4, en_revision: null }), ctx());

    expect(res.status).toBe(403);
    expect(mocks.requireProjectAccess).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
    expectNoSideEffects();
  });

  it.each([
    ['uuid inválido', 400, 'ID de proyecto con formato inválido'],
    ['sin acceso o sin escritura', 403, 'Sin permisos de escritura en este proyecto'],
    ['proyecto inexistente', 404, 'Proyecto no encontrado'],
    ['proyecto cerrado', 409, 'El proyecto está cerrado'],
  ])('%s → %i propagado desde requireProjectAccess', async (_label, status, message) => {
    mocks.requireProjectAccess.mockRejectedValue(httpError(message, status));

    const res = await PUT(putRequest({ en_proceso: 4, en_revision: null }), ctx());

    expect(res.status).toBe(status);
    expect((await res.json()).error).toBe(message);
    expect(mocks.requireProjectAccess).toHaveBeenCalledWith(expect.objectContaining({ id: userId }), spaceId, 'write');
    expectNoSideEffects();
  });

  it('id mal formado → 400 con el requireProjectAccess real (sin BD)', async () => {
    const real = (await vi.importActual<typeof import('@/lib/project-access')>('@/lib/project-access')).requireProjectAccess;
    mocks.requireProjectAccess.mockImplementation(real);

    const res = await PUT(putRequest({ en_proceso: 4, en_revision: null }, 'no-es-uuid'), ctx('no-es-uuid'));

    expect(res.status).toBe(400);
    expect(mocks.select).not.toHaveBeenCalled();
    expectNoSideEffects();
  });

  it.each([
    ['límite 0', { en_proceso: 0, en_revision: null }],
    ['límite 100', { en_proceso: 100, en_revision: null }],
    ['decimal', { en_proceso: 2.5, en_revision: null }],
    ['texto', { en_proceso: '4', en_revision: null }],
    ['clave ausente', { en_proceso: 4 }],
    ['clave extra', { en_proceso: 4, en_revision: null, bloqueada: 1 }],
  ])('cuerpo inválido (%s) → 400 sin transacción', async (_label, body) => {
    const res = await PUT(putRequest(body), ctx());

    expect(res.status).toBe(400);
    expectNoSideEffects();
  });

  it('JSON mal formado → 400', async () => {
    const res = await PUT(putRequest('{'), ctx());

    expect(res.status).toBe(400);
    expectNoSideEffects();
  });
});

describe('PUT /api/spaces/[id]/wip-limits: guardado y auditoría', () => {
  it('en_proceso de sin límite a 4: update con FOR UPDATE y un único logAudit legible', async () => {
    const res = await PUT(putRequest({ en_proceso: 4, en_revision: null }), ctx());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ en_proceso: 4, en_revision: null });
    expect(txForCalls).toEqual(['update']);
    expect(mocks.txSet).toHaveBeenCalledWith({
      wipLimits: { en_proceso: 4, en_revision: null },
      updatedAt: expect.any(Date),
    });
    expect(mocks.logAudit).toHaveBeenCalledTimes(1);
    expect(mocks.logAudit).toHaveBeenCalledWith(
      {
        actorId: userId,
        action: 'wip_limit_changed',
        spaceId,
        previousValue: 'Portal · En progreso: sin límite',
        newValue: 'Portal · En progreso: 4',
      },
      mocks.tx,
    );
    for (const [entry] of mocks.logAudit.mock.calls) expect(entry).not.toHaveProperty('taskId');
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('si cambian los dos límites registra dos logAudit', async () => {
    current.wipLimits = { en_proceso: 3, en_revision: 2 };

    const res = await PUT(putRequest({ en_proceso: 5, en_revision: null }), ctx());

    expect(res.status).toBe(200);
    expect(mocks.logAudit).toHaveBeenCalledTimes(2);
    expect(mocks.logAudit).toHaveBeenNthCalledWith(1, expect.objectContaining({
      action: 'wip_limit_changed', previousValue: 'Portal · En progreso: 3', newValue: 'Portal · En progreso: 5',
    }), mocks.tx);
    expect(mocks.logAudit).toHaveBeenNthCalledWith(2, expect.objectContaining({
      action: 'wip_limit_changed', previousValue: 'Portal · En code review: 2', newValue: 'Portal · En code review: sin límite',
    }), mocks.tx);
  });

  it('sin cambios responde 200 y no audita', async () => {
    current.wipLimits = { en_proceso: 4, en_revision: null };

    const res = await PUT(putRequest({ en_proceso: 4, en_revision: null }), ctx());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ en_proceso: 4, en_revision: null });
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('un valor guardado inválido se trata como sin límite', async () => {
    current.wipLimits = { en_proceso: 'x' };

    const res = await PUT(putRequest({ en_proceso: null, en_revision: null }), ctx());

    expect(res.status).toBe(200);
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });
});

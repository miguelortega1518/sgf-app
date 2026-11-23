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
  spaces: { id: 'spaces.id', businessDaysOnly: 'spaces.businessDaysOnly' },
}));
vi.mock('drizzle-orm', () => ({
  and: (...conditions: unknown[]) => ({ operator: 'and', conditions }),
  eq: (left: unknown, right: unknown) => ({ operator: 'eq', left, right }),
}));

import { PUT } from '../src/app/api/spaces/[id]/business-days/route';
import { logger } from '../src/lib/logger';

const spaceId = crypto.randomUUID();
const userId = crypto.randomUUID();

type SpaceRow = { id: string; name: string; status: string; businessDaysOnly: boolean };

let current: SpaceRow;
let txForCalls: unknown[];

function ctx(id = spaceId) {
  return { params: Promise.resolve({ id }) };
}

function putRequest(body: unknown, id = spaceId) {
  return new NextRequest(`http://localhost/api/spaces/${id}/business-days`, {
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
  current = { id: spaceId, name: 'Portal', status: 'activo', businessDaysOnly: true };
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

describe('PUT /api/spaces/[id]/business-days: validación y permisos', () => {
  it('sin sesión → 401', async () => {
    mocks.requireSession.mockRejectedValue(new Error('UNAUTHORIZED'));

    const res = await PUT(putRequest({ businessDaysOnly: false }), ctx());

    expect(res.status).toBe(401);
    expectNoSideEffects();
  });

  it('observador global → 403 sin tocar la BD', async () => {
    mocks.requireSession.mockResolvedValue({ id: userId, role: 'observador' });

    const res = await PUT(putRequest({ businessDaysOnly: false }), ctx());

    expect(res.status).toBe(403);
    expect(mocks.requireProjectAccess).not.toHaveBeenCalled();
    expectNoSideEffects();
  });

  it.each([
    ['uuid inválido', 400, 'ID de proyecto con formato inválido'],
    ['sin escritura', 403, 'Sin permisos de escritura en este proyecto'],
    ['proyecto inexistente', 404, 'Proyecto no encontrado'],
    ['proyecto cerrado', 409, 'El proyecto está cerrado'],
  ])('%s → %i propagado desde requireProjectAccess', async (_label, status, message) => {
    mocks.requireProjectAccess.mockRejectedValue(httpError(message, status));

    const res = await PUT(putRequest({ businessDaysOnly: false }), ctx());

    expect(res.status).toBe(status);
    expect((await res.json()).error).toBe(message);
    expect(mocks.requireProjectAccess).toHaveBeenCalledWith(expect.objectContaining({ id: userId }), spaceId, 'write');
    expectNoSideEffects();
  });

  it('proyecto cerrado al releer en la transacción → 409 sin update', async () => {
    mocks.txSelect.mockImplementation(() => chain([{ ...current, status: 'cerrado' }]));

    const res = await PUT(putRequest({ businessDaysOnly: false }), ctx());

    expect(res.status).toBe(409);
    expect(mocks.txUpdate).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it.each([
    ['texto', { businessDaysOnly: 'true' }],
    ['número', { businessDaysOnly: 1 }],
    ['null', { businessDaysOnly: null }],
    ['ausente', {}],
  ])('cuerpo inválido (%s) → 400 sin transacción', async (_label, body) => {
    const res = await PUT(putRequest(body), ctx());

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Indique si se cuentan sólo los días hábiles');
    expectNoSideEffects();
  });

  it('JSON mal formado → 400', async () => {
    const res = await PUT(putRequest('{'), ctx());

    expect(res.status).toBe(400);
    expectNoSideEffects();
  });
});

describe('PUT /api/spaces/[id]/business-days: guardado y auditoría', () => {
  it('de días hábiles a naturales: update con FOR UPDATE y business_days_changed legible', async () => {
    const res = await PUT(putRequest({ businessDaysOnly: false }), ctx());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ businessDaysOnly: false });
    expect(txForCalls).toEqual(['update']);
    expect(mocks.txSet).toHaveBeenCalledWith({ businessDaysOnly: false, updatedAt: expect.any(Date) });
    expect(mocks.logAudit).toHaveBeenCalledTimes(1);
    expect(mocks.logAudit).toHaveBeenCalledWith(
      {
        actorId: userId,
        action: 'business_days_changed',
        spaceId,
        previousValue: 'Portal: Sólo días hábiles (RD)',
        newValue: 'Portal: Días naturales',
      },
      mocks.tx,
    );
  });

  it('de naturales a días hábiles', async () => {
    current.businessDaysOnly = false;

    const res = await PUT(putRequest({ businessDaysOnly: true }), ctx());

    expect(res.status).toBe(200);
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({
      previousValue: 'Portal: Días naturales',
      newValue: 'Portal: Sólo días hábiles (RD)',
    }), mocks.tx);
  });

  it('sin cambio → 200 sin update ni auditoría', async () => {
    const res = await PUT(putRequest({ businessDaysOnly: true }), ctx());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ businessDaysOnly: true });
    expect(mocks.txUpdate).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });
});

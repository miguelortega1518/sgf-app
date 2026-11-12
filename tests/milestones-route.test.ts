import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  const txSelect = vi.fn();
  const txFrom = vi.fn();
  const txSelectWhere = vi.fn();
  const txFor = vi.fn();
  const txUpdate = vi.fn();
  const txSet = vi.fn();
  const txUpdateWhere = vi.fn();
  const txReturning = vi.fn();
  return {
    requireSession: vi.fn(),
    requireProjectAccess: vi.fn(),
    logAudit: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
    txSelect,
    txFrom,
    txSelectWhere,
    txFor,
    txUpdate,
    txSet,
    txUpdateWhere,
    txReturning,
    tx: { select: txSelect, update: txUpdate },
  };
});

vi.mock('@/lib/auth', () => ({
  requireSession: mocks.requireSession,
}));
vi.mock('@/lib/db', () => ({
  db: { select: mocks.select, update: mocks.update, transaction: mocks.transaction },
}));
vi.mock('@/lib/audit', () => ({
  logAudit: mocks.logAudit,
}));
vi.mock('@/lib/project-access', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/project-access')>()),
  requireProjectAccess: mocks.requireProjectAccess,
}));
vi.mock('@/lib/db/schema', () => ({
  milestones: { id: 'id', spaceId: 'spaceId', order: 'order' },
  tasks: { spaceId: 'spaceId', milestoneId: 'milestoneId' },
}));
vi.mock('drizzle-orm', () => ({
  and: (...conditions: unknown[]) => ({ operator: 'and', conditions }),
  eq: (left: unknown, right: unknown) => ({ operator: 'eq', left, right }),
  asc: (column: unknown) => ({ operator: 'asc', column }),
  count: () => ({ operator: 'count' }),
}));

import { PATCH } from '../src/app/api/spaces/[id]/milestones/route';
import { logger } from '../src/lib/logger';

const spaceId = crypto.randomUUID();
const userId = crypto.randomUUID();

function ctx() {
  return { params: Promise.resolve({ id: spaceId }) };
}

function patchRequest(body: unknown) {
  return new NextRequest(`http://localhost/api/spaces/${spaceId}/milestones`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function existingMilestone(overrides: Partial<{ id: string; name: string; targetDate: string }> = {}) {
  return {
    id: crypto.randomUUID(),
    spaceId,
    name: 'Beta',
    targetDate: '2026-12-01',
    targetDateOriginal: '2026-12-01',
    completed: false,
    order: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('PATCH /api/spaces/[id]/milestones', () => {
  let loggerError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    loggerError = vi.spyOn(logger, 'error').mockImplementation(() => {});
    mocks.requireSession.mockResolvedValue({ id: userId, role: 'miembro' });
    mocks.requireProjectAccess.mockResolvedValue(undefined);
    mocks.logAudit.mockResolvedValue(undefined);

    mocks.transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(mocks.tx));
    mocks.txSelect.mockReturnValue({ from: mocks.txFrom });
    mocks.txFrom.mockReturnValue({ where: mocks.txSelectWhere });
    mocks.txSelectWhere.mockReturnValue({ for: mocks.txFor });
    mocks.txFor.mockResolvedValue([]);
    mocks.txUpdate.mockReturnValue({ set: mocks.txSet });
    mocks.txSet.mockReturnValue({ where: mocks.txUpdateWhere });
    mocks.txUpdateWhere.mockReturnValue({ returning: mocks.txReturning });
    mocks.txReturning.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registra milestone_date_changed en la misma transacción al cambiar targetDate', async () => {
    const milestone = existingMilestone();
    mocks.txFor.mockResolvedValue([milestone]);
    mocks.txReturning.mockResolvedValue([{ ...milestone, targetDate: '2026-12-15' }]);

    const response = await PATCH(patchRequest({ milestoneId: milestone.id, targetDate: '2026-12-15' }), ctx());

    expect(response.status).toBe(200);
    expect((await response.json()).targetDate).toBe('2026-12-15');
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.txFor).toHaveBeenCalledWith('update');
    expect(mocks.txUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.txSet).toHaveBeenCalledWith(expect.objectContaining({ targetDate: '2026-12-15' }));
    expect(mocks.logAudit).toHaveBeenCalledTimes(1);
    expect(mocks.logAudit).toHaveBeenCalledWith(
      {
        actorId: userId,
        action: 'milestone_date_changed',
        spaceId,
        previousValue: 'Beta: 2026-12-01',
        newValue: 'Beta: 2026-12-15',
      },
      mocks.tx,
    );
  });

  it('misma targetDate no audita', async () => {
    const milestone = existingMilestone();
    mocks.txFor.mockResolvedValue([milestone]);
    mocks.txReturning.mockResolvedValue([milestone]);

    const response = await PATCH(patchRequest({ milestoneId: milestone.id, targetDate: '2026-12-01' }), ctx());

    expect(response.status).toBe(200);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.txUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it.each([
    ['name', { name: 'Release candidate' }],
    ['completed', { completed: true }],
    ['order', { order: 3 }],
  ])('sólo %s: actualiza sin auditar', async (_label, fields) => {
    const milestone = existingMilestone();
    mocks.txFor.mockResolvedValue([milestone]);
    mocks.txReturning.mockResolvedValue([{ ...milestone, ...fields }]);

    const response = await PATCH(patchRequest({ milestoneId: milestone.id, ...fields }), ctx());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject(fields);
    expect(mocks.txSet).toHaveBeenCalledWith(expect.objectContaining(fields));
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('cambia name y targetDate a la vez: audita una vez con el nombre previo', async () => {
    const milestone = existingMilestone();
    mocks.txFor.mockResolvedValue([milestone]);
    mocks.txReturning.mockResolvedValue([{ ...milestone, name: 'GA', targetDate: '2027-01-10' }]);

    const response = await PATCH(
      patchRequest({ milestoneId: milestone.id, name: 'GA', targetDate: '2027-01-10' }),
      ctx(),
    );

    expect(response.status).toBe(200);
    expect(mocks.logAudit).toHaveBeenCalledTimes(1);
    expect(mocks.logAudit).toHaveBeenCalledWith(
      {
        actorId: userId,
        action: 'milestone_date_changed',
        spaceId,
        previousValue: 'Beta: 2026-12-01',
        newValue: 'Beta: 2027-01-10',
      },
      mocks.tx,
    );
  });

  it('responde 404 si el hito no existe o es de otro proyecto, sin update ni auditoría', async () => {
    const milestoneId = crypto.randomUUID();
    mocks.txFor.mockResolvedValue([]);

    const response = await PATCH(patchRequest({ milestoneId, targetDate: '2026-12-15' }), ctx());

    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe('Hito no encontrado');
    expect(mocks.txSelectWhere).toHaveBeenCalledWith({
      operator: 'and',
      conditions: [
        { operator: 'eq', left: 'id', right: milestoneId },
        { operator: 'eq', left: 'spaceId', right: spaceId },
      ],
    });
    expect(mocks.txUpdate).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it.each([
    ['body sin milestoneId', { targetDate: '2026-12-15' }],
    ['milestoneId no UUID', { milestoneId: 'no-es-uuid', targetDate: '2026-12-15' }],
    ['targetDate inválida', { milestoneId: crypto.randomUUID(), targetDate: '2026-02-30' }],
  ])('responde 400 con %s, sin transacción ni auditoría', async (_label, body) => {
    const response = await PATCH(patchRequest(body), ctx());

    expect(response.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('responde 401 sin sesión, sin transacción ni auditoría', async () => {
    mocks.requireSession.mockRejectedValue(new Error('UNAUTHORIZED'));

    const response = await PATCH(patchRequest({ milestoneId: crypto.randomUUID(), targetDate: '2026-12-15' }), ctx());

    expect(response.status).toBe(401);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('responde 403 para observador, sin transacción ni auditoría', async () => {
    mocks.requireSession.mockResolvedValue({ id: userId, role: 'observador' });

    const response = await PATCH(patchRequest({ milestoneId: crypto.randomUUID(), targetDate: '2026-12-15' }), ctx());

    expect(response.status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('si falla logAudit no responde 200', async () => {
    const milestone = existingMilestone();
    mocks.txFor.mockResolvedValue([milestone]);
    mocks.txReturning.mockResolvedValue([{ ...milestone, targetDate: '2026-12-15' }]);
    mocks.logAudit.mockRejectedValue(new Error('audit failed'));

    const response = await PATCH(patchRequest({ milestoneId: milestone.id, targetDate: '2026-12-15' }), ctx());

    expect(mocks.logAudit).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(500);
    expect(loggerError).toHaveBeenCalled();
  });
});

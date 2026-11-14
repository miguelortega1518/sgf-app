import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  const txInsert = vi.fn();
  const txValues = vi.fn();
  const txReturning = vi.fn();
  return {
    requireSession: vi.fn(),
    requireProjectAccess: vi.fn(),
    validateTaskReferences: vi.fn(),
    logAudit: vi.fn(),
    notify: vi.fn(),
    transaction: vi.fn(),
    txInsert,
    txValues,
    txReturning,
    tx: { insert: txInsert },
  };
});

vi.mock('@/lib/auth', () => ({ requireSession: mocks.requireSession }));
vi.mock('@/lib/db', () => ({ db: { transaction: mocks.transaction } }));
vi.mock('@/lib/audit', () => ({ logAudit: mocks.logAudit }));
vi.mock('@/lib/notify', () => ({ notify: mocks.notify }));
vi.mock('@/lib/project-access', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/project-access')>()),
  requireProjectAccess: mocks.requireProjectAccess,
  validateTaskReferences: mocks.validateTaskReferences,
}));

import { POST } from '../src/app/api/tasks/route';
import { logger } from '../src/lib/logger';

const userId = crypto.randomUUID();
const spaceId = crypto.randomUUID();
const leaderId = crypto.randomUUID();
const ana = crypto.randomUUID();
const beto = crypto.randomUUID();
const taskId = crypto.randomUUID();

function postRequest(body: unknown) {
  return new NextRequest('http://localhost/api/tasks', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return { spaceId, title: 'Filtros guardados', responsibleId: ana, ...overrides };
}

function httpError(message: string, httpStatus: number) {
  return Object.assign(new Error(message), { httpStatus });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireSession.mockResolvedValue({ id: userId, role: 'miembro' });
  mocks.requireProjectAccess.mockResolvedValue({ id: spaceId, leaderId });
  mocks.validateTaskReferences.mockResolvedValue(undefined);
  mocks.logAudit.mockResolvedValue(undefined);
  mocks.notify.mockResolvedValue(null);
  mocks.txInsert.mockReturnValue({ values: mocks.txValues });
  mocks.txValues.mockImplementation((values: Record<string, unknown>) => {
    mocks.txReturning.mockResolvedValue([{ id: taskId, number: 12, ...values }]);
    return { returning: mocks.txReturning };
  });
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mocks.tx));
});

afterEach(() => {
  vi.restoreAllMocks();
});

function intentsOfType(type: string) {
  return mocks.notify.mock.calls.map(c => c[0]).filter(i => i.type === type);
}

describe('POST /api/tasks: avisos de asignación', () => {
  it('avisa task_assigned al responsable ajeno después de la transacción', async () => {
    const res = await POST(postRequest(validBody()));

    expect(res.status).toBe(201);
    expect(mocks.notify).toHaveBeenCalledTimes(1);
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({
      recipientId: ana,
      type: 'task_assigned',
      taskId,
      title: 'Te asignaron: FOR-12 Filtros guardados',
    }));
    const transactionResolvedOrder = mocks.logAudit.mock.invocationCallOrder[0];
    expect(mocks.notify.mock.invocationCallOrder[0]).toBeGreaterThan(transactionResolvedOrder);
    expect(mocks.notify.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.transaction.mock.invocationCallOrder[0]);
  });

  it('no notifica dentro de la transacción', async () => {
    let notifyCallsInsideTx = -1;
    mocks.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const result = await fn(mocks.tx);
      notifyCallsInsideTx = mocks.notify.mock.calls.length;
      return result;
    });

    const res = await POST(postRequest(validBody()));

    expect(res.status).toBe(201);
    expect(notifyCallsInsideTx).toBe(0);
    expect(mocks.notify).toHaveBeenCalledTimes(1);
  });

  it('no avisa task_assigned si el creador se autoasigna', async () => {
    const res = await POST(postRequest(validBody({ responsibleId: userId })));

    expect(res.status).toBe(201);
    expect(intentsOfType('task_assigned')).toEqual([]);
  });

  it('avisa review_assigned al revisor explícito', async () => {
    const res = await POST(postRequest(validBody({ reviewerId: beto })));

    expect(res.status).toBe(201);
    expect(intentsOfType('review_assigned')).toEqual([
      expect.objectContaining({
        recipientId: beto,
        taskId,
        title: 'Te pidieron revisar: FOR-12 Filtros guardados',
      }),
    ]);
  });

  it('no avisa al líder que queda de revisor por defecto', async () => {
    const res = await POST(postRequest(validBody()));

    expect(res.status).toBe(201);
    expect(mocks.txValues).toHaveBeenCalledWith(expect.objectContaining({ reviewerId: leaderId }));
    expect(intentsOfType('review_assigned')).toEqual([]);
    expect(mocks.notify.mock.calls.some(c => c[0].recipientId === leaderId)).toBe(false);
  });

  it('responde 201 aunque notify rechace', async () => {
    mocks.notify.mockRejectedValue(new Error('smtp caído'));

    const res = await POST(postRequest(validBody({ reviewerId: beto })));

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data).toMatchObject({ id: taskId, title: 'Filtros guardados' });
  });

  it('no llama a notify si el cuerpo es inválido (400)', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    const res = await POST(postRequest({ spaceId, title: '' }));

    expect(res.status).toBe(400);
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('no llama a notify si validateTaskReferences lanza 400', async () => {
    mocks.validateTaskReferences.mockRejectedValue(httpError('Responsable inválido', 400));

    const res = await POST(postRequest(validBody()));

    expect(res.status).toBe(400);
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('no llama a notify si no hay acceso de escritura (403)', async () => {
    mocks.requireProjectAccess.mockRejectedValue(httpError('Sin acceso a este proyecto', 403));

    const res = await POST(postRequest(validBody()));

    expect(res.status).toBe(403);
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('no llama a notify sin sesión (401)', async () => {
    mocks.requireSession.mockRejectedValue(new Error('UNAUTHORIZED'));

    const res = await POST(postRequest(validBody()));

    expect(res.status).toBe(401);
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});

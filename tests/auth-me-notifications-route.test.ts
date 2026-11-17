import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  const txSelect = vi.fn();
  const txFrom = vi.fn();
  const txSelectWhere = vi.fn();
  const txLimit = vi.fn();
  const txFor = vi.fn();
  const txUpdate = vi.fn();
  const txSet = vi.fn();
  const txUpdateWhere = vi.fn();
  return {
    requireSession: vi.fn(),
    logAudit: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
    txSelect,
    txFrom,
    txSelectWhere,
    txLimit,
    txFor,
    txUpdate,
    txSet,
    txUpdateWhere,
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
vi.mock('@/lib/db/schema', () => ({
  persons: {
    id: 'persons.id',
    emailImmediate: 'persons.emailImmediate',
    emailDigest: 'persons.emailDigest',
  },
}));
vi.mock('drizzle-orm', () => ({
  eq: (left: unknown, right: unknown) => ({ operator: 'eq', left, right }),
}));

import { PATCH } from '../src/app/api/auth/me/notifications/route';
import { logger } from '../src/lib/logger';

const userId = crypto.randomUUID();
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function patchRequest(body: unknown) {
  return new NextRequest('http://localhost/api/auth/me/notifications', {
    method: 'PATCH',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

let loggerError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  loggerError = vi.spyOn(logger, 'error').mockImplementation(() => {});
  mocks.requireSession.mockResolvedValue({ id: userId, name: 'Ana', email: 'ana@example.com', role: 'miembro' });
  mocks.logAudit.mockResolvedValue(undefined);

  mocks.transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(mocks.tx));
  mocks.txSelect.mockReturnValue({ from: mocks.txFrom });
  mocks.txFrom.mockReturnValue({ where: mocks.txSelectWhere });
  mocks.txSelectWhere.mockReturnValue({ limit: mocks.txLimit });
  mocks.txLimit.mockReturnValue({ for: mocks.txFor });
  mocks.txFor.mockResolvedValue([{ emailImmediate: true, emailDigest: true }]);
  mocks.txUpdate.mockReturnValue({ set: mocks.txSet });
  mocks.txSet.mockReturnValue({ where: mocks.txUpdateWhere });
  mocks.txUpdateWhere.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PATCH /api/auth/me/notifications', () => {
  it('desactiva los avisos inmediatos, actualiza la fila de la sesión y audita en la transacción', async () => {
    const response = await PATCH(patchRequest({ emailImmediate: false }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ emailImmediate: false, emailDigest: true });
    expect(mocks.requireSession).toHaveBeenCalledTimes(1);
    expect(mocks.requireSession.mock.calls[0]).toEqual([]);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();

    expect(mocks.txSelectWhere).toHaveBeenCalledWith({ operator: 'eq', left: 'persons.id', right: userId });
    expect(mocks.txFor).toHaveBeenCalledWith('update');

    expect(mocks.txSet).toHaveBeenCalledTimes(1);
    const set = mocks.txSet.mock.calls[0][0];
    expect(set).toMatchObject({ emailImmediate: false, emailDigest: true });
    expect(set.updatedAt).toBeInstanceOf(Date);
    expect(mocks.txUpdateWhere).toHaveBeenCalledWith({ operator: 'eq', left: 'persons.id', right: userId });

    expect(mocks.logAudit).toHaveBeenCalledTimes(1);
    expect(mocks.logAudit).toHaveBeenCalledWith(
      {
        actorId: userId,
        action: 'email_preferences_changed',
        previousValue: 'Avisos inmediatos: sí · Resumen diario: sí',
        newValue: 'Avisos inmediatos: no · Resumen diario: sí',
      },
      mocks.tx,
    );
    const audit = mocks.logAudit.mock.calls[0][0];
    expect(audit.previousValue).not.toMatch(UUID_RE);
    expect(audit.newValue).not.toMatch(UUID_RE);
    expect(audit).not.toHaveProperty('taskId');
    expect(audit).not.toHaveProperty('spaceId');
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('cambia las dos preferencias a la vez', async () => {
    mocks.txFor.mockResolvedValue([{ emailImmediate: false, emailDigest: false }]);

    const response = await PATCH(patchRequest({ emailImmediate: true, emailDigest: true }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ emailImmediate: true, emailDigest: true });
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        previousValue: 'Avisos inmediatos: no · Resumen diario: no',
        newValue: 'Avisos inmediatos: sí · Resumen diario: sí',
      }),
      mocks.tx,
    );
  });

  it('mismo valor que el actual: 200 sin update ni auditoría', async () => {
    mocks.txFor.mockResolvedValue([{ emailImmediate: true, emailDigest: false }]);

    const response = await PATCH(patchRequest({ emailDigest: false }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ emailImmediate: true, emailDigest: false });
    expect(mocks.txUpdate).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('si la persona no existe responde 404 sin update ni auditoría', async () => {
    mocks.txFor.mockResolvedValue([]);

    const response = await PATCH(patchRequest({ emailImmediate: false }));

    expect(response.status).toBe(404);
    expect(mocks.txUpdate).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('responde 401 sin sesión, sin transacción ni auditoría', async () => {
    mocks.requireSession.mockRejectedValue(new Error('UNAUTHORIZED'));

    const response = await PATCH(patchRequest({ emailImmediate: false }));

    expect(response.status).toBe(401);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it.each([
    ['cuerpo vacío', {}],
    ['clave extra personId', { personId: crypto.randomUUID(), emailImmediate: false }],
    ['valor no booleano', { emailImmediate: 'no' }],
    ['null', { emailDigest: null }],
    ['un array', [true]],
  ])('responde 400 con %s, sin transacción ni auditoría', async (_label, body) => {
    const response = await PATCH(patchRequest(body));

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(typeof json.error).toBe('string');
    expect(json.error.length).toBeGreaterThan(0);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it.each([
    ['cuerpo vacío', {}, 'Indica al menos una preferencia'],
    ['clave extra', { personId: crypto.randomUUID(), emailImmediate: false }, 'Sólo se admiten las preferencias emailImmediate y emailDigest'],
    ['emailImmediate no booleano', { emailImmediate: 'no' }, 'Los avisos inmediatos deben ser verdadero o falso'],
    ['emailDigest no booleano', { emailDigest: 1 }, 'El resumen diario debe ser verdadero o falso'],
    ['no es un objeto', [true], 'El cuerpo debe ser un objeto con las preferencias de correo'],
  ])('%s: el mensaje está en español', async (_label, body, message) => {
    const response = await PATCH(patchRequest(body));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(message);
  });

  it('JSON inválido: 400', async () => {
    const response = await PATCH(patchRequest('{no es json'));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('JSON inválido');
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('si falla logAudit responde 500', async () => {
    mocks.logAudit.mockRejectedValue(new Error('audit failed'));

    const response = await PATCH(patchRequest({ emailImmediate: false }));

    expect(response.status).toBe(500);
    expect(loggerError).toHaveBeenCalled();
  });
});

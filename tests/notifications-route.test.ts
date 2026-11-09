import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
  select: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  requireSession: mocks.requireSession,
}));
vi.mock('@/lib/db', () => ({
  db: { update: mocks.update, select: mocks.select },
}));
vi.mock('@/lib/db/schema', () => ({
  notifications: { id: 'id', recipientId: 'recipientId', read: 'read', createdAt: 'createdAt' },
}));
vi.mock('drizzle-orm', () => ({
  and: (...conditions: unknown[]) => ({ operator: 'and', conditions }),
  eq: (left: unknown, right: unknown) => ({ operator: 'eq', left, right }),
  inArray: (left: unknown, values: unknown[]) => ({ operator: 'inArray', left, values }),
  desc: (column: unknown) => ({ operator: 'desc', column }),
  sql: (strings: TemplateStringsArray) => ({ operator: 'sql', text: strings.join('') }),
}));

import { PATCH } from '../src/app/api/notifications/route';
import { notifications } from '@/lib/db/schema';
import { logger } from '../src/lib/logger';

function patchRequest(body: unknown, raw = false) {
  return new NextRequest('http://localhost/api/notifications', {
    method: 'PATCH',
    body: raw ? (body as string) : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('PATCH /api/notifications', () => {
  let loggerError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    loggerError = vi.spyOn(logger, 'error').mockImplementation(() => {});
    mocks.requireSession.mockResolvedValue({ id: 'user-1', role: 'miembro' });
    mocks.update.mockReturnValue({ set: mocks.set });
    mocks.set.mockReturnValue({ where: mocks.where });
    mocks.where.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rechaza ids que no son UUID', async () => {
    const response = await PATCH(patchRequest({ ids: ['no-es-uuid'] }));

    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('rechaza más de 100 ids', async () => {
    const ids = Array.from({ length: 101 }, () => crypto.randomUUID());
    const response = await PATCH(patchRequest({ ids }));

    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('acepta exactamente 100 ids', async () => {
    const ids = Array.from({ length: 100 }, () => crypto.randomUUID());
    const response = await PATCH(patchRequest({ ids }));

    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['cuerpo sin ids', {}],
    ['ids no es array', { ids: 'abc' }],
    ['array vacío', { ids: [] }],
  ])('rechaza %s', async (_label, body) => {
    const response = await PATCH(patchRequest(body));

    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('responde 400 con JSON mal formado', async () => {
    const response = await PATCH(patchRequest('{', true));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'JSON inválido' });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('marca como leídas en una sola consulta y deduplica los ids', async () => {
    const idA = crypto.randomUUID();
    const idB = crypto.randomUUID();

    const response = await PATCH(patchRequest({ ids: [idA, idB, idA] }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith(notifications);
    expect(mocks.set).toHaveBeenCalledWith({ read: true });
    expect(mocks.where).toHaveBeenCalledTimes(1);
    expect(mocks.where).toHaveBeenCalledWith({
      operator: 'and',
      conditions: [
        { operator: 'inArray', left: 'id', values: [idA, idB] },
        { operator: 'eq', left: 'recipientId', right: 'user-1' },
      ],
    });
  });

  it('responde 401 sin sesión', async () => {
    mocks.requireSession.mockRejectedValue(new Error('UNAUTHORIZED'));

    const response = await PATCH(patchRequest({ ids: [crypto.randomUUID()] }));

    expect(response.status).toBe(401);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

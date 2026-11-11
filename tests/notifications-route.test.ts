import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  selectWhere: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  offset: vi.fn(),
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

import { GET, PATCH } from '../src/app/api/notifications/route';
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

function getRequest(query = '') {
  return new NextRequest(`http://localhost/api/notifications${query}`);
}

describe('GET /api/notifications', () => {
  let loggerError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    loggerError = vi.spyOn(logger, 'error').mockImplementation(() => {});
    mocks.requireSession.mockResolvedValue({ id: 'user-1', role: 'miembro' });
    mocks.select.mockReturnValue({ from: mocks.from });
    mocks.from.mockReturnValue({ where: mocks.selectWhere });
    // Primera consulta: count (where resuelve). Segunda: listado (where → orderBy → limit → offset).
    mocks.selectWhere.mockReset();
    mocks.selectWhere
      .mockReturnValueOnce(Promise.resolve([{ count: 45 }]))
      .mockReturnValueOnce({ orderBy: mocks.orderBy });
    mocks.orderBy.mockReturnValue({ limit: mocks.limit });
    mocks.limit.mockReturnValue({ offset: mocks.offset });
    mocks.offset.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(['page=abc', 'page=0', 'limit=abc', 'limit=0', 'limit=51', 'limit=500'])(
    'responde 400 con %s sin consultar la base',
    async (query) => {
      const response = await GET(getRequest(`?${query}`));

      expect(response.status).toBe(400);
      expect((await response.json()).error).toEqual(expect.any(String));
      expect(mocks.select).not.toHaveBeenCalled();
      expect(loggerError).not.toHaveBeenCalled();
    },
  );

  it('rechaza limit=500 con 400 (no se recorta a 50)', async () => {
    const response = await GET(getRequest('?limit=500'));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/limit/);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.limit).not.toHaveBeenCalled();
  });

  it('sin parámetros usa page=1 y limit=20', async () => {
    const response = await GET(getRequest());

    expect(response.status).toBe(200);
    expect(mocks.limit).toHaveBeenCalledWith(20);
    expect(mocks.offset).toHaveBeenCalledWith(0);
    expect(await response.json()).toEqual({ data: [], total: 45, page: 1, totalPages: 3 });
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('con page=3&limit=10 calcula offset 20', async () => {
    const response = await GET(getRequest('?page=3&limit=10'));

    expect(response.status).toBe(200);
    expect(mocks.limit).toHaveBeenCalledWith(10);
    expect(mocks.offset).toHaveBeenCalledWith(20);
    expect(await response.json()).toEqual({ data: [], total: 45, page: 3, totalPages: 5 });
  });

  it('countOnly=true sin page ni limit devuelve { unreadCount }', async () => {
    mocks.selectWhere.mockReset();
    mocks.selectWhere.mockResolvedValue([{ count: 7 }]);

    const response = await GET(getRequest('?countOnly=true'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ unreadCount: 7 });
    expect(mocks.select).toHaveBeenCalledTimes(1);
  });

  it('responde 401 sin sesión, antes de validar y sin consultar la base', async () => {
    mocks.requireSession.mockRejectedValue(new Error('UNAUTHORIZED'));

    const response = await GET(getRequest('?page=abc'));

    expect(response.status).toBe(401);
    expect(mocks.select).not.toHaveBeenCalled();
  });
});

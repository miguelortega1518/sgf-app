import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  requireSession: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  selectWhere: vi.fn(),
  limit: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  insertReturning: vi.fn(),
  delete: vi.fn(),
  deleteWhere: vi.fn(),
  deleteReturning: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  requireRole: mocks.requireRole,
  requireSession: mocks.requireSession,
}));
vi.mock('@/lib/db', () => ({
  db: { select: mocks.select, insert: mocks.insert, delete: mocks.delete },
}));
vi.mock('@/lib/db/schema', () => ({
  holidays: { date: 'date', description: 'description' },
}));
vi.mock('drizzle-orm', () => ({
  eq: (left: unknown, right: unknown) => ({ operator: 'eq', left, right }),
  asc: (column: unknown) => ({ operator: 'asc', column }),
}));

import { POST, DELETE } from '../src/app/api/holidays/route';
import { holidays } from '@/lib/db/schema';
import { logger } from '../src/lib/logger';
import { createHolidaySchema, deleteHolidaySchema } from '../src/lib/schemas/holiday';

function request(method: 'POST' | 'DELETE', body: unknown, raw = false) {
  return new NextRequest('http://localhost/api/holidays', {
    method,
    body: raw ? (body as string) : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

let loggerError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  loggerError = vi.spyOn(logger, 'error').mockImplementation(() => {});
  mocks.requireRole.mockResolvedValue({ id: 'admin-1', role: 'admin' });
  mocks.select.mockReturnValue({ from: mocks.from });
  mocks.from.mockReturnValue({ where: mocks.selectWhere });
  mocks.selectWhere.mockReturnValue({ limit: mocks.limit });
  mocks.limit.mockResolvedValue([]);
  mocks.insert.mockReturnValue({ values: mocks.values });
  mocks.values.mockReturnValue({ returning: mocks.insertReturning });
  mocks.insertReturning.mockImplementation(async () => [mocks.values.mock.calls[0]?.[0]]);
  mocks.delete.mockReturnValue({ where: mocks.deleteWhere });
  mocks.deleteWhere.mockReturnValue({ returning: mocks.deleteReturning });
  mocks.deleteReturning.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createHolidaySchema / deleteHolidaySchema', () => {
  it('acepta una fecha real y recorta la descripción', () => {
    const result = createHolidaySchema.safeParse({ date: '2026-12-25', description: '  Navidad ' });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ date: '2026-12-25', description: 'Navidad' });
  });

  it.each(['2026-02-30', '2026-13-01', 'abc', ''])('rechaza la fecha %j', (date) => {
    const create = createHolidaySchema.safeParse({ date, description: 'X' });
    const del = deleteHolidaySchema.safeParse({ date });
    expect(create.success).toBe(false);
    expect(create.error?.issues[0].message).toBe('Fecha inválida');
    expect(del.success).toBe(false);
    expect(del.error?.issues[0].message).toBe('Fecha inválida');
  });

  it('rechaza una descripción de más de 200 caracteres', () => {
    const result = createHolidaySchema.safeParse({ date: '2026-12-25', description: 'a'.repeat(201) });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe('La descripción no puede superar 200 caracteres');
  });
});

describe('POST /api/holidays', () => {
  it('rechaza 2026-02-30 con 400 sin tocar la BD', async () => {
    const response = await POST(request('POST', { date: '2026-02-30', description: 'Falso' }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Fecha inválida' });
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it.each(['2026-13-01', '2026-02-30', 'abc'])('rechaza la fecha %s', async (date) => {
    const response = await POST(request('POST', { date, description: 'Feriado' }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Fecha inválida' });
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it.each([
    ['sólo espacios', { date: '2026-12-25', description: '   ' }],
    ['ausente', { date: '2026-12-25' }],
  ])('rechaza la descripción %s', async (_label, body) => {
    const response = await POST(request('POST', body));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'La descripción es requerida' });
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('crea el feriado con la descripción recortada', async () => {
    const response = await POST(request('POST', { date: '2026-12-25', description: '  Navidad  ' }));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ date: '2026-12-25', description: 'Navidad' });
    expect(mocks.insert).toHaveBeenCalledWith(holidays);
    expect(mocks.values).toHaveBeenCalledWith({ date: '2026-12-25', description: 'Navidad' });
    expect(mocks.selectWhere).toHaveBeenCalledWith({ operator: 'eq', left: 'date', right: '2026-12-25' });
  });

  it('mantiene el 400 si ya existe un feriado en esa fecha', async () => {
    mocks.limit.mockResolvedValue([{ date: '2026-12-25', description: 'Navidad' }]);

    const response = await POST(request('POST', { date: '2026-12-25', description: 'Navidad' }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Ya existe un feriado en esa fecha' });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('responde 403 sin rol admin', async () => {
    mocks.requireRole.mockRejectedValue(new Error('FORBIDDEN'));

    const response = await POST(request('POST', { date: '2026-12-25', description: 'Navidad' }));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Sin permisos' });
    expect(mocks.requireRole).toHaveBeenCalledWith('admin');
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('responde 400 con JSON mal formado', async () => {
    const response = await POST(request('POST', '{', true));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'JSON inválido' });
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/holidays', () => {
  it.each(['abc', '', '2026-02-30'])('rechaza la fecha %j con 400', async (date) => {
    const response = await DELETE(request('DELETE', { date }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Fecha inválida' });
    expect(mocks.delete).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('responde 404 si no existe el feriado', async () => {
    mocks.deleteReturning.mockResolvedValue([]);

    const response = await DELETE(request('DELETE', { date: '2026-12-25' }));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Feriado no encontrado' });
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('borra el feriado existente y responde 200', async () => {
    mocks.deleteReturning.mockResolvedValue([{ date: '2026-12-25', description: 'Navidad' }]);

    const response = await DELETE(request('DELETE', { date: '2026-12-25' }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true });
    expect(mocks.delete).toHaveBeenCalledWith(holidays);
    expect(mocks.deleteWhere).toHaveBeenCalledWith({ operator: 'eq', left: 'date', right: '2026-12-25' });
    expect(mocks.deleteReturning).toHaveBeenCalledTimes(1);
  });

  it('responde 403 sin rol admin', async () => {
    mocks.requireRole.mockRejectedValue(new Error('FORBIDDEN'));

    const response = await DELETE(request('DELETE', { date: '2026-12-25' }));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Sin permisos' });
    expect(mocks.requireRole).toHaveBeenCalledWith('admin');
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it('responde 400 con JSON mal formado', async () => {
    const response = await DELETE(request('DELETE', '{', true));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'JSON inválido' });
    expect(mocks.delete).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });
});

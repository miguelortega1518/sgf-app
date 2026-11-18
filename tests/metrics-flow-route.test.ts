import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  accessibleSpaceIds: vi.fn(),
  requireProjectAccess: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  loadStatusEvents: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ requireSession: mocks.requireSession }));
vi.mock('@/lib/project-access', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/project-access')>()),
  accessibleSpaceIds: mocks.accessibleSpaceIds,
  requireProjectAccess: mocks.requireProjectAccess,
}));
vi.mock('@/lib/db', () => ({ db: { select: mocks.select } }));
vi.mock('@/lib/status-history-query', () => ({ loadStatusEvents: mocks.loadStatusEvents }));

import { GET } from '../src/app/api/metrics/flow/route';
import { logger } from '../src/lib/logger';

// 21:00 RD del 17 de noviembre.
const NOW = new Date('2026-11-18T01:00:00Z');
const DAY = 86_400_000;
const ago = (n: number) => new Date(NOW.getTime() - n * DAY);

type Row = { id: string; status: string; createdAt: Date; completedAt: Date | null };
const row = (over: Partial<Row>): Row => ({
  id: crypto.randomUUID(), status: 'no_iniciada', createdAt: ago(100), completedAt: null, ...over,
});

const request = (query = '') => new NextRequest(`http://localhost/api/metrics/flow${query}`);

describe('GET /api/metrics/flow', () => {
  let loggerError: ReturnType<typeof vi.spyOn>;
  let rows: Row[];
  let open: Row[];
  let recentDone: Row;
  let doneIn80: Row;
  let oldDone: Row;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    loggerError = vi.spyOn(logger, 'error').mockImplementation(() => {});

    open = [
      row({ status: 'no_iniciada', createdAt: ago(10) }),
      row({ status: 'en_proceso', createdAt: ago(20) }),
      row({ status: 'bloqueada', createdAt: ago(5) }),
    ];
    recentDone = row({ status: 'completada', createdAt: ago(30), completedAt: ago(2) });
    doneIn80 = row({ status: 'completada', createdAt: ago(100), completedAt: ago(80) });
    oldDone = row({ status: 'completada', createdAt: ago(300), completedAt: ago(200) });
    rows = [...open, recentDone, doneIn80, oldDone];

    mocks.requireSession.mockResolvedValue({ id: 'user-1', role: 'admin' });
    mocks.accessibleSpaceIds.mockResolvedValue(null);
    mocks.requireProjectAccess.mockResolvedValue({ id: 'space', status: 'activo' });
    mocks.select.mockReturnValue({ from: mocks.from });
    mocks.from.mockReturnValue({ where: mocks.where });
    mocks.where.mockImplementation(async () => rows);
    mocks.loadStatusEvents.mockImplementation(async () => new Map([
      [recentDone.id, [
        { taskId: recentDone.id, previousValue: 'no_iniciada', newValue: 'en_proceso', at: ago(6) },
        { taskId: recentDone.id, previousValue: 'en_proceso', newValue: 'completada', at: ago(2) },
      ]],
    ]));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('401 sin sesión, sin consultar ni registrar errores', async () => {
    mocks.requireSession.mockRejectedValue(new Error('UNAUTHORIZED'));
    const res = await GET(request());
    expect(res.status).toBe(401);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.loadStatusEvents).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it.each(['0', '6', '91', '2.5', 'abc', ''])('days=%s → 400 sin tocar la BD', async days => {
    const res = await GET(request(`?days=${days}`));
    expect(res.status).toBe(400);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.accessibleSpaceIds).not.toHaveBeenCalled();
    expect(mocks.requireProjectAccess).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('spaceId mal formado → 400 sin tocar la BD', async () => {
    const res = await GET(request('?spaceId=no-es-uuid'));
    expect(res.status).toBe(400);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.requireProjectAccess).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('con spaceId válido comprueba acceso de lectura y no usa accessibleSpaceIds', async () => {
    const spaceId = crypto.randomUUID();
    const res = await GET(request(`?spaceId=${spaceId}`));
    expect(res.status).toBe(200);
    expect(mocks.requireProjectAccess).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-1' }), spaceId, 'read');
    expect(mocks.accessibleSpaceIds).not.toHaveBeenCalled();
    expect(mocks.select).toHaveBeenCalledTimes(1);
  });

  it.each([[403, 'Sin acceso a este proyecto'], [404, 'Proyecto no encontrado']])(
    'propaga el %i de requireProjectAccess', async (status, message) => {
      mocks.requireProjectAccess.mockRejectedValue(Object.assign(new Error(message), { httpStatus: status }));
      const res = await GET(request(`?spaceId=${crypto.randomUUID()}`));
      expect(res.status).toBe(status);
      expect((await res.json()).error).toBe(message);
      expect(mocks.select).not.toHaveBeenCalled();
      expect(loggerError).not.toHaveBeenCalled();
    },
  );

  it('sin proyectos accesibles responde un CFD de 30 días a cero sin consultar tareas', async () => {
    mocks.requireSession.mockResolvedValue({ id: 'user-2', role: 'miembro' });
    mocks.accessibleSpaceIds.mockResolvedValue([]);
    const res = await GET(request());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.days).toBe(30);
    expect(body.cfd).toHaveLength(30);
    expect(body.cfd.every((e: { total: number }) => e.total === 0)).toBe(true);
    expect(body.cycleHistogram).toMatchObject({ count: 0, median: null, p85: null, withoutStart: 0 });
    expect(body.cycleHistogram.buckets).toHaveLength(7);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.loadStatusEvents).not.toHaveBeenCalled();
  });

  it('carga los eventos una sola vez y sólo de tareas no completadas o completadas en la ventana', async () => {
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(mocks.loadStatusEvents).toHaveBeenCalledTimes(1);
    const ids = mocks.loadStatusEvents.mock.calls[0][0] as string[];
    // Ventana de eventos: max(30, 60) = 60 días.
    expect([...ids].sort()).toEqual([...open.map(r => r.id), recentDone.id].sort());
    expect(ids).not.toContain(doneIn80.id);
    expect(ids).not.toContain(oldDone.id);
  });

  it('con days=90 la ventana de eventos se amplía a 90 días', async () => {
    await GET(request('?days=90'));
    const ids = mocks.loadStatusEvents.mock.calls[0][0] as string[];
    expect(ids).toContain(doneIn80.id);
    expect(ids).not.toContain(oldDone.id);
  });

  it('sin days responde 30 entradas con el CFD y el histograma', async () => {
    const res = await GET(request());
    const body = await res.json();
    expect(body.days).toBe(30);
    expect(body.cfd).toHaveLength(30);
    expect(body.cfd.at(-1).date).toBe('2026-11-17');
    expect(body.cfd.at(-1).counts).toEqual({ no_iniciada: 1, en_proceso: 1, en_revision: 0, completada: 3, bloqueada: 1 });
    expect(body.cfd.at(-1).total).toBe(6);
    expect(body.cycleHistogram.count).toBe(1);
    expect(body.cycleHistogram.median).toBe(4);
    expect(body.cycleHistogram.buckets.find((b: { label: string }) => b.label === '3–5').count).toBe(1);
  });

  it('acepta days=7 y days=90', async () => {
    expect((await (await GET(request('?days=7'))).json()).cfd).toHaveLength(7);
    expect((await (await GET(request('?days=90'))).json()).cfd).toHaveLength(90);
  });

  it('para no admin filtra por los proyectos accesibles', async () => {
    mocks.requireSession.mockResolvedValue({ id: 'user-2', role: 'miembro' });
    mocks.accessibleSpaceIds.mockResolvedValue([crypto.randomUUID()]);
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(mocks.accessibleSpaceIds).toHaveBeenCalledTimes(1);
    expect(mocks.select).toHaveBeenCalledTimes(1);
    expect(Object.keys(mocks.select.mock.calls[0][0]).sort()).toEqual(['completedAt', 'createdAt', 'id', 'status']);
  });
});

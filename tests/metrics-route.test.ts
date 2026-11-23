import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  accessibleSpaceIds: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  innerJoin: vi.fn(),
  where: vi.fn(),
  loadStatusEvents: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  requireSession: mocks.requireSession,
}));
vi.mock('@/lib/project-access', () => ({
  accessibleSpaceIds: mocks.accessibleSpaceIds,
}));
vi.mock('@/lib/db', () => ({
  db: { select: mocks.select },
}));
vi.mock('@/lib/status-history-query', () => ({
  loadStatusEvents: mocks.loadStatusEvents,
}));

import { GET } from '../src/app/api/metrics/route';
import { logger } from '../src/lib/logger';

const NOW = new Date('2026-10-28T15:00:00Z');
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

type Row = {
  id: string; number: number; title: string; status: string; kind: string; estimate: number | null;
  createdAt: Date; completedAt: Date | null; responsibleId: string; responsibleName: string; blockedByArea: string | null;
};

let n = 0;
const row = (over: Partial<Row>): Row => {
  n += 1;
  return {
    id: crypto.randomUUID(), number: n, title: `Tarea ${n}`, status: 'no_iniciada', kind: 'feature', estimate: 2,
    createdAt: day(90), completedAt: null, responsibleId: 'p1', responsibleName: 'Ana', blockedByArea: null, ...over,
  };
};

describe('GET /api/metrics', () => {
  let loggerError: ReturnType<typeof vi.spyOn>;
  let rows: Row[];
  let wip: Row[];
  let recentDone: Row;
  let oldDone: Row;
  let todo: Row;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    loggerError = vi.spyOn(logger, 'error').mockImplementation(() => {});

    wip = [
      ...Array.from({ length: 10 }, (_, i) => row({ status: 'en_proceso', createdAt: day(20 + i) })),
      row({ status: 'en_revision', createdAt: day(5) }),
      row({ status: 'bloqueada', createdAt: day(3) }),
    ];
    recentDone = row({ status: 'completada', createdAt: day(30), completedAt: day(2) });
    oldDone = row({ status: 'completada', createdAt: day(200), completedAt: day(100) });
    todo = row({ status: 'no_iniciada', createdAt: day(10) });
    rows = [...wip, recentDone, oldDone, todo];

    mocks.requireSession.mockResolvedValue({ id: 'user-1', role: 'admin' });
    mocks.accessibleSpaceIds.mockResolvedValue(null);
    mocks.select.mockReturnValue({ from: mocks.from });
    mocks.from.mockReturnValue({ innerJoin: mocks.innerJoin });
    mocks.innerJoin.mockReturnValue({ where: mocks.where });
    mocks.where.mockImplementation(async () => rows);
    // La completada reciente empezó 4 días antes de cerrarse.
    mocks.loadStatusEvents.mockImplementation(async () => new Map([
      [recentDone.id, [
        { taskId: recentDone.id, previousValue: 'no_iniciada', newValue: 'en_proceso', at: day(6) },
        { taskId: recentDone.id, previousValue: 'en_proceso', newValue: 'completada', at: day(2) },
      ]],
    ]));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('pide id, número y título de las tareas', async () => {
    await GET();
    expect(mocks.select).toHaveBeenCalledTimes(1);
    expect(Object.keys(mocks.select.mock.calls[0][0])).toEqual(expect.arrayContaining(['id', 'number', 'title']));
  });

  it('carga los eventos una sola vez y sólo de tareas en curso o completadas en 60 días', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(mocks.loadStatusEvents).toHaveBeenCalledTimes(1);
    const ids = mocks.loadStatusEvents.mock.calls[0][0] as string[];
    expect([...ids].sort()).toEqual([...wip.map(r => r.id), recentDone.id].sort());
    expect(ids).not.toContain(oldDone.id);
    expect(ids).not.toContain(todo.id);
  });

  it('devuelve ciclo real, lead time y antigüedad del trabajo en curso', async () => {
    const res = await GET();
    const body = await res.json();

    expect(body.cycleTime).toEqual({ count: 1, median: 4, p85: 4, withoutStart: 0 });
    expect(body.leadTime).toEqual({ count: 1, median: 28, p85: 28 });
    expect(body.wipAgingTotal).toBe(12);
    expect(body.wipAging).toHaveLength(10);
    expect(body.wipAging[0]).toMatchObject({ id: wip[9].id, number: wip[9].number, title: wip[9].title, days: 29, withoutStart: true, aged: true });
    // Los campos existentes se mantienen.
    expect(body.velocity).toHaveLength(8);
    expect(body.openTasks).toBe(13);
    // El trabajo en curso por persona pasó a /api/metrics/people (DECISIONES §22).
    expect(body.wip).toBeUndefined();
    expect(body.blockers).toBeDefined();
    expect(body.doneByKind).toEqual([{ kind: 'feature', count: 1 }]);
  });

  it('sin tareas relevantes no consulta la auditoría con ids', async () => {
    rows = [todo];
    const res = await GET();
    const body = await res.json();
    expect(mocks.loadStatusEvents).toHaveBeenCalledTimes(1);
    expect(mocks.loadStatusEvents).toHaveBeenCalledWith([]);
    expect(body.wipAging).toEqual([]);
    expect(body.wipAgingTotal).toBe(0);
    expect(body.cycleTime).toEqual({ count: 0, median: null, p85: null, withoutStart: 0 });
  });

  it('responde 401 sin sesión y no registra errores', async () => {
    mocks.requireSession.mockRejectedValue(new Error('UNAUTHORIZED'));
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.loadStatusEvents).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });
});

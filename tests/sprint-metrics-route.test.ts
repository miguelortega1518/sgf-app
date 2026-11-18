import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  requireProjectAccess: vi.fn(),
  logAudit: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
  loadStatusEvents: vi.fn(),
  loadSprintEvents: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ requireSession: mocks.requireSession }));
vi.mock('@/lib/db', () => ({
  db: { select: mocks.select, insert: mocks.insert, update: mocks.update, transaction: mocks.transaction },
}));
vi.mock('@/lib/audit', () => ({ logAudit: mocks.logAudit }));
vi.mock('@/lib/project-access', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/project-access')>()),
  requireProjectAccess: mocks.requireProjectAccess,
}));
vi.mock('@/lib/status-history-query', () => ({ loadStatusEvents: mocks.loadStatusEvents }));
vi.mock('@/lib/sprint-history-query', () => ({ loadSprintEvents: mocks.loadSprintEvents }));
vi.mock('@/lib/db/schema', () => ({
  sprints: {
    id: 'sprints.id', spaceId: 'sprints.spaceId', name: 'sprints.name', status: 'sprints.status',
    startDate: 'sprints.startDate', endDate: 'sprints.endDate', updatedAt: 'sprints.updatedAt',
  },
  tasks: {
    id: 'tasks.id',
    spaceId: 'tasks.spaceId',
    status: 'tasks.status',
    estimate: 'tasks.estimate',
    sprintId: 'tasks.sprintId',
    createdAt: 'tasks.createdAt',
    completedAt: 'tasks.completedAt',
    archived: 'tasks.archived',
  },
}));
vi.mock('drizzle-orm', () => ({
  and: (...conditions: unknown[]) => ({ operator: 'and', conditions }),
  eq: (left: unknown, right: unknown) => ({ operator: 'eq', left, right }),
  asc: (column: unknown) => ({ operator: 'asc', column }),
}));

import { GET } from '../src/app/api/spaces/[id]/sprint-metrics/route';
import { logger } from '../src/lib/logger';
import { addDaysRD } from '../src/lib/date-utils';

const spaceId = crypto.randomUUID();
const userId = crypto.randomUUID();

function ctx(id = spaceId) {
  return { params: Promise.resolve({ id }) };
}

function getRequest(id = spaceId) {
  return new NextRequest(`http://localhost/api/spaces/${id}/sprint-metrics`, { method: 'GET' });
}

function httpError(message: string, httpStatus: number) {
  return Object.assign(new Error(message), { httpStatus });
}

let selectCalls: unknown[];
let whereCalls: unknown[];

function queueResults(results: unknown[][]) {
  const queue = [...results];
  selectCalls = [];
  whereCalls = [];
  mocks.select.mockImplementation((fields?: unknown) => {
    selectCalls.push(fields);
    const result = queue.shift() ?? [];
    const builder: Record<string, unknown> = {};
    for (const method of ['from', 'orderBy', 'limit']) builder[method] = () => builder;
    builder.where = (cond: unknown) => { whereCalls.push(cond); return builder; };
    builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject);
    return builder;
  });
}

let loggerError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  loggerError = vi.spyOn(logger, 'error').mockImplementation(() => {});
  mocks.requireSession.mockResolvedValue({ id: userId, role: 'miembro' });
  mocks.requireProjectAccess.mockResolvedValue({ id: spaceId, type: 'proyecto', status: 'activo' });
  mocks.loadStatusEvents.mockResolvedValue(new Map());
  mocks.loadSprintEvents.mockResolvedValue(new Map());
  queueResults([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/spaces/[id]/sprint-metrics', () => {
  it('devuelve los burndowns del activo y de los cerrados y la velocidad', async () => {
    const active = {
      id: crypto.randomUUID(), name: 'Sprint 3', status: 'activo',
      startDate: addDaysRD(-2), endDate: addDaysRD(5), updatedAt: new Date(),
    };
    const closed = {
      id: crypto.randomUUID(), name: 'Sprint 2', status: 'cerrado',
      startDate: addDaysRD(-12), endDate: addDaysRD(-3), updatedAt: new Date(`${addDaysRD(-3)}T22:00:00Z`),
    };
    const planned = {
      id: crypto.randomUUID(), name: 'Sprint 4', status: 'planificado',
      startDate: addDaysRD(6), endDate: addDaysRD(12), updatedAt: new Date(),
    };
    const created = new Date(`${addDaysRD(-20)}T16:00:00Z`);
    const inActive = { id: crypto.randomUUID(), status: 'no_iniciada', estimate: 3, sprintId: active.id, createdAt: created, completedAt: null };
    const inClosed = { id: crypto.randomUUID(), status: 'no_iniciada', estimate: null, sprintId: closed.id, createdAt: created, completedAt: null };
    const inPlanned = { id: crypto.randomUUID(), status: 'no_iniciada', estimate: 2, sprintId: planned.id, createdAt: created, completedAt: null };
    const movedOut = { id: crypto.randomUUID(), status: 'no_iniciada', estimate: null, sprintId: null, createdAt: created, completedAt: null };
    const backlog = { id: crypto.randomUUID(), status: 'no_iniciada', estimate: null, sprintId: null, createdAt: created, completedAt: null };
    mocks.loadSprintEvents.mockResolvedValue(new Map([[movedOut.id, [{
      taskId: movedOut.id, previousValue: 'Sprint 2', newValue: 'Backlog',
      reason: JSON.stringify({ from: closed.id, to: null }), at: new Date(`${addDaysRD(-8)}T16:00:00Z`),
    }]]]));
    queueResults([
      [active, closed, planned],
      [inActive, inClosed, inPlanned, movedOut, backlog],
    ]);

    const res = await GET(getRequest(), ctx());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body.burndowns).sort()).toEqual([active.id, closed.id].sort());
    expect(body.burndowns[active.id]).toMatchObject({ kind: 'data', unit: 'puntos' });
    expect(body.burndowns[closed.id]).toMatchObject({ kind: 'data', unit: 'tareas' });
    expect(body.velocity).toEqual({
      enough: false,
      closedCount: 1,
      rows: [expect.objectContaining({ sprintId: closed.id, name: 'Sprint 2', points: 0, tasks: 0 })],
    });

    expect(mocks.requireProjectAccess).toHaveBeenCalledWith(expect.objectContaining({ id: userId }), spaceId, 'read');
    expect(mocks.loadSprintEvents).toHaveBeenCalledTimes(1);
    expect(mocks.loadSprintEvents).toHaveBeenCalledWith(spaceId);
    expect(mocks.loadStatusEvents).toHaveBeenCalledTimes(1);
    expect([...mocks.loadStatusEvents.mock.calls[0][0]].sort())
      .toEqual([inActive.id, inClosed.id, inPlanned.id, movedOut.id].sort());

    // Sólo tareas no archivadas del proyecto.
    expect(selectCalls[1]).toEqual({
      id: 'tasks.id',
      status: 'tasks.status',
      estimate: 'tasks.estimate',
      sprintId: 'tasks.sprintId',
      createdAt: 'tasks.createdAt',
      completedAt: 'tasks.completedAt',
    });
    expect(whereCalls).toEqual([
      { operator: 'eq', left: 'sprints.spaceId', right: spaceId },
      {
        operator: 'and',
        conditions: [
          { operator: 'eq', left: 'tasks.spaceId', right: spaceId },
          { operator: 'eq', left: 'tasks.archived', right: false },
        ],
      },
    ]);
    expect(mocks.select).toHaveBeenCalledTimes(2);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('sin sprints responde burndowns vacío y velocidad sin datos', async () => {
    queueResults([[], []]);

    const res = await GET(getRequest(), ctx());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ burndowns: {}, velocity: { enough: false, closedCount: 0, rows: [] } });
  });

  it('un id mal formado responde 400 sin tocar la BD ni registrar errores', async () => {
    const res = await GET(getRequest('no-es-uuid'), ctx('no-es-uuid'));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('ID de proyecto con formato inválido');
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.requireProjectAccess).not.toHaveBeenCalled();
    expect(mocks.loadStatusEvents).not.toHaveBeenCalled();
    expect(mocks.loadSprintEvents).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('sin sesión responde 401 sin registrar errores', async () => {
    mocks.requireSession.mockRejectedValue(new Error('UNAUTHORIZED'));

    const res = await GET(getRequest(), ctx());

    expect(res.status).toBe(401);
    expect(mocks.requireProjectAccess).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('sin acceso al proyecto responde 403 sin leer la BD', async () => {
    mocks.requireProjectAccess.mockRejectedValue(httpError('Sin acceso a este proyecto', 403));

    const res = await GET(getRequest(), ctx());

    expect(res.status).toBe(403);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('un proyecto inexistente responde 404', async () => {
    mocks.requireProjectAccess.mockRejectedValue(httpError('Proyecto no encontrado', 404));

    const res = await GET(getRequest(), ctx());

    expect(res.status).toBe(404);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('un fallo de la BD responde 500 y se registra', async () => {
    mocks.select.mockImplementation(() => { throw new Error('connection reset'); });

    const res = await GET(getRequest(), ctx());

    expect(res.status).toBe(500);
    expect(loggerError).toHaveBeenCalled();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  requireProjectAccess: vi.fn(),
  loadStatusEvents: vi.fn(),
  loadSprintChangeEvents: vi.fn(),
  select: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ requireSession: mocks.requireSession }));
vi.mock('@/lib/db', () => ({ db: { select: mocks.select } }));
vi.mock('@/lib/project-access', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/project-access')>()),
  requireProjectAccess: mocks.requireProjectAccess,
}));
vi.mock('@/lib/db/schema', () => ({
  sprints: { id: 'sprints.id' },
  tasks: {
    id: 'tasks.id', spaceId: 'tasks.spaceId', archived: 'tasks.archived', status: 'tasks.status',
    estimate: 'tasks.estimate', createdAt: 'tasks.createdAt', completedAt: 'tasks.completedAt', sprintId: 'tasks.sprintId',
  },
  holidays: { date: 'holidays.date' },
}));
vi.mock('drizzle-orm', () => ({
  and: (...conditions: unknown[]) => ({ operator: 'and', conditions }),
  eq: (left: unknown, right: unknown) => ({ operator: 'eq', left, right }),
  gte: (left: unknown, right: unknown) => ({ operator: 'gte', left, right }),
  lte: (left: unknown, right: unknown) => ({ operator: 'lte', left, right }),
}));
vi.mock('@/lib/status-history-query', () => ({ loadStatusEvents: mocks.loadStatusEvents }));
vi.mock('@/lib/sprint-history-query', () => ({ loadSprintChangeEvents: mocks.loadSprintChangeEvents }));

import { GET } from '../src/app/api/sprints/[id]/burndown/route';
import { logger } from '../src/lib/logger';
import { sprintChangeReason } from '../src/lib/sprint-history';

const sprintId = crypto.randomUUID();
const otherSprintId = crypto.randomUUID();
const spaceId = crypto.randomUUID();
const userId = crypto.randomUUID();

function ctx(id = sprintId) {
  return { params: Promise.resolve({ id }) };
}

function request(id = sprintId) {
  return new NextRequest(`http://localhost/api/sprints/${id}/burndown`, { method: 'GET' });
}

function httpError(message: string, httpStatus: number) {
  return Object.assign(new Error(message), { httpStatus });
}

let fromCalls: unknown[];
let whereCalls: unknown[];

function queueResults(results: unknown[][]) {
  const queue = [...results];
  mocks.select.mockImplementation(() => {
    const result = queue.shift() ?? [];
    const builder: Record<string, unknown> = {};
    builder.from = (table: unknown) => { fromCalls.push(table); return builder; };
    builder.where = (cond: unknown) => { whereCalls.push(cond); return builder; };
    builder.limit = () => builder;
    builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject);
    return builder;
  });
}

function sprintRow(overrides: Record<string, unknown> = {}) {
  return {
    id: sprintId, spaceId, name: 'Sprint 7', goal: null, status: 'activo',
    startDate: '2026-11-02', endDate: '2026-11-06',
    startedAt: new Date('2026-11-02T13:00:00Z'), summary: null,
    createdAt: new Date('2026-10-20T12:00:00Z'), updatedAt: new Date('2026-11-02T13:00:00Z'),
    ...overrides,
  };
}

const created = new Date('2026-10-20T12:00:00Z');

let loggerError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  fromCalls = [];
  whereCalls = [];
  loggerError = vi.spyOn(logger, 'error').mockImplementation(() => {});
  mocks.requireSession.mockResolvedValue({ id: userId, role: 'miembro' });
  mocks.requireProjectAccess.mockResolvedValue({ id: spaceId, type: 'proyecto', status: 'activo', businessDaysOnly: false });
  mocks.loadStatusEvents.mockResolvedValue(new Map());
  mocks.loadSprintChangeEvents.mockResolvedValue(new Map());
  queueResults([[sprintRow()], []]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/sprints/[id]/burndown', () => {
  it('sin sesión → 401 sin registrar errores', async () => {
    mocks.requireSession.mockRejectedValue(new Error('UNAUTHORIZED'));

    const res = await GET(request(), ctx());

    expect(res.status).toBe(401);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('id mal formado → 400 sin tocar la BD ni registrar errores', async () => {
    const res = await GET(request('no-es-uuid'), ctx('no-es-uuid'));

    expect(res.status).toBe(400);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.requireProjectAccess).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('sprint inexistente → 404', async () => {
    queueResults([[]]);

    const res = await GET(request(), ctx());

    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Sprint no encontrado');
    expect(mocks.requireProjectAccess).not.toHaveBeenCalled();
  });

  it.each([
    [403, 'Sin acceso a este proyecto'],
    [404, 'Proyecto no encontrado'],
  ])('sin acceso al proyecto → %i', async (status, message) => {
    mocks.requireProjectAccess.mockRejectedValue(httpError(message, status));

    const res = await GET(request(), ctx());

    expect(res.status).toBe(status);
    expect(mocks.requireProjectAccess).toHaveBeenCalledWith(expect.objectContaining({ id: userId }), spaceId, 'read');
    expect(mocks.select).toHaveBeenCalledTimes(1);
    expect(mocks.loadSprintChangeEvents).not.toHaveBeenCalled();
  });

  it('sprint planificado → 409', async () => {
    queueResults([[sprintRow({ status: 'planificado', startedAt: null })]]);

    const res = await GET(request(), ctx());

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('El sprint aún no ha empezado');
    expect(mocks.loadSprintChangeEvents).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('200 con la forma de SprintBurndown y carga en bloque', async () => {
    const inSprint = crypto.randomUUID();
    const leftSprint = crypto.randomUUID();
    const unrelated = crypto.randomUUID();
    queueResults([
      [sprintRow()],
      [
        { id: inSprint, status: 'no_iniciada', estimate: 3, createdAt: created, completedAt: null, sprintId },
        { id: leftSprint, status: 'no_iniciada', estimate: 2, createdAt: created, completedAt: null, sprintId: otherSprintId },
        { id: unrelated, status: 'no_iniciada', estimate: 8, createdAt: created, completedAt: null, sprintId: null },
      ],
    ]);
    mocks.loadSprintChangeEvents.mockResolvedValue(new Map([[leftSprint, [{
      taskId: leftSprint, previousValue: 'Sprint 7', newValue: 'Sprint 8',
      reason: sprintChangeReason(sprintId, otherSprintId), at: new Date('2026-11-04T16:00:00Z'),
    }]]]));

    const res = await GET(request(), ctx());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ unit: 'points', businessDaysOnly: false, startDate: '2026-11-02', endDate: '2026-11-06' });
    expect(body.entries).toHaveLength(6);
    expect(body.entries[0]).toEqual({ date: '2026-11-02', kind: 'start', remaining: 5, scope: 5, ideal: 5 });

    expect(mocks.loadSprintChangeEvents).toHaveBeenCalledTimes(1);
    expect(mocks.loadSprintChangeEvents).toHaveBeenCalledWith([inSprint, leftSprint, unrelated], spaceId);
    expect(mocks.loadStatusEvents).toHaveBeenCalledTimes(1);
    expect(mocks.loadStatusEvents).toHaveBeenCalledWith([inSprint, leftSprint]);
    // Tareas no archivadas del proyecto.
    expect(whereCalls[1]).toEqual({
      operator: 'and',
      conditions: [
        { operator: 'eq', left: 'tasks.spaceId', right: spaceId },
        { operator: 'eq', left: 'tasks.archived', right: false },
      ],
    });
    // Sin días hábiles no se consultan los feriados.
    expect(mocks.select).toHaveBeenCalledTimes(2);
    expect(fromCalls).not.toContainEqual({ date: 'holidays.date' });
  });

  it('con días hábiles consulta los feriados del rango del sprint', async () => {
    mocks.requireProjectAccess.mockResolvedValue({ id: spaceId, type: 'proyecto', status: 'activo', businessDaysOnly: true });
    queueResults([[sprintRow()], [], [{ date: '2026-11-04' }]]);

    const res = await GET(request(), ctx());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.businessDaysOnly).toBe(true);
    expect(body.entries.map((e: { date: string }) => e.date)).toEqual(['2026-11-02', '2026-11-02', '2026-11-03', '2026-11-05', '2026-11-06']);
    expect(mocks.select).toHaveBeenCalledTimes(3);
    expect(fromCalls[2]).toEqual({ date: 'holidays.date' });
    expect(whereCalls[2]).toEqual({
      operator: 'and',
      conditions: [
        { operator: 'gte', left: 'holidays.date', right: '2026-11-02' },
        { operator: 'lte', left: 'holidays.date', right: '2026-11-06' },
      ],
    });
  });

  it('sprint cerrado: businessDaysOnly sale del summary y se congela en updated_at', async () => {
    mocks.requireProjectAccess.mockResolvedValue({ id: spaceId, type: 'proyecto', status: 'activo', businessDaysOnly: true });
    const carried = crypto.randomUUID();
    const closedAt = new Date('2026-11-06T22:00:00Z');
    queueResults([
      [sprintRow({ status: 'cerrado', updatedAt: closedAt, summary: { version: 1, businessDaysOnly: false } })],
      [{ id: carried, status: 'no_iniciada', estimate: null, createdAt: created, completedAt: null, sprintId: otherSprintId }],
    ]);
    mocks.loadSprintChangeEvents.mockResolvedValue(new Map([[carried, [{
      taskId: carried, previousValue: 'Sprint 7', newValue: 'Sprint 8',
      reason: sprintChangeReason(sprintId, otherSprintId), at: new Date(closedAt.getTime() - 500),
    }]]]));

    const res = await GET(request(), ctx());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.businessDaysOnly).toBe(false);
    expect(body.unit).toBe('tasks');
    expect(body.entries.at(-1)).toMatchObject({ remaining: 1, scope: 1 });
    expect(mocks.select).toHaveBeenCalledTimes(2);
  });

  it('un error inesperado de la BD responde 500', async () => {
    mocks.select.mockImplementation(() => { throw new Error('boom'); });

    const res = await GET(request(), ctx());

    expect(res.status).toBe(500);
  });
});

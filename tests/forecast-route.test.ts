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
vi.mock('@/lib/db/schema', () => ({
  sprints: { id: 'sprints.id', spaceId: 'sprints.spaceId', startDate: 'sprints.startDate', status: 'sprints.status' },
  milestones: { id: 'milestones.id', spaceId: 'milestones.spaceId' },
  tasks: {
    id: 'tasks.id',
    spaceId: 'tasks.spaceId',
    status: 'tasks.status',
    completedAt: 'tasks.completedAt',
    createdAt: 'tasks.createdAt',
    sprintId: 'tasks.sprintId',
    milestoneId: 'tasks.milestoneId',
    archived: 'tasks.archived',
  },
}));
vi.mock('drizzle-orm', () => ({
  and: (...conditions: unknown[]) => ({ operator: 'and', conditions }),
  eq: (left: unknown, right: unknown) => ({ operator: 'eq', left, right }),
  asc: (column: unknown) => ({ operator: 'asc', column }),
}));

import { GET } from '../src/app/api/spaces/[id]/forecast/route';
import { logger } from '../src/lib/logger';
import { addDaysRD } from '../src/lib/date-utils';

const spaceId = crypto.randomUUID();
const userId = crypto.randomUUID();

function ctx() {
  return { params: Promise.resolve({ id: spaceId }) };
}

function getRequest() {
  return new NextRequest(`http://localhost/api/spaces/${spaceId}/forecast`, { method: 'GET' });
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

/** n tareas cerradas, una por día, terminando ayer (hora RD a mediodía). */
function history(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: crypto.randomUUID(),
    status: 'completada',
    completedAt: new Date(`${addDaysRD(-n + i)}T16:00:00Z`),
    createdAt: new Date(`${addDaysRD(-n - 5)}T16:00:00Z`),
    sprintId: null,
    milestoneId: null,
  }));
}

let loggerError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  loggerError = vi.spyOn(logger, 'error').mockImplementation(() => {});
  mocks.requireSession.mockResolvedValue({ id: userId, role: 'miembro' });
  mocks.requireProjectAccess.mockResolvedValue({ id: spaceId, type: 'proyecto', status: 'activo' });
  queueResults([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/spaces/[id]/forecast', () => {
  it('devuelve el pronóstico del sprint activo, de los hitos abiertos y el acierto hacia atrás', async () => {
    const sprintId = crypto.randomUUID();
    const openMilestone = crypto.randomUUID();
    const doneMilestone = crypto.randomUUID();
    const open = (extra: Record<string, unknown>) => ({
      id: crypto.randomUUID(), status: 'en_proceso', completedAt: null,
      createdAt: new Date(), sprintId: null, milestoneId: null, ...extra,
    });
    queueResults([
      [...history(40), open({ sprintId }), open({ sprintId }), open({ milestoneId: openMilestone })],
      [{ id: sprintId, spaceId, status: 'activo', startDate: addDaysRD(-3), endDate: addDaysRD(10) }],
      [
        { id: openMilestone, spaceId, completed: false, targetDate: addDaysRD(20), createdAt: new Date() },
        { id: doneMilestone, spaceId, completed: true, targetDate: addDaysRD(-1), createdAt: new Date() },
      ],
    ]);

    const res = await GET(getRequest(), ctx());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.activeSprint).toEqual({
      id: sprintId,
      forecast: expect.objectContaining({ kind: 'forecast', remaining: 2, targetDate: addDaysRD(10) }),
    });
    expect(body.milestones).toEqual([
      { id: openMilestone, forecast: expect.objectContaining({ kind: 'forecast', remaining: 1, targetDate: addDaysRD(20) }) },
    ]);
    expect(body.backtest).toEqual({ hits: expect.any(Number), total: expect.any(Number), enough: expect.any(Boolean) });

    expect(mocks.requireProjectAccess).toHaveBeenCalledWith(expect.objectContaining({ id: userId }), spaceId, 'read');
    expect(selectCalls[0]).toEqual({
      id: 'tasks.id',
      status: 'tasks.status',
      completedAt: 'tasks.completedAt',
      createdAt: 'tasks.createdAt',
      sprintId: 'tasks.sprintId',
      milestoneId: 'tasks.milestoneId',
    });
    expect(whereCalls).toEqual([
      {
        operator: 'and',
        conditions: [
          { operator: 'eq', left: 'tasks.spaceId', right: spaceId },
          { operator: 'eq', left: 'tasks.archived', right: false },
        ],
      },
      { operator: 'eq', left: 'sprints.spaceId', right: spaceId },
      { operator: 'eq', left: 'milestones.spaceId', right: spaceId },
    ]);
    expect(mocks.select).toHaveBeenCalledTimes(3);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('sin sprint activo ni hitos: activeSprint null y lista vacía', async () => {
    queueResults([[], [], []]);

    const res = await GET(getRequest(), ctx());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      activeSprint: null,
      milestones: [],
      backtest: { hits: 0, total: 0, enough: false },
    });
  });

  it('con poco historial el pronóstico es insufficient', async () => {
    const sprintId = crypto.randomUUID();
    queueResults([
      [...history(5), { id: crypto.randomUUID(), status: 'no_iniciada', completedAt: null, createdAt: new Date(), sprintId, milestoneId: null }],
      [{ id: sprintId, spaceId, status: 'activo', startDate: addDaysRD(-3), endDate: addDaysRD(10) }],
      [],
    ]);

    const res = await GET(getRequest(), ctx());

    expect(res.status).toBe(200);
    expect((await res.json()).activeSprint.forecast).toEqual({ kind: 'insufficient', closedTasks: 5, historyWeeks: 0 });
  });

  it('un observador puede leer', async () => {
    mocks.requireSession.mockResolvedValue({ id: userId, role: 'observador' });
    queueResults([[], [], []]);

    const res = await GET(getRequest(), ctx());

    expect(res.status).toBe(200);
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
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('sin sesión responde 401 sin registrar errores', async () => {
    mocks.requireSession.mockRejectedValue(new Error('UNAUTHORIZED'));

    const res = await GET(getRequest(), ctx());

    expect(res.status).toBe(401);
    expect(mocks.requireProjectAccess).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('un fallo de la BD responde 500 y se registra', async () => {
    mocks.select.mockImplementation(() => { throw new Error('connection reset'); });

    const res = await GET(getRequest(), ctx());

    expect(res.status).toBe(500);
    expect(loggerError).toHaveBeenCalled();
  });
});

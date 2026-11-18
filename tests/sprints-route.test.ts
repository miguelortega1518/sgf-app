import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  const txInsert = vi.fn();
  const txValues = vi.fn();
  const txReturning = vi.fn();
  return {
    requireSession: vi.fn(),
    requireProjectAccess: vi.fn(),
    logAudit: vi.fn(),
    select: vi.fn(),
    insert: vi.fn(),
    transaction: vi.fn(),
    txInsert,
    txValues,
    txReturning,
    tx: { insert: txInsert },
  };
});

vi.mock('@/lib/auth', () => ({ requireSession: mocks.requireSession }));
vi.mock('@/lib/db', () => ({
  db: { select: mocks.select, insert: mocks.insert, transaction: mocks.transaction },
}));
vi.mock('@/lib/audit', () => ({ logAudit: mocks.logAudit }));
vi.mock('@/lib/project-access', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/project-access')>()),
  requireProjectAccess: mocks.requireProjectAccess,
}));
vi.mock('@/lib/db/schema', () => ({
  sprints: { id: 'sprints.id', spaceId: 'sprints.spaceId', startDate: 'sprints.startDate', status: 'sprints.status' },
  tasks: {
    spaceId: 'tasks.spaceId', sprintId: 'tasks.sprintId', estimate: 'tasks.estimate', archived: 'tasks.archived',
    responsibleId: 'tasks.responsibleId', status: 'tasks.status',
  },
  spaceMembers: { spaceId: 'spaceMembers.spaceId', personId: 'spaceMembers.personId', spaceRole: 'spaceMembers.spaceRole' },
  persons: { id: 'persons.id', name: 'persons.name' },
  sprintCapacity: { sprintId: 'sprintCapacity.sprintId', personId: 'sprintCapacity.personId', points: 'sprintCapacity.points' },
}));
vi.mock('drizzle-orm', () => ({
  and: (...conditions: unknown[]) => ({ operator: 'and', conditions }),
  eq: (left: unknown, right: unknown) => ({ operator: 'eq', left, right }),
  asc: (column: unknown) => ({ operator: 'asc', column }),
  count: () => ({ operator: 'count' }),
  isNotNull: (column: unknown) => ({ operator: 'isNotNull', column }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ operator: 'sql', strings: [...strings], values }),
}));

import { GET, POST } from '../src/app/api/spaces/[id]/sprints/route';
import { logger } from '../src/lib/logger';

const spaceId = crypto.randomUUID();
const userId = crypto.randomUUID();

function ctx() {
  return { params: Promise.resolve({ id: spaceId }) };
}

function getRequest() {
  return new NextRequest(`http://localhost/api/spaces/${spaceId}/sprints`, { method: 'GET' });
}

function postRequest(body: unknown) {
  return new NextRequest(`http://localhost/api/spaces/${spaceId}/sprints`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function httpError(message: string, httpStatus: number) {
  return Object.assign(new Error(message), { httpStatus });
}

let whereCalls: unknown[];
let orderByCalls: unknown[];

function queueResults(results: unknown[][]) {
  const queue = [...results];
  whereCalls = [];
  orderByCalls = [];
  mocks.select.mockImplementation(() => {
    const result = queue.shift() ?? [];
    const builder: Record<string, unknown> = {};
    for (const method of ['from', 'groupBy', 'limit', 'innerJoin']) builder[method] = () => builder;
    builder.where = (cond: unknown) => { whereCalls.push(cond); return builder; };
    builder.orderBy = (order: unknown) => { orderByCalls.push(order); return builder; };
    builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject);
    return builder;
  });
}

function sprintRow(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    spaceId,
    name: 'Sprint 1',
    goal: null,
    startDate: '2026-11-17',
    endDate: '2026-11-30',
    status: 'planificado',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

const validBody = { name: 'Sprint 1', startDate: '2026-11-17', endDate: '2026-11-30' };

let loggerError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  loggerError = vi.spyOn(logger, 'error').mockImplementation(() => {});
  mocks.requireSession.mockResolvedValue({ id: userId, role: 'miembro' });
  mocks.requireProjectAccess.mockResolvedValue({ id: spaceId, type: 'proyecto', status: 'activo' });
  mocks.logAudit.mockResolvedValue(undefined);
  mocks.transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(mocks.tx));
  mocks.txInsert.mockReturnValue({ values: mocks.txValues });
  mocks.txValues.mockReturnValue({ returning: mocks.txReturning });
  mocks.txReturning.mockImplementation(async () => [sprintRow({ ...mocks.txValues.mock.calls[0][0] })]);
  queueResults([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/spaces/[id]/sprints', () => {
  it('devuelve los sprints por fecha de inicio con taskCount y estimateTotal', async () => {
    const s1 = sprintRow({ name: 'Sprint 1', status: 'activo' });
    const s2 = sprintRow({ name: 'Sprint 2', startDate: '2026-12-01', endDate: '2026-12-14' });
    queueResults([
      [s1, s2],
      [
        { sprintId: s1.id, taskCount: 3, estimateTotal: '8' },
        { sprintId: null, taskCount: 4, estimateTotal: '5' },
      ],
    ]);

    const res = await GET(getRequest(), ctx());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([
      expect.objectContaining({ id: s1.id, taskCount: 3, estimateTotal: 8 }),
      expect.objectContaining({ id: s2.id, taskCount: 0, estimateTotal: 0 }),
    ]);
    expect(mocks.requireProjectAccess).toHaveBeenCalledWith(expect.objectContaining({ id: userId }), spaceId, 'read');
    expect(orderByCalls[0]).toEqual({ operator: 'asc', column: 'sprints.startDate' });
    expect(whereCalls[0]).toEqual({ operator: 'eq', left: 'sprints.spaceId', right: spaceId });
    expect(whereCalls[1]).toEqual({
      operator: 'and',
      conditions: [
        { operator: 'eq', left: 'tasks.spaceId', right: spaceId },
        { operator: 'eq', left: 'tasks.archived', right: false },
      ],
    });
  });

  it('capacity en planificados y activos (en bloque); summary en los cerrados', async () => {
    const ana = crypto.randomUUID();
    const beto = crypto.randomUUID();
    const olga = crypto.randomUUID();
    const withSummary = sprintRow({
      name: 'Sprint 1', status: 'cerrado', startDate: '2026-10-01', endDate: '2026-10-15',
      summary: {
        version: 1,
        byPerson: [{ personId: ana, name: 'Ana', committedTasks: 2, committedPoints: 9, completedTasks: 1, completedPoints: 8 }],
      },
    });
    const legacy = sprintRow({ name: 'Sprint 2', status: 'cerrado', startDate: '2026-10-16', endDate: '2026-10-29', summary: null });
    const active = sprintRow({ name: 'Sprint 3', status: 'activo', startDate: '2026-10-30', endDate: '2026-11-12', summary: null });
    const planned = sprintRow({ name: 'Sprint 4', status: 'planificado', startDate: '2026-11-13', endDate: '2026-11-26', summary: null });

    queueResults([
      [withSummary, legacy, active, planned],
      [],
      // Miembros del proyecto.
      [
        { personId: beto, name: 'Beto', spaceRole: 'dueño' },
        { personId: ana, name: 'Ana', spaceRole: 'colaborador' },
        { personId: olga, name: 'Olga', spaceRole: 'observador' },
      ],
      // Capacidades guardadas de los sprints del proyecto.
      [{ sprintId: planned.id, personId: beto, points: 4 }],
      // Tareas no archivadas con sprint.
      [
        { sprintId: legacy.id, responsibleId: ana, responsibleName: 'Ana', status: 'completada', estimate: 12 },
        { sprintId: legacy.id, responsibleId: beto, responsibleName: 'Beto', status: 'completada', estimate: 5 },
        { sprintId: legacy.id, responsibleId: beto, responsibleName: 'Beto', status: 'en_proceso', estimate: 3 },
        { sprintId: active.id, responsibleId: ana, responsibleName: 'Ana', status: 'en_proceso', estimate: 13 },
        { sprintId: active.id, responsibleId: beto, responsibleName: 'Beto', status: 'no_iniciada', estimate: 2 },
      ],
    ]);

    const res = await GET(getRequest(), ctx());

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>[];
    expect(mocks.select).toHaveBeenCalledTimes(5);
    const byId = new Map(body.map(s => [s.id, s]));

    // Ana: media de 12 (Sprint 2, heredado) y 8 (Sprint 1, summary) = 10. Beto: sólo Sprint 2 = 5.
    expect(byId.get(active.id)!.capacity).toEqual([
      { personId: ana, name: 'Ana', points: 10, isDefault: true, assigned: 13, overloaded: true },
      { personId: beto, name: 'Beto', points: 5, isDefault: true, assigned: 2, overloaded: false },
    ]);
    expect(byId.get(planned.id)!.capacity).toEqual([
      { personId: ana, name: 'Ana', points: 10, isDefault: true, assigned: 0, overloaded: false },
      { personId: beto, name: 'Beto', points: 4, isDefault: false, assigned: 0, overloaded: false },
    ]);
    expect(byId.get(withSummary.id)).not.toHaveProperty('capacity');
    expect(byId.get(withSummary.id)!.summary).toEqual(withSummary.summary);
    expect(byId.get(legacy.id)).not.toHaveProperty('capacity');
    expect(byId.get(legacy.id)!.summary).toBeNull();
  });

  it('sin sprints abiertos no consulta miembros, capacidades ni tareas', async () => {
    const closed = sprintRow({ status: 'cerrado', summary: null });
    queueResults([[closed], []]);

    const res = await GET(getRequest(), ctx());

    expect(res.status).toBe(200);
    expect(mocks.select).toHaveBeenCalledTimes(2);
  });

  it('un observador puede leer', async () => {
    mocks.requireSession.mockResolvedValue({ id: userId, role: 'observador' });
    queueResults([[], []]);

    const res = await GET(getRequest(), ctx());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('sin acceso al proyecto responde 403', async () => {
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
  });

  it('sin sesión responde 401 sin registrar errores', async () => {
    mocks.requireSession.mockRejectedValue(new Error('UNAUTHORIZED'));

    const res = await GET(getRequest(), ctx());

    expect(res.status).toBe(401);
    expect(loggerError).not.toHaveBeenCalled();
  });
});

describe('POST /api/spaces/[id]/sprints', () => {
  it('crea el sprint planificado y registra sprint_created en la misma transacción', async () => {
    const res = await POST(postRequest({ ...validBody, goal: 'Cerrar filtros', status: 'activo' }), ctx());

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe('planificado');
    expect(mocks.requireProjectAccess).toHaveBeenCalledWith(expect.objectContaining({ id: userId }), spaceId, 'write');
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.txValues).toHaveBeenCalledWith({
      spaceId,
      name: 'Sprint 1',
      goal: 'Cerrar filtros',
      startDate: '2026-11-17',
      endDate: '2026-11-30',
      status: 'planificado',
    });
    expect(mocks.logAudit).toHaveBeenCalledTimes(1);
    expect(mocks.logAudit).toHaveBeenCalledWith(
      {
        actorId: userId,
        action: 'sprint_created',
        spaceId,
        newValue: 'Sprint 1: 2026-11-17 → 2026-11-30',
      },
      mocks.tx,
    );
  });

  it('recorta el nombre y acepta objetivo nulo', async () => {
    const res = await POST(postRequest({ ...validBody, name: '  Sprint 1  ', goal: null }), ctx());

    expect(res.status).toBe(201);
    expect(mocks.txValues).toHaveBeenCalledWith(expect.objectContaining({ name: 'Sprint 1', goal: null }));
  });

  it('observador global → 403 sin leer la BD ni auditar', async () => {
    mocks.requireSession.mockResolvedValue({ id: userId, role: 'observador' });

    const res = await POST(postRequest(validBody), ctx());

    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('Sin permisos');
    expect(mocks.requireProjectAccess).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('observador del espacio → 403', async () => {
    mocks.requireProjectAccess.mockRejectedValue(httpError('Sin permisos de escritura en este proyecto', 403));

    const res = await POST(postRequest(validBody), ctx());

    expect(res.status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('proyecto cerrado → 409', async () => {
    mocks.requireProjectAccess.mockRejectedValue(httpError('El proyecto está cerrado', 409));

    const res = await POST(postRequest(validBody), ctx());

    expect(res.status).toBe(409);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('espacio recurrente → 400', async () => {
    mocks.requireProjectAccess.mockResolvedValue({ id: spaceId, type: 'recurrente', status: 'activo' });

    const res = await POST(postRequest(validBody), ctx());

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Los sprints sólo están disponibles en proyectos de tipo iniciativa o backlog');
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('endDate anterior a startDate → 400 con el mensaje de fechas, sin transacción', async () => {
    const res = await POST(postRequest({ ...validBody, endDate: '2026-11-16' }), ctx());

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('La fecha de fin no puede ser anterior a la de inicio');
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it.each([
    ['nombre vacío', { ...validBody, name: '   ' }],
    ['nombre demasiado largo', { ...validBody, name: 'x'.repeat(201) }],
    ['objetivo demasiado largo', { ...validBody, goal: 'x'.repeat(2001) }],
    ['fecha inválida', { ...validBody, startDate: '2026-02-30' }],
    ['sin fecha de fin', { name: 'Sprint 1', startDate: '2026-11-17' }],
  ])('%s → 400 sin transacción ni auditoría', async (_label, body) => {
    const res = await POST(postRequest(body), ctx());

    expect(res.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('JSON inválido → 400', async () => {
    const req = new NextRequest(`http://localhost/api/spaces/${spaceId}/sprints`, {
      method: 'POST',
      body: '{no',
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req, ctx());

    expect(res.status).toBe(400);
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('sin sesión → 401 sin registrar errores', async () => {
    mocks.requireSession.mockRejectedValue(new Error('UNAUTHORIZED'));

    const res = await POST(postRequest(validBody), ctx());

    expect(res.status).toBe(401);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });
});

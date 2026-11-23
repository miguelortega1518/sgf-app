import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  const txSelect = vi.fn();
  const txUpdate = vi.fn();
  const txSet = vi.fn();
  return {
    requireSession: vi.fn(),
    requireProjectAccess: vi.fn(),
    logAudit: vi.fn(),
    loadStatusEvents: vi.fn(),
    loadSprintChangeEvents: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
    txSelect,
    txUpdate,
    txSet,
    tx: { select: txSelect, update: txUpdate },
  };
});

vi.mock('@/lib/auth', () => ({ requireSession: mocks.requireSession }));
vi.mock('@/lib/db', () => ({
  db: { select: mocks.select, update: mocks.update, transaction: mocks.transaction },
}));
vi.mock('@/lib/audit', () => ({ logAudit: mocks.logAudit }));
vi.mock('@/lib/project-access', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/project-access')>()),
  requireProjectAccess: mocks.requireProjectAccess,
}));
vi.mock('@/lib/db/schema', () => ({
  sprints: { id: 'sprints.id', spaceId: 'sprints.spaceId', status: 'sprints.status' },
  tasks: {
    id: 'tasks.id', sprintId: 'tasks.sprintId', archived: 'tasks.archived', status: 'tasks.status',
    estimate: 'tasks.estimate', responsibleId: 'tasks.responsibleId', blockedByArea: 'tasks.blockedByArea',
    createdAt: 'tasks.createdAt', completedAt: 'tasks.completedAt',
  },
  persons: { id: 'persons.id', name: 'persons.name' },
  holidays: { date: 'holidays.date' },
}));
vi.mock('drizzle-orm', () => ({
  and: (...conditions: unknown[]) => ({ operator: 'and', conditions }),
  eq: (left: unknown, right: unknown) => ({ operator: 'eq', left, right }),
  ne: (left: unknown, right: unknown) => ({ operator: 'ne', left, right }),
  inArray: (left: unknown, right: unknown) => ({ operator: 'inArray', left, right }),
}));
vi.mock('@/lib/status-history-query', () => ({ loadStatusEvents: mocks.loadStatusEvents }));
vi.mock('@/lib/sprint-history-query', () => ({ loadSprintChangeEvents: mocks.loadSprintChangeEvents }));

import { PATCH } from '../src/app/api/sprints/[id]/route';
import { logger } from '../src/lib/logger';

const sprintId = crypto.randomUUID();
const spaceId = crypto.randomUUID();
const userId = crypto.randomUUID();

type SprintRow = {
  id: string; spaceId: string; name: string; goal: string | null;
  startDate: string; endDate: string; status: 'planificado' | 'activo' | 'cerrado';
};

let current: SprintRow;
let txForCalls: unknown[];
let txUpdateTables: unknown[];
let txUpdateWheres: unknown[];

function ctx(id = sprintId) {
  return { params: Promise.resolve({ id }) };
}

function patchRequest(body: unknown, id = sprintId) {
  return new NextRequest(`http://localhost/api/sprints/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function httpError(message: string, httpStatus: number) {
  return Object.assign(new Error(message), { httpStatus });
}

function chain(result: unknown, onFor?: (arg: unknown) => void) {
  const builder: Record<string, unknown> = {};
  for (const method of ['from', 'where', 'limit', 'innerJoin', 'orderBy']) builder[method] = () => builder;
  builder.for = (arg: unknown) => { onFor?.(arg); return builder; };
  builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

/** Cola de resultados de tx.select: primero la relectura FOR UPDATE, luego la búsqueda de otro activo. */
function queueTx(results: unknown[][]) {
  const queue = [...results];
  mocks.txSelect.mockImplementation(() => chain(queue.shift() ?? [], arg => txForCalls.push(arg)));
}

let loggerError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  loggerError = vi.spyOn(logger, 'error').mockImplementation(() => {});
  current = {
    id: sprintId, spaceId, name: 'Sprint 3', goal: null,
    startDate: '2026-11-17', endDate: '2026-11-30', status: 'planificado',
  };
  txForCalls = [];
  txUpdateTables = [];
  txUpdateWheres = [];
  mocks.requireSession.mockResolvedValue({ id: userId, role: 'miembro' });
  mocks.requireProjectAccess.mockResolvedValue({ id: spaceId, type: 'proyecto', status: 'activo', businessDaysOnly: false });
  mocks.logAudit.mockResolvedValue(undefined);
  mocks.loadStatusEvents.mockResolvedValue(new Map());
  mocks.loadSprintChangeEvents.mockResolvedValue(new Map());
  mocks.select.mockImplementation(() => chain([{ ...current }]));
  queueTx([[{ ...current }], []]);
  mocks.txUpdate.mockImplementation((table: unknown) => { txUpdateTables.push(table); return { set: mocks.txSet }; });
  mocks.txSet.mockImplementation((input: Record<string, unknown>) => {
    const builder = {
      where: (cond: unknown) => { txUpdateWheres.push(cond); return builder; },
      returning: async () => [{ ...current, ...input }],
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve([]).then(resolve, reject),
    };
    return builder;
  });
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mocks.tx));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PATCH /api/sprints/[id]: validación y permisos', () => {
  it('id mal formado → 400 sin tocar la BD ni registrar errores', async () => {
    const res = await PATCH(patchRequest({ name: 'X' }, 'no-es-uuid'), ctx('no-es-uuid'));

    expect(res.status).toBe(400);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.requireProjectAccess).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('sprint inexistente → 404', async () => {
    mocks.select.mockImplementation(() => chain([]));

    const res = await PATCH(patchRequest({ name: 'X' }), ctx());

    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Sprint no encontrado');
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('observador global → 403 sin tocar la BD', async () => {
    mocks.requireSession.mockResolvedValue({ id: userId, role: 'observador' });

    const res = await PATCH(patchRequest({ name: 'X' }), ctx());

    expect(res.status).toBe(403);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('sin acceso al proyecto del sprint → 403', async () => {
    mocks.requireProjectAccess.mockRejectedValue(httpError('Sin acceso a este proyecto', 403));

    const res = await PATCH(patchRequest({ name: 'X' }), ctx());

    expect(res.status).toBe(403);
    expect(mocks.requireProjectAccess).toHaveBeenCalledWith(expect.objectContaining({ id: userId }), spaceId, 'write');
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('sin sesión → 401 sin registrar errores', async () => {
    mocks.requireSession.mockRejectedValue(new Error('UNAUTHORIZED'));

    const res = await PATCH(patchRequest({ name: 'X' }), ctx());

    expect(res.status).toBe(401);
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('cuerpo vacío → 400', async () => {
    const res = await PATCH(patchRequest({}), ctx());

    expect(res.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it.each([
    ['estado planificado', { status: 'planificado' }],
    ['nombre vacío', { name: '  ' }],
    ['fecha inválida', { startDate: '2026-13-01' }],
  ])('%s → 400', async (_label, body) => {
    const res = await PATCH(patchRequest(body), ctx());

    expect(res.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('fechas incoherentes al fusionar con las actuales → 400 sin update ni auditoría', async () => {
    const res = await PATCH(patchRequest({ endDate: '2026-11-10' }), ctx());

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('La fecha de fin no puede ser anterior a la de inicio');
    expect(mocks.txUpdate).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('editar un sprint cerrado → 409', async () => {
    queueTx([[{ ...current, status: 'cerrado' }]]);

    const res = await PATCH(patchRequest({ name: 'Otro' }), ctx());

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('El sprint está cerrado');
    expect(mocks.txUpdate).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/sprints/[id]: transiciones de estado', () => {
  it('planificado → activo sin otro activo registra sprint_started', async () => {
    const res = await PATCH(patchRequest({ status: 'activo' }), ctx());

    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('activo');
    expect(txForCalls).toEqual(['update']);
    expect(mocks.txSelect).toHaveBeenCalledTimes(2);
    expect(mocks.txSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'activo', updatedAt: expect.any(Date) }));
    expect(mocks.logAudit).toHaveBeenCalledTimes(1);
    expect(mocks.logAudit).toHaveBeenCalledWith(
      {
        actorId: userId,
        action: 'sprint_started',
        spaceId,
        previousValue: 'Sprint 3: Planificado',
        newValue: 'Sprint 3: Activo',
      },
      mocks.tx,
    );
  });

  it('planificado → activo con otro activo en el espacio → 409 sin update ni auditoría', async () => {
    queueTx([[{ ...current }], [{ id: crypto.randomUUID() }]]);

    const res = await PATCH(patchRequest({ status: 'activo' }), ctx());

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('Ya hay un sprint activo en este proyecto');
    expect(mocks.txUpdate).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('un 23505 del índice único en el update → 409', async () => {
    mocks.txSet.mockImplementation(() => {
      const builder = {
        where: () => builder,
        returning: async () => { throw Object.assign(new Error('duplicate key'), { code: '23505' }); },
      };
      return builder;
    });

    const res = await PATCH(patchRequest({ status: 'activo' }), ctx());

    expect(res.status).toBe(409);
    expect(mocks.logAudit).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('planificado → cerrado → 409', async () => {
    const res = await PATCH(patchRequest({ status: 'cerrado' }), ctx());

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('Transición de sprint no permitida');
    expect(mocks.txUpdate).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('activo → activo → 409', async () => {
    queueTx([[{ ...current, status: 'activo' }]]);

    const res = await PATCH(patchRequest({ status: 'activo' }), ctx());

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('Transición de sprint no permitida');
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('planificado → activo guarda startedAt en el mismo update', async () => {
    const res = await PATCH(patchRequest({ status: 'activo' }), ctx());

    expect(res.status).toBe(200);
    expect(mocks.txSet).toHaveBeenCalledTimes(1);
    expect(mocks.txSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'activo', startedAt: expect.any(Date) }));
  });

  it('editar sin cambiar de estado no toca startedAt ni summary', async () => {
    const res = await PATCH(patchRequest({ name: 'Otro' }), ctx());

    expect(res.status).toBe(200);
    const set = mocks.txSet.mock.calls[0][0] as Record<string, unknown>;
    expect(set).not.toHaveProperty('startedAt');
    expect(set).not.toHaveProperty('summary');
  });
});

const SPRINTS_TABLE = { id: 'sprints.id', spaceId: 'sprints.spaceId', status: 'sprints.status' };
const TASKS_TABLE_ID = 'tasks.id';

function scopeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    status: 'en_proceso',
    estimate: 3,
    responsibleId: userId,
    responsibleName: 'Ana',
    blockedByArea: null,
    createdAt: new Date('2026-11-10T12:00:00Z'),
    completedAt: null,
    ...overrides,
  };
}

describe('PATCH /api/sprints/[id]: cierre con arrastre', () => {
  const nextId = crypto.randomUUID();
  const next = () => ({
    id: nextId, spaceId, name: 'Sprint 4', goal: null, startDate: '2026-12-01', endDate: '2026-12-14',
    status: 'planificado', createdAt: new Date('2026-11-01T00:00:00Z'),
  });

  beforeEach(() => {
    current.status = 'activo';
  });

  it('sin pendientes: sólo actualiza sprints, guarda summary y no emite task_sprint_changed', async () => {
    const done = scopeTask({ status: 'completada', estimate: 5, completedAt: new Date('2026-11-20T15:00:00Z') });
    // current, planificados, pendientes FOR UPDATE, alcance.
    queueTx([[{ ...current }], [], [], [done]]);

    const res = await PATCH(patchRequest({ status: 'cerrado' }), ctx());

    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('cerrado');
    expect(mocks.txUpdate).toHaveBeenCalledTimes(1);
    expect(txUpdateTables).toEqual([SPRINTS_TABLE]);
    expect(mocks.txSet).toHaveBeenCalledWith(expect.objectContaining({
      status: 'cerrado',
      summary: expect.objectContaining({
        version: 1,
        committed: { tasks: 1, points: 5 },
        completed: { tasks: 1, points: 5 },
        carriedOver: { tasks: 0, points: 0, to: { sprintId: null, name: 'Backlog' } },
      }),
    }));
    expect(mocks.logAudit).toHaveBeenCalledTimes(1);
    expect(mocks.logAudit).toHaveBeenCalledWith(
      {
        actorId: userId,
        action: 'sprint_closed',
        spaceId,
        previousValue: 'Sprint 3: Activo',
        newValue: 'Sprint 3: Cerrado',
      },
      mocks.tx,
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('con 2 pendientes y un planificado: un único update de tareas y un task_sprint_changed por tarea', async () => {
    const t1 = scopeTask({ estimate: 2 });
    const t2 = scopeTask({ estimate: null, status: 'bloqueada', blockedByArea: 'legal' });
    const done = scopeTask({ status: 'completada', estimate: 5, completedAt: new Date('2026-11-20T15:00:00Z') });
    queueTx([[{ ...current }], [next()], [{ id: t1.id }, { id: t2.id }], [t1, t2, done]]);

    const res = await PATCH(patchRequest({ status: 'cerrado' }), ctx());

    expect(res.status).toBe(200);
    expect(txForCalls).toEqual(['update', 'update', 'update']);
    expect(mocks.txUpdate).toHaveBeenCalledTimes(2);
    expect(txUpdateTables[0]).toEqual(expect.objectContaining({ id: TASKS_TABLE_ID }));
    expect(txUpdateTables[1]).toEqual(SPRINTS_TABLE);
    expect(mocks.txSet.mock.calls[0][0]).toEqual({ sprintId: nextId, updatedAt: expect.any(Date) });
    expect(txUpdateWheres[0]).toEqual({
      operator: 'and',
      conditions: [
        { operator: 'inArray', left: TASKS_TABLE_ID, right: [t1.id, t2.id] },
        { operator: 'eq', left: 'tasks.sprintId', right: sprintId },
      ],
    });
    const sprintChanges = mocks.logAudit.mock.calls.filter(([e]) => e.action === 'task_sprint_changed');
    expect(sprintChanges).toHaveLength(2);
    for (const [i, t] of [t1, t2].entries()) {
      expect(sprintChanges[i]).toEqual([
        {
          actorId: userId,
          action: 'task_sprint_changed',
          taskId: t.id,
          spaceId,
          previousValue: 'Sprint 3',
          newValue: 'Sprint 4',
          reason: JSON.stringify({ from: sprintId, to: nextId }),
        },
        mocks.tx,
      ]);
    }
    expect(mocks.txSet.mock.calls[1][0]).toEqual(expect.objectContaining({
      status: 'cerrado',
      summary: expect.objectContaining({
        carriedOver: { tasks: 2, points: 2, to: { sprintId: nextId, name: 'Sprint 4' } },
        blockersByArea: [{ area: 'legal', count: 1 }],
      }),
    }));
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'sprint_closed' }), mocks.tx);
    // Los eventos se cargan en bloque con el tx y filtrados por el proyecto.
    expect(mocks.loadStatusEvents).toHaveBeenCalledWith([t1.id, t2.id, done.id], mocks.tx);
    expect(mocks.loadSprintChangeEvents).toHaveBeenCalledWith([t1.id, t2.id, done.id], spaceId, mocks.tx);
  });

  it("carryOverTo 'backlog' → sprintId null, newValue 'Backlog' y to null", async () => {
    const t1 = scopeTask();
    queueTx([[{ ...current }], [{ id: t1.id }], [t1]]);

    const res = await PATCH(patchRequest({ status: 'cerrado', carryOverTo: 'backlog' }), ctx());

    expect(res.status).toBe(200);
    expect(mocks.txSet.mock.calls[0][0]).toEqual({ sprintId: null, updatedAt: expect.any(Date) });
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'task_sprint_changed',
      taskId: t1.id,
      newValue: 'Backlog',
      reason: JSON.stringify({ from: sprintId, to: null }),
    }), mocks.tx);
  });

  it('carryOverTo con el id de un sprint planificado del proyecto lo usa como destino', async () => {
    const t1 = scopeTask();
    queueTx([[{ ...current }], [next()], [{ id: t1.id }], [t1]]);

    const res = await PATCH(patchRequest({ status: 'cerrado', carryOverTo: nextId }), ctx());

    expect(res.status).toBe(200);
    expect(mocks.txSet.mock.calls[0][0]).toEqual({ sprintId: nextId, updatedAt: expect.any(Date) });
  });

  it('sin carryOverTo y sin planificados → backlog', async () => {
    const t1 = scopeTask();
    queueTx([[{ ...current }], [], [{ id: t1.id }], [t1]]);

    const res = await PATCH(patchRequest({ status: 'cerrado' }), ctx());

    expect(res.status).toBe(200);
    expect(mocks.txSet.mock.calls[0][0]).toEqual({ sprintId: null, updatedAt: expect.any(Date) });
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'task_sprint_changed', newValue: 'Backlog',
    }), mocks.tx);
  });

  it('sin carryOverTo elige el planificado de menor startDate', async () => {
    const t1 = scopeTask();
    const later = { ...next(), id: crypto.randomUUID(), name: 'Sprint 9', startDate: '2027-01-01' };
    queueTx([[{ ...current }], [later, next()], [{ id: t1.id }], [t1]]);

    const res = await PATCH(patchRequest({ status: 'cerrado' }), ctx());

    expect(res.status).toBe(200);
    expect(mocks.txSet.mock.calls[0][0]).toEqual({ sprintId: nextId, updatedAt: expect.any(Date) });
  });

  it('destino de otro proyecto → 400 sin updates ni auditoría', async () => {
    queueTx([[{ ...current }], [{ ...next(), spaceId: crypto.randomUUID() }]]);

    const res = await PATCH(patchRequest({ status: 'cerrado', carryOverTo: nextId }), ctx());

    expect(res.status).toBe(400);
    expect(mocks.txUpdate).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('destino inexistente → 400 sin escrituras', async () => {
    queueTx([[{ ...current }], []]);

    const res = await PATCH(patchRequest({ status: 'cerrado', carryOverTo: nextId }), ctx());

    expect(res.status).toBe(400);
    expect(mocks.txUpdate).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it.each(['activo', 'cerrado'])('destino %s → 409 sin escrituras', async status => {
    queueTx([[{ ...current }], [{ ...next(), status }]]);

    const res = await PATCH(patchRequest({ status: 'cerrado', carryOverTo: nextId }), ctx());

    expect(res.status).toBe(409);
    expect(mocks.txUpdate).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it.each([
    ['sin status', { carryOverTo: 'backlog' }],
    ['con status activo', { status: 'activo', carryOverTo: 'backlog' }],
    ['con un valor inválido', { status: 'cerrado', carryOverTo: 'otro' }],
  ])('carryOverTo %s → 400 sin transacción', async (_label, body) => {
    const res = await PATCH(patchRequest(body), ctx());

    expect(res.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('logAudit que lanza en la 2.ª tarea → todo o nada: 500 y todo sobre el tx', async () => {
    const t1 = scopeTask();
    const t2 = scopeTask();
    queueTx([[{ ...current }], [next()], [{ id: t1.id }, { id: t2.id }], [t1, t2]]);
    let calls = 0;
    mocks.logAudit.mockImplementation(async () => {
      calls += 1;
      if (calls === 2) throw new Error('fallo de auditoría');
    });

    const res = await PATCH(patchRequest({ status: 'cerrado' }), ctx());

    expect(res.status).toBe(500);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.logAudit.mock.calls.every(([, executor]) => executor === mocks.tx)).toBe(true);
    // El sprint no llegó a cerrarse.
    expect(txUpdateTables).not.toContainEqual(SPRINTS_TABLE);
  });

  it('con días hábiles carga los feriados dentro del tx', async () => {
    mocks.requireProjectAccess.mockResolvedValue({ id: spaceId, type: 'proyecto', status: 'activo', businessDaysOnly: true });
    const done = scopeTask({ status: 'completada', completedAt: new Date('2026-11-20T15:00:00Z') });
    queueTx([[{ ...current }], [], [], [done], [{ date: '2026-11-19' }]]);

    const res = await PATCH(patchRequest({ status: 'cerrado' }), ctx());

    expect(res.status).toBe(200);
    expect(mocks.txSelect).toHaveBeenCalledTimes(5);
    expect(mocks.txSet).toHaveBeenCalledWith(expect.objectContaining({
      summary: expect.objectContaining({ businessDaysOnly: true, cycleTime: expect.objectContaining({ unit: 'business' }) }),
    }));
  });
});

describe('PATCH /api/sprints/[id]: edición y auditoría', () => {
  it('cambiar sólo el nombre registra un sprint_updated legible', async () => {
    const res = await PATCH(patchRequest({ name: 'Sprint 3b' }), ctx());

    expect(res.status).toBe(200);
    expect(mocks.txSet).toHaveBeenCalledWith(expect.objectContaining({ name: 'Sprint 3b', updatedAt: expect.any(Date) }));
    expect(mocks.logAudit).toHaveBeenCalledTimes(1);
    expect(mocks.logAudit).toHaveBeenCalledWith(
      {
        actorId: userId,
        action: 'sprint_updated',
        spaceId,
        previousValue: 'Nombre: Sprint 3',
        newValue: 'Nombre: Sprint 3b',
      },
      mocks.tx,
    );
    for (const [entry] of mocks.logAudit.mock.calls) expect(entry).not.toHaveProperty('taskId');
  });

  it('enviar el mismo nombre no audita', async () => {
    const res = await PATCH(patchRequest({ name: 'Sprint 3' }), ctx());

    expect(res.status).toBe(200);
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('cambiar fechas registra sprint_updated con el rango anterior y el nuevo', async () => {
    const res = await PATCH(patchRequest({ endDate: '2026-12-04' }), ctx());

    expect(res.status).toBe(200);
    expect(mocks.logAudit).toHaveBeenCalledTimes(1);
    expect(mocks.logAudit).toHaveBeenCalledWith(
      {
        actorId: userId,
        action: 'sprint_updated',
        spaceId,
        previousValue: 'Sprint 3: 2026-11-17 → 2026-11-30',
        newValue: 'Sprint 3: 2026-11-17 → 2026-12-04',
      },
      mocks.tx,
    );
  });

  it('cambiar el objetivo registra sprint_updated', async () => {
    const res = await PATCH(patchRequest({ goal: 'Cerrar filtros' }), ctx());

    expect(res.status).toBe(200);
    expect(mocks.logAudit).toHaveBeenCalledTimes(1);
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'sprint_updated',
        previousValue: 'Sprint 3 · Objetivo: sin objetivo',
        newValue: 'Sprint 3 · Objetivo: Cerrar filtros',
      }),
      mocks.tx,
    );
  });
});

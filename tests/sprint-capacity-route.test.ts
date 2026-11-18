import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  const txSelect = vi.fn();
  const txInsert = vi.fn();
  const txValues = vi.fn();
  const txOnConflict = vi.fn();
  const txDelete = vi.fn();
  const txDeleteWhere = vi.fn();
  return {
    requireSession: vi.fn(),
    requireProjectAccess: vi.fn(),
    logAudit: vi.fn(),
    select: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
    txSelect,
    txInsert,
    txValues,
    txOnConflict,
    txDelete,
    txDeleteWhere,
    tx: { select: txSelect, insert: txInsert, delete: txDelete },
  };
});

vi.mock('@/lib/auth', () => ({ requireSession: mocks.requireSession }));
vi.mock('@/lib/db', () => ({
  db: { select: mocks.select, insert: mocks.insert, delete: mocks.delete, transaction: mocks.transaction },
}));
vi.mock('@/lib/audit', () => ({ logAudit: mocks.logAudit }));
vi.mock('@/lib/project-access', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/project-access')>()),
  requireProjectAccess: mocks.requireProjectAccess,
}));
vi.mock('@/lib/db/schema', () => ({
  sprints: { id: 'sprints.id', spaceId: 'sprints.spaceId' },
  sprintCapacity: { sprintId: 'sprintCapacity.sprintId', personId: 'sprintCapacity.personId', points: 'sprintCapacity.points' },
  spaceMembers: { spaceId: 'spaceMembers.spaceId', personId: 'spaceMembers.personId', spaceRole: 'spaceMembers.spaceRole' },
  persons: { id: 'persons.id', name: 'persons.name' },
  tasks: { sprintId: 'tasks.sprintId', responsibleId: 'tasks.responsibleId', archived: 'tasks.archived' },
}));
vi.mock('drizzle-orm', () => ({
  and: (...conditions: unknown[]) => ({ operator: 'and', conditions }),
  eq: (left: unknown, right: unknown) => ({ operator: 'eq', left, right }),
}));

import { PUT } from '../src/app/api/sprints/[id]/capacity/route';
import { logger } from '../src/lib/logger';

const sprintId = crypto.randomUUID();
const spaceId = crypto.randomUUID();
const userId = crypto.randomUUID();
const personId = crypto.randomUUID();

type SprintRow = { id: string; spaceId: string; name: string; status: string };

let current: SprintRow;
let txForCalls: unknown[];

function ctx(id = sprintId) {
  return { params: Promise.resolve({ id }) };
}

function putRequest(body: unknown, id = sprintId) {
  return new NextRequest(`http://localhost/api/sprints/${id}/capacity`, {
    method: 'PUT',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function httpError(message: string, httpStatus: number) {
  return Object.assign(new Error(message), { httpStatus });
}

function chain(result: unknown, onFor?: (arg: unknown) => void) {
  const builder: Record<string, unknown> = {};
  for (const method of ['from', 'where', 'limit', 'innerJoin']) builder[method] = () => builder;
  builder.for = (arg: unknown) => { onFor?.(arg); return builder; };
  builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

/** Cola de tx.select: relectura del sprint, pertenencia, [responsable], capacidad guardada. */
function queueTx(results: unknown[][]) {
  const queue = [...results];
  mocks.txSelect.mockImplementation(() => chain(queue.shift() ?? [], arg => txForCalls.push(arg)));
}

const member = [{ name: 'Ana', spaceRole: 'colaborador' }];

let loggerError: ReturnType<typeof vi.spyOn>;
let deletedRows: unknown[];

beforeEach(() => {
  vi.clearAllMocks();
  loggerError = vi.spyOn(logger, 'error').mockImplementation(() => {});
  current = { id: sprintId, spaceId, name: 'Sprint 3', status: 'planificado' };
  txForCalls = [];
  deletedRows = [];
  mocks.requireSession.mockResolvedValue({ id: userId, role: 'miembro' });
  mocks.requireProjectAccess.mockResolvedValue({ id: spaceId, status: 'activo' });
  mocks.logAudit.mockResolvedValue(undefined);
  mocks.select.mockImplementation(() => chain([{ ...current }]));
  queueTx([[{ ...current }], member, []]);
  mocks.txInsert.mockImplementation(() => ({ values: mocks.txValues }));
  mocks.txValues.mockImplementation(() => ({ onConflictDoUpdate: mocks.txOnConflict }));
  mocks.txOnConflict.mockImplementation((arg: { set: { points: number } }) => ({
    returning: async () => [{ sprintId, personId, points: arg.set.points }],
  }));
  mocks.txDelete.mockImplementation(() => ({ where: mocks.txDeleteWhere }));
  mocks.txDeleteWhere.mockImplementation(() => ({ returning: async () => deletedRows }));
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mocks.tx));
});

afterEach(() => {
  vi.restoreAllMocks();
});

const expectNoWrites = () => {
  expect(mocks.txInsert).not.toHaveBeenCalled();
  expect(mocks.txDelete).not.toHaveBeenCalled();
  expect(mocks.logAudit).not.toHaveBeenCalled();
};

describe('PUT /api/sprints/[id]/capacity: validación y permisos', () => {
  it('sin sesión → 401 sin registrar errores', async () => {
    mocks.requireSession.mockRejectedValue(new Error('UNAUTHORIZED'));

    const res = await PUT(putRequest({ personId, points: 8 }), ctx());

    expect(res.status).toBe(401);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('observador global → 403 sin tocar la BD', async () => {
    mocks.requireSession.mockResolvedValue({ id: userId, role: 'observador' });

    const res = await PUT(putRequest({ personId, points: 8 }), ctx());

    expect(res.status).toBe(403);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it('id mal formado → 400 sin tocar la BD', async () => {
    const res = await PUT(putRequest({ personId, points: 8 }, 'no-es-uuid'), ctx('no-es-uuid'));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('ID de sprint con formato inválido');
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.requireProjectAccess).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('sprint inexistente → 404', async () => {
    mocks.select.mockImplementation(() => chain([]));

    const res = await PUT(putRequest({ personId, points: 8 }), ctx());

    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Sprint no encontrado');
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('sin escritura en el proyecto → 403 propagado', async () => {
    mocks.requireProjectAccess.mockRejectedValue(httpError('Sin permisos de escritura en este proyecto', 403));

    const res = await PUT(putRequest({ personId, points: 8 }), ctx());

    expect(res.status).toBe(403);
    expect(mocks.requireProjectAccess).toHaveBeenCalledWith(expect.objectContaining({ id: userId }), spaceId, 'write');
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('sprint cerrado → 409 sin escrituras', async () => {
    queueTx([[{ ...current, status: 'cerrado' }]]);

    const res = await PUT(putRequest({ personId, points: 8 }), ctx());

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('El sprint está cerrado');
    expectNoWrites();
  });

  it('persona ajena al proyecto y al sprint → 400 sin escrituras', async () => {
    queueTx([[{ ...current }], [], []]);

    const res = await PUT(putRequest({ personId, points: 8 }), ctx());

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('La persona no participa en este proyecto ni en el sprint');
    expectNoWrites();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('observador del proyecto sin tareas en el sprint → 400', async () => {
    queueTx([[{ ...current }], [{ name: 'Olga', spaceRole: 'observador' }], []]);

    const res = await PUT(putRequest({ personId, points: 8 }), ctx());

    expect(res.status).toBe(400);
    expectNoWrites();
  });

  it('responsable de una tarea del sprint aunque no sea miembro → se acepta', async () => {
    queueTx([[{ ...current }], [], [{ name: 'Carla' }], []]);

    const res = await PUT(putRequest({ personId, points: 3 }), ctx());

    expect(res.status).toBe(200);
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({
      newValue: 'Sprint 3 · Carla: 3 puntos',
    }), mocks.tx);
  });

  it.each([
    ['negativo', { personId, points: -1 }],
    ['decimal', { personId, points: 2.5 }],
    ['mayor que 999', { personId, points: 1000 }],
    ['texto', { personId, points: '8' }],
    ['sin points', { personId }],
    ['personId no uuid', { personId: 'ana', points: 8 }],
  ])('cuerpo inválido (%s) → 400 sin transacción', async (_label, body) => {
    const res = await PUT(putRequest(body), ctx());

    expect(res.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('el mensaje de límites está en español', async () => {
    const res = await PUT(putRequest({ personId, points: 1000 }), ctx());

    expect((await res.json()).error).toBe('La capacidad debe ser un número entero entre 0 y 999');
  });

  it('JSON mal formado → 400', async () => {
    const res = await PUT(putRequest('{'), ctx());

    expect(res.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe('PUT /api/sprints/[id]/capacity: guardado y auditoría', () => {
  it('sin valor previo: upsert y sprint_capacity_changed legible en el tx', async () => {
    const res = await PUT(putRequest({ personId, points: 8 }), ctx());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sprintId, personId, points: 8 });
    expect(txForCalls).toEqual(['update']);
    expect(mocks.txValues).toHaveBeenCalledWith({ sprintId, personId, points: 8 });
    expect(mocks.txOnConflict).toHaveBeenCalledWith({
      target: ['sprintCapacity.sprintId', 'sprintCapacity.personId'],
      set: { points: 8, updatedAt: expect.any(Date) },
    });
    expect(mocks.logAudit).toHaveBeenCalledTimes(1);
    expect(mocks.logAudit).toHaveBeenCalledWith(
      {
        actorId: userId,
        action: 'sprint_capacity_changed',
        spaceId,
        previousValue: 'Sprint 3 · Ana: por defecto',
        newValue: 'Sprint 3 · Ana: 8 puntos',
      },
      mocks.tx,
    );
    const [entry] = mocks.logAudit.mock.calls[0];
    expect(JSON.stringify(entry)).not.toContain(personId);
    expect(JSON.stringify(entry)).not.toContain(sprintId);
  });

  it('de 8 a 1: singular en el valor nuevo', async () => {
    queueTx([[{ ...current }], member, [{ points: 8 }]]);

    const res = await PUT(putRequest({ personId, points: 1 }), ctx());

    expect(res.status).toBe(200);
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({
      previousValue: 'Sprint 3 · Ana: 8 puntos',
      newValue: 'Sprint 3 · Ana: 1 punto',
    }), mocks.tx);
  });

  it('mismo valor → 200 sin escribir ni auditar', async () => {
    queueTx([[{ ...current }], member, [{ points: 8 }]]);

    const res = await PUT(putRequest({ personId, points: 8 }), ctx());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sprintId, personId, points: 8 });
    expectNoWrites();
  });

  it('null con fila guardada: delete con returning y auditoría «por defecto»', async () => {
    deletedRows = [{ sprintId, personId, points: 5 }];

    const res = await PUT(putRequest({ personId, points: null }), ctx());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sprintId, personId, points: null });
    expect(mocks.txDelete).toHaveBeenCalledTimes(1);
    expect(mocks.txInsert).not.toHaveBeenCalled();
    expect(mocks.logAudit).toHaveBeenCalledWith(
      {
        actorId: userId,
        action: 'sprint_capacity_changed',
        spaceId,
        previousValue: 'Sprint 3 · Ana: 5 puntos',
        newValue: 'Sprint 3 · Ana: por defecto',
      },
      mocks.tx,
    );
  });

  it('null sin fila → 200 sin auditar', async () => {
    deletedRows = [];

    const res = await PUT(putRequest({ personId, points: null }), ctx());

    expect(res.status).toBe(200);
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('un activo también admite capacidad', async () => {
    queueTx([[{ ...current, status: 'activo' }], member, []]);

    const res = await PUT(putRequest({ personId, points: 0 }), ctx());

    expect(res.status).toBe(200);
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({
      newValue: 'Sprint 3 · Ana: 0 puntos',
    }), mocks.tx);
  });
});

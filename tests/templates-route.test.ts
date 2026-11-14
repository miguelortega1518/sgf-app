import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type Chain = Record<string, ReturnType<typeof vi.fn>>;

/**
 * Crea una cadena encadenable de Drizzle: cada método devuelve la propia cadena,
 * y la cadena es "thenable" para resolver con `result` al hacer await en cualquier punto.
 */
function makeChain(result: () => unknown, methods: string[]): Chain {
  const chain: Chain = {};
  for (const m of methods) chain[m] = vi.fn(() => chain);
  (chain as unknown as { then: unknown }).then = (
    resolve: (v: unknown) => unknown,
    reject: (e: unknown) => unknown,
  ) => {
    try {
      return Promise.resolve(result()).then(resolve, reject);
    } catch (e) {
      return Promise.reject(e).then(resolve, reject);
    }
  };
  return chain;
}

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  transaction: vi.fn(),
  txSelect: vi.fn(),
  txInsert: vi.fn(),
  txDelete: vi.fn(),
  txUpdate: vi.fn(),
  logAudit: vi.fn(),
  tx: {} as Record<string, unknown>,
}));
mocks.tx.select = mocks.txSelect;
mocks.tx.insert = mocks.txInsert;
mocks.tx.delete = mocks.txDelete;
mocks.tx.update = mocks.txUpdate;

vi.mock('@/lib/auth', () => ({
  requireRole: mocks.requireRole,
}));
vi.mock('@/lib/audit', () => ({ logAudit: mocks.logAudit }));
vi.mock('@/lib/db', () => ({
  db: {
    select: mocks.select,
    insert: mocks.insert,
    update: mocks.update,
    delete: mocks.delete,
    transaction: mocks.transaction,
  },
}));
vi.mock('@/lib/db/schema', () => ({
  spaceTemplates: {
    __table: 'spaceTemplates',
    id: 'id',
    name: 'name',
    periodicity: 'periodicity',
    targetCycleDays: 'targetCycleDays',
    autoGenerate: 'autoGenerate',
    active: 'active',
  },
  taskTemplates: {
    __table: 'taskTemplates',
    id: 'id',
    spaceTemplateId: 'spaceTemplateId',
    taskName: 'taskName',
    companyId: 'companyId',
    order: 'order',
    businessDayLimit: 'businessDayLimit',
    defaultResponsibleId: 'defaultResponsibleId',
    alternateId: 'alternateId',
    reviewerId: 'reviewerId',
    requiresApproval: 'requiresApproval',
    requiresEvidence: 'requiresEvidence',
    instructions: 'instructions',
    doneDefinition: 'doneDefinition',
    applies: 'applies',
    notApplicableReason: 'notApplicableReason',
    active: 'active',
  },
  templateDependencies: {
    __table: 'templateDependencies',
    templateId: 'templateId',
    predecessorId: 'predecessorId',
  },
  companies: { __table: 'companies', id: 'companies.id', name: 'companies.name' },
  persons: { __table: 'persons', id: 'persons.id', name: 'persons.name' },
}));
vi.mock('drizzle-orm', () => ({
  and: (...conditions: unknown[]) => ({ operator: 'and', conditions }),
  or: (...conditions: unknown[]) => ({ operator: 'or', conditions }),
  eq: (left: unknown, right: unknown) => ({ operator: 'eq', left, right }),
  inArray: (left: unknown, right: unknown) => ({ operator: 'inArray', left, right }),
  asc: (col: unknown) => ({ operator: 'asc', col }),
}));

import { GET as GET_TEMPLATE, PATCH as PATCH_TEMPLATE } from '../src/app/api/templates/[id]/route';
import { POST as POST_TASK } from '../src/app/api/templates/[id]/tasks/route';
import { POST as DUPLICATE } from '../src/app/api/templates/[id]/duplicate/route';
import { PATCH as PATCH_TASK, DELETE as DELETE_TASK } from '../src/app/api/templates/[id]/tasks/[taskId]/route';
import { POST as POST_TEMPLATE } from '../src/app/api/templates/route';
import { logger } from '../src/lib/logger';
import { TEMPLATE_NAME_MAX, TEMPLATE_TEXT_MAX } from '../src/lib/schemas/template';

const templateId = crypto.randomUUID();
const taskId = crypto.randomUUID();
const adminId = crypto.randomUUID();

function jsonRequest(url: string, method: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
  });
}

function expectNoDbCalls() {
  expect(mocks.select).not.toHaveBeenCalled();
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.delete).not.toHaveBeenCalled();
  expect(mocks.transaction).not.toHaveBeenCalled();
  expect(mocks.txSelect).not.toHaveBeenCalled();
  expect(mocks.txInsert).not.toHaveBeenCalled();
  expect(mocks.txUpdate).not.toHaveBeenCalled();
  expect(mocks.txDelete).not.toHaveBeenCalled();
  expect(mocks.logAudit).not.toHaveBeenCalled();
}

async function expectTooLong(response: Response, max: number) {
  expect(response.status).toBe(400);
  const body = await response.json();
  expect(body.error).toContain(`no puede superar ${max} caracteres`);
}

async function expectInvalidId(response: Response) {
  expect(response.status).toBe(400);
  const body = await response.json();
  expect(body.error).toContain('formato inválido');
}

describe('/api/templates/[id]/**', () => {
  let loggerError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    loggerError = vi.spyOn(logger, 'error').mockImplementation(() => {});
    mocks.requireRole.mockResolvedValue({ id: adminId, role: 'admin' });
    mocks.transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(mocks.tx));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('PATCH /api/templates/[id]/tasks/[taskId]', () => {
    function ctx(id = templateId, tId = taskId) {
      return { params: Promise.resolve({ id, taskId: tId }) };
    }
    function req(body: unknown = { taskName: 'Nuevo nombre' }) {
      return jsonRequest(`/api/templates/${templateId}/tasks/${taskId}`, 'PATCH', body);
    }

    const ownTask = {
      taskName: 'A',
      templateName: 'Cierre',
      order: 1,
      businessDayLimit: 3,
      requiresApproval: false,
      requiresEvidence: false,
      applies: true,
      instructions: null,
      doneDefinition: null,
      notApplicableReason: null,
      companyId: null,
      defaultResponsibleId: null,
      alternateId: null,
      reviewerId: null,
    };
    const ownTaskFilter = {
      operator: 'and',
      conditions: [
        { operator: 'eq', left: 'id', right: taskId },
        { operator: 'eq', left: 'spaceTemplateId', right: templateId },
      ],
    };

    it('devuelve 404 si la tarea no pertenece a la plantilla y filtra por plantilla', async () => {
      const selectChain = makeChain(() => [], ['from', 'innerJoin', 'where', 'limit', 'for']);
      mocks.txSelect.mockReturnValue(selectChain);

      const response = await PATCH_TASK(req(), ctx());

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'Tarea de plantilla no encontrada' });
      expect(mocks.transaction).toHaveBeenCalledTimes(1);
      expect(selectChain.where).toHaveBeenCalledWith(ownTaskFilter);
      expect(selectChain.for).toHaveBeenCalledWith('update');
      expect(mocks.txUpdate).not.toHaveBeenCalled();
      expect(mocks.update).not.toHaveBeenCalled();
      expect(mocks.logAudit).not.toHaveBeenCalled();
    });

    it('actualiza la tarea propia, audita el cambio y devuelve la fila', async () => {
      const row = { id: taskId, spaceTemplateId: templateId, taskName: 'B' };
      const selectChain = makeChain(() => [ownTask], ['from', 'innerJoin', 'where', 'limit', 'for']);
      mocks.txSelect.mockReturnValue(selectChain);
      const updateChain = makeChain(() => [row], ['set', 'where', 'returning']);
      mocks.txUpdate.mockReturnValue(updateChain);

      const response = await PATCH_TASK(req({ taskName: 'B' }), ctx());

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(row);
      expect(mocks.transaction).toHaveBeenCalledTimes(1);
      expect(mocks.update).not.toHaveBeenCalled();
      expect(updateChain.set).toHaveBeenCalledWith({ taskName: 'B' });
      expect(updateChain.where).toHaveBeenCalledWith(ownTaskFilter);
      expect(selectChain.for).toHaveBeenCalledWith('update');
      expect(mocks.logAudit).toHaveBeenCalledTimes(1);
      expect(mocks.logAudit).toHaveBeenCalledWith(
        {
          actorId: adminId,
          action: 'template_task_updated',
          previousValue: 'Cierre › A: Nombre: A',
          newValue: 'Cierre › A: Nombre: B',
        },
        mocks.tx,
      );
    });

    it('no audita si el body no cambia nada', async () => {
      const row = { id: taskId, spaceTemplateId: templateId, taskName: 'A' };
      mocks.txSelect.mockReturnValue(makeChain(() => [ownTask], ['from', 'innerJoin', 'where', 'limit', 'for']));
      mocks.txUpdate.mockReturnValue(makeChain(() => [row], ['set', 'where', 'returning']));

      const response = await PATCH_TASK(req({ taskName: 'A' }), ctx());

      expect(response.status).toBe(200);
      expect(mocks.logAudit).not.toHaveBeenCalled();
    });

    it('devuelve 400 con taskId inválido sin tocar la BD ni registrar error', async () => {
      const response = await PATCH_TASK(req(), ctx(templateId, 'abc'));

      await expectInvalidId(response);
      expectNoDbCalls();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('devuelve 400 con id de plantilla inválido sin tocar la BD', async () => {
      const response = await PATCH_TASK(req(), ctx('abc', taskId));

      await expectInvalidId(response);
      expectNoDbCalls();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('valida el UUID antes de leer el body', async () => {
      const bad = new NextRequest(`http://localhost/api/templates/abc/tasks/${taskId}`, {
        method: 'PATCH',
        body: '{malformado',
        headers: { 'Content-Type': 'application/json' },
      });
      const response = await PATCH_TASK(bad, ctx('abc', taskId));

      await expectInvalidId(response);
    });

    it('un no admin recibe 403 aunque el id sea inválido', async () => {
      mocks.requireRole.mockRejectedValue(new Error('FORBIDDEN'));

      const response = await PATCH_TASK(req(), ctx('abc', 'abc'));

      expect(response.status).toBe(403);
      expectNoDbCalls();
    });

    it('devuelve 400 con taskName demasiado largo sin tocar la BD ni auditar', async () => {
      const response = await PATCH_TASK(req({ taskName: 'a'.repeat(TEMPLATE_NAME_MAX + 1) }), ctx());

      await expectTooLong(response, TEMPLATE_NAME_MAX);
      expectNoDbCalls();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('devuelve 400 con instructions demasiado largas sin tocar la BD ni auditar', async () => {
      const response = await PATCH_TASK(req({ instructions: 'a'.repeat(TEMPLATE_TEXT_MAX + 1) }), ctx());

      await expectTooLong(response, TEMPLATE_TEXT_MAX);
      expectNoDbCalls();
      expect(loggerError).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/templates/[id]/tasks/[taskId]', () => {
    function ctx(id = templateId, tId = taskId) {
      return { params: Promise.resolve({ id, taskId: tId }) };
    }
    function req() {
      return jsonRequest(`/api/templates/${templateId}/tasks/${taskId}`, 'DELETE');
    }

    it('devuelve 404 sin borrar nada si la tarea es de otra plantilla', async () => {
      const selectChain = makeChain(() => [], ['from', 'innerJoin', 'where', 'limit', 'for']);
      mocks.txSelect.mockReturnValue(selectChain);

      const response = await DELETE_TASK(req(), ctx());

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'Tarea de plantilla no encontrada' });
      expect(mocks.transaction).toHaveBeenCalledTimes(1);
      expect(selectChain.where).toHaveBeenCalledWith({
        operator: 'and',
        conditions: [
          { operator: 'eq', left: 'id', right: taskId },
          { operator: 'eq', left: 'spaceTemplateId', right: templateId },
        ],
      });
      expect(selectChain.for).toHaveBeenCalledWith('update');
      expect(mocks.txDelete).not.toHaveBeenCalled();
      expect(mocks.delete).not.toHaveBeenCalled();
      expect(mocks.logAudit).not.toHaveBeenCalled();
    });

    it('borra dependencias y tarea dentro de una sola transacción', async () => {
      const selectChain = makeChain(
        () => [{ id: taskId, taskName: 'A', templateName: 'Cierre' }],
        ['from', 'innerJoin', 'where', 'limit', 'for'],
      );
      mocks.txSelect.mockReturnValue(selectChain);
      const deleteChains: Chain[] = [];
      mocks.txDelete.mockImplementation(() => {
        const c = makeChain(() => [{ id: taskId }], ['where', 'returning']);
        deleteChains.push(c);
        return c;
      });

      const response = await DELETE_TASK(req(), ctx());

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ deleted: true });
      expect(mocks.transaction).toHaveBeenCalledTimes(1);
      expect(mocks.delete).not.toHaveBeenCalled();
      expect(mocks.txDelete).toHaveBeenCalledTimes(2);
      expect(mocks.txDelete.mock.calls[0][0]).toMatchObject({ __table: 'templateDependencies' });
      expect(deleteChains[0].where).toHaveBeenCalledWith({
        operator: 'or',
        conditions: [
          { operator: 'eq', left: 'templateId', right: taskId },
          { operator: 'eq', left: 'predecessorId', right: taskId },
        ],
      });
      expect(mocks.txDelete.mock.calls[1][0]).toMatchObject({ __table: 'taskTemplates' });
      expect(deleteChains[1].where).toHaveBeenCalledWith({
        operator: 'and',
        conditions: [
          { operator: 'eq', left: 'id', right: taskId },
          { operator: 'eq', left: 'spaceTemplateId', right: templateId },
        ],
      });
      expect(mocks.logAudit).toHaveBeenCalledTimes(1);
      expect(mocks.logAudit).toHaveBeenCalledWith(
        { actorId: adminId, action: 'template_task_deleted', previousValue: 'Cierre › A' },
        mocks.tx,
      );
      const auditOrder = mocks.logAudit.mock.invocationCallOrder[0];
      for (const order of mocks.txDelete.mock.invocationCallOrder) {
        expect(order).toBeLessThan(auditOrder);
      }
    });

    it('devuelve 400 con taskId inválido sin abrir transacción', async () => {
      const response = await DELETE_TASK(req(), ctx(templateId, 'abc'));

      await expectInvalidId(response);
      expectNoDbCalls();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('devuelve 400 con id de plantilla inválido sin abrir transacción', async () => {
      const response = await DELETE_TASK(req(), ctx('abc', taskId));

      await expectInvalidId(response);
      expectNoDbCalls();
    });

    it('un no admin recibe 403 aunque el id sea inválido', async () => {
      mocks.requireRole.mockRejectedValue(new Error('FORBIDDEN'));

      const response = await DELETE_TASK(req(), ctx('abc', 'abc'));

      expect(response.status).toBe(403);
      expectNoDbCalls();
    });
  });

  describe('POST /api/templates/[id]/duplicate', () => {
    const sourceTaskA = { id: crypto.randomUUID(), companyId: null, taskName: 'A', order: 1 };
    const sourceTaskB = { id: crypto.randomUUID(), companyId: null, taskName: 'B', order: 2 };
    const source = {
      id: templateId,
      name: 'Cierre mensual',
      periodicity: 'mensual',
      targetCycleDays: 10,
      autoGenerate: true,
      active: true,
    };
    const newTemplateId = crypto.randomUUID();
    const newTaskA = crypto.randomUUID();
    const newTaskB = crypto.randomUUID();

    function ctx(id = templateId) {
      return { params: Promise.resolve({ id }) };
    }
    function req() {
      return jsonRequest(`/api/templates/${templateId}/duplicate`, 'POST');
    }

    function mockReads() {
      const results = [
        [source],
        [sourceTaskA, sourceTaskB],
        [{ templateId: sourceTaskB.id, predecessorId: sourceTaskA.id }],
      ];
      const selectFor = (fn: ReturnType<typeof vi.fn>) =>
        fn.mockImplementation(() => {
          const r = results.shift() ?? [];
          return makeChain(() => r, ['from', 'where', 'limit', 'orderBy', 'for']);
        });
      selectFor(mocks.select);
      selectFor(mocks.txSelect);
    }

    function mockInserts(failOnTask?: number) {
      const insertedTasks: string[] = [newTaskA, newTaskB];
      let taskCount = 0;
      const valuesCalls: { table: string; values: unknown }[] = [];
      mocks.txInsert.mockImplementation((table: { __table: string }) => {
        const chain: Chain = {};
        chain.values = vi.fn((values: unknown) => {
          valuesCalls.push({ table: table.__table, values });
          return chain;
        });
        chain.returning = vi.fn(() => chain);
        (chain as unknown as { then: unknown }).then = (
          resolve: (v: unknown) => unknown,
          reject: (e: unknown) => unknown,
        ) => {
          let p: Promise<unknown>;
          if (table.__table === 'spaceTemplates') {
            p = Promise.resolve([{ ...source, id: newTemplateId, name: `${source.name} (copia)`, autoGenerate: false }]);
          } else if (table.__table === 'taskTemplates') {
            taskCount += 1;
            p = failOnTask === taskCount
              ? Promise.reject(new Error('boom'))
              : Promise.resolve([{ id: insertedTasks[taskCount - 1] }]);
          } else {
            p = Promise.resolve([]);
          }
          return p.then(resolve, reject);
        };
        return chain;
      });
      return valuesCalls;
    }

    it('duplica la plantilla dentro de una sola transacción', async () => {
      mockReads();
      const valuesCalls = mockInserts();

      const response = await DUPLICATE(req(), ctx());

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.name).toBe('Cierre mensual (copia)');
      expect(body.autoGenerate).toBe(false);
      expect(body.id).toBe(newTemplateId);
      expect(mocks.transaction).toHaveBeenCalledTimes(1);
      expect(mocks.insert).not.toHaveBeenCalled();
      expect(mocks.txInsert).toHaveBeenCalledTimes(4);
      expect(valuesCalls[0]).toMatchObject({
        table: 'spaceTemplates',
        values: { name: 'Cierre mensual (copia)', autoGenerate: false },
      });
      expect(valuesCalls.filter(c => c.table === 'taskTemplates')).toHaveLength(2);
      for (const c of valuesCalls.filter(c => c.table === 'taskTemplates')) {
        expect(c.values).toMatchObject({ spaceTemplateId: newTemplateId });
      }
      expect(valuesCalls[3]).toEqual({
        table: 'templateDependencies',
        values: { templateId: newTaskB, predecessorId: newTaskA },
      });
      expect(mocks.logAudit).toHaveBeenCalledTimes(1);
      expect(mocks.logAudit).toHaveBeenCalledWith(
        {
          actorId: adminId,
          action: 'template_duplicated',
          previousValue: 'Cierre mensual',
          newValue: 'Cierre mensual (copia)',
        },
        mocks.tx,
      );
      const auditOrder = mocks.logAudit.mock.invocationCallOrder[0];
      for (const order of mocks.txInsert.mock.invocationCallOrder) {
        expect(order).toBeLessThan(auditOrder);
      }
    });

    it('devuelve 404 si la plantilla de origen no existe, sin transacción ni auditoría', async () => {
      mocks.select.mockReturnValue(makeChain(() => [], ['from', 'where', 'limit']));

      const response = await DUPLICATE(req(), ctx());

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'Plantilla no encontrada' });
      expect(mocks.transaction).not.toHaveBeenCalled();
      expect(mocks.logAudit).not.toHaveBeenCalled();
    });

    it('si falla el insert de una tarea, propaga el error, responde 500 y no inserta dependencias', async () => {
      mockReads();
      const valuesCalls = mockInserts(2);
      let txPromise: Promise<unknown> | undefined;
      mocks.transaction.mockImplementation((cb: (tx: unknown) => Promise<unknown>) => {
        txPromise = cb(mocks.tx);
        return txPromise;
      });

      const response = await DUPLICATE(req(), ctx());

      expect(response.status).toBe(500);
      expect((await response.json()).error).toMatch(/^Error interno \(ref\. /);
      expect(mocks.transaction).toHaveBeenCalledTimes(1);
      await expect(txPromise).rejects.toThrow('boom');
      expect(valuesCalls.some(c => c.table === 'templateDependencies')).toBe(false);
      expect(mocks.insert).not.toHaveBeenCalled();
      expect(mocks.logAudit).not.toHaveBeenCalled();
      expect(loggerError).toHaveBeenCalled();
    });

    it('devuelve 400 con id inválido sin tocar la BD', async () => {
      const response = await DUPLICATE(req(), ctx('abc'));

      await expectInvalidId(response);
      expectNoDbCalls();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('un no admin recibe 403 aunque el id sea inválido', async () => {
      mocks.requireRole.mockRejectedValue(new Error('FORBIDDEN'));

      const response = await DUPLICATE(req(), ctx('abc'));

      expect(response.status).toBe(403);
      expectNoDbCalls();
    });
  });

  describe('GET/PATCH /api/templates/[id]', () => {
    function ctx(id: string) {
      return { params: Promise.resolve({ id }) };
    }

    it('GET con id inválido devuelve 400 sin tocar la BD', async () => {
      const response = await GET_TEMPLATE(jsonRequest('/api/templates/abc', 'GET'), ctx('abc'));

      await expectInvalidId(response);
      expectNoDbCalls();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('PATCH con id inválido y body válido devuelve 400 sin tocar la BD', async () => {
      const response = await PATCH_TEMPLATE(
        jsonRequest('/api/templates/abc', 'PATCH', { name: 'Otro' }),
        ctx('abc'),
      );

      await expectInvalidId(response);
      expectNoDbCalls();
      expect(loggerError).not.toHaveBeenCalled();
    });

    const current = {
      id: templateId,
      name: 'Cierre',
      periodicity: 'mensual',
      targetCycleDays: 10,
      autoGenerate: false,
      active: true,
    };
    const byTemplateId = { operator: 'eq', left: 'id', right: templateId };

    it('PATCH con id válido sigue actualizando', async () => {
      const row = { ...current, name: 'Otro' };
      mocks.txSelect.mockReturnValue(makeChain(() => [current], ['from', 'where', 'limit', 'for']));
      const chain = makeChain(() => [row], ['set', 'where', 'returning']);
      mocks.txUpdate.mockReturnValue(chain);

      const response = await PATCH_TEMPLATE(
        jsonRequest(`/api/templates/${templateId}`, 'PATCH', { name: 'Otro' }),
        ctx(templateId),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(row);
      expect(chain.set).toHaveBeenCalledWith({ name: 'Otro' });
      expect(chain.where).toHaveBeenCalledWith(byTemplateId);
    });

    it('PATCH actualiza y audita dentro de una transacción', async () => {
      const row = { ...current, targetCycleDays: 12 };
      const selectChain = makeChain(() => [current], ['from', 'where', 'limit', 'for']);
      mocks.txSelect.mockReturnValue(selectChain);
      mocks.txUpdate.mockReturnValue(makeChain(() => [row], ['set', 'where', 'returning']));

      const response = await PATCH_TEMPLATE(
        jsonRequest(`/api/templates/${templateId}`, 'PATCH', { targetCycleDays: 12 }),
        ctx(templateId),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(row);
      expect(mocks.transaction).toHaveBeenCalledTimes(1);
      expect(mocks.update).not.toHaveBeenCalled();
      expect(selectChain.where).toHaveBeenCalledWith(byTemplateId);
      expect(selectChain.for).toHaveBeenCalledWith('update');
      expect(mocks.logAudit).toHaveBeenCalledTimes(1);
      expect(mocks.logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'template_updated',
          actorId: adminId,
          previousValue: 'Cierre: Días de ciclo: 10',
          newValue: 'Cierre: Días de ciclo: 12',
        }),
        mocks.tx,
      );
      const [params] = mocks.logAudit.mock.calls[0];
      expect(params).not.toHaveProperty('taskId');
      expect(params).not.toHaveProperty('spaceId');
    });

    it('PATCH devuelve 404 si la plantilla no existe, sin update ni auditoría', async () => {
      const selectChain = makeChain(() => [], ['from', 'where', 'limit', 'for']);
      mocks.txSelect.mockReturnValue(selectChain);

      const response = await PATCH_TEMPLATE(
        jsonRequest(`/api/templates/${templateId}`, 'PATCH', { name: 'Otro' }),
        ctx(templateId),
      );

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'Plantilla no encontrada' });
      expect(selectChain.for).toHaveBeenCalledWith('update');
      expect(mocks.txUpdate).not.toHaveBeenCalled();
      expect(mocks.update).not.toHaveBeenCalled();
      expect(mocks.logAudit).not.toHaveBeenCalled();
    });

    it('PATCH con un body igual al estado actual responde 200 sin auditar', async () => {
      mocks.txSelect.mockReturnValue(makeChain(() => [current], ['from', 'where', 'limit', 'for']));
      mocks.txUpdate.mockReturnValue(makeChain(() => [current], ['set', 'where', 'returning']));

      const response = await PATCH_TEMPLATE(
        jsonRequest(`/api/templates/${templateId}`, 'PATCH', { name: 'Cierre', active: true }),
        ctx(templateId),
      );

      expect(response.status).toBe(200);
      expect(mocks.logAudit).not.toHaveBeenCalled();
    });

    it('PATCH sin permisos devuelve 403 sin tocar la BD', async () => {
      mocks.requireRole.mockRejectedValue(new Error('FORBIDDEN'));

      const response = await PATCH_TEMPLATE(
        jsonRequest(`/api/templates/${templateId}`, 'PATCH', { name: 'Otro' }),
        ctx(templateId),
      );

      expect(response.status).toBe(403);
      expectNoDbCalls();
    });

    it('PATCH con name demasiado largo devuelve 400 sin tocar la BD ni auditar', async () => {
      const response = await PATCH_TEMPLATE(
        jsonRequest(`/api/templates/${templateId}`, 'PATCH', { name: 'a'.repeat(TEMPLATE_NAME_MAX + 1) }),
        ctx(templateId),
      );

      await expectTooLong(response, TEMPLATE_NAME_MAX);
      expectNoDbCalls();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('GET con id inválido y sin permisos devuelve 403', async () => {
      mocks.requireRole.mockRejectedValue(new Error('FORBIDDEN'));

      const response = await GET_TEMPLATE(jsonRequest('/api/templates/abc', 'GET'), ctx('abc'));

      expect(response.status).toBe(403);
      expectNoDbCalls();
    });
  });

  describe('POST /api/templates/[id]/tasks', () => {
    function ctx(id: string) {
      return { params: Promise.resolve({ id }) };
    }
    const validBody = { taskName: 'Conciliar', order: 1, businessDayLimit: 3 };

    it('con id inválido devuelve 400 sin insertar', async () => {
      const response = await POST_TASK(
        jsonRequest('/api/templates/abc/tasks', 'POST', validBody),
        ctx('abc'),
      );

      await expectInvalidId(response);
      expectNoDbCalls();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('con id válido inserta la tarea en la plantilla y la audita', async () => {
      const row = { id: taskId, spaceTemplateId: templateId, ...validBody };
      const selectChain = makeChain(() => [{ id: templateId, name: 'Cierre' }], ['from', 'where', 'limit', 'for']);
      mocks.txSelect.mockReturnValue(selectChain);
      const chain = makeChain(() => [row], ['values', 'returning']);
      mocks.txInsert.mockReturnValue(chain);

      const response = await POST_TASK(
        jsonRequest(`/api/templates/${templateId}/tasks`, 'POST', validBody),
        ctx(templateId),
      );

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual(row);
      expect(chain.values).toHaveBeenCalledWith(expect.objectContaining({ spaceTemplateId: templateId }));
      expect(mocks.transaction).toHaveBeenCalledTimes(1);
      expect(mocks.insert).not.toHaveBeenCalled();
      expect(selectChain.where).toHaveBeenCalledWith({ operator: 'eq', left: 'id', right: templateId });
      expect(mocks.logAudit).toHaveBeenCalledTimes(1);
      expect(mocks.logAudit).toHaveBeenCalledWith(
        { actorId: adminId, action: 'template_task_created', newValue: 'Cierre › Conciliar' },
        mocks.tx,
      );
    });

    it('devuelve 404 si la plantilla no existe, sin insertar ni auditar', async () => {
      mocks.txSelect.mockReturnValue(makeChain(() => [], ['from', 'where', 'limit', 'for']));

      const response = await POST_TASK(
        jsonRequest(`/api/templates/${templateId}/tasks`, 'POST', validBody),
        ctx(templateId),
      );

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'Plantilla no encontrada' });
      expect(mocks.txInsert).not.toHaveBeenCalled();
      expect(mocks.insert).not.toHaveBeenCalled();
      expect(mocks.logAudit).not.toHaveBeenCalled();
    });

    it('sin permisos devuelve 403 sin tocar la BD', async () => {
      mocks.requireRole.mockRejectedValue(new Error('FORBIDDEN'));

      const response = await POST_TASK(
        jsonRequest(`/api/templates/${templateId}/tasks`, 'POST', validBody),
        ctx(templateId),
      );

      expect(response.status).toBe(403);
      expectNoDbCalls();
    });

    it('con taskName demasiado largo devuelve 400 sin insertar ni auditar', async () => {
      const response = await POST_TASK(
        jsonRequest(`/api/templates/${templateId}/tasks`, 'POST', {
          ...validBody,
          taskName: 'a'.repeat(TEMPLATE_NAME_MAX + 1),
        }),
        ctx(templateId),
      );

      await expectTooLong(response, TEMPLATE_NAME_MAX);
      expectNoDbCalls();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('con doneDefinition demasiado larga devuelve 400 sin insertar ni auditar', async () => {
      const response = await POST_TASK(
        jsonRequest(`/api/templates/${templateId}/tasks`, 'POST', {
          ...validBody,
          doneDefinition: 'a'.repeat(TEMPLATE_TEXT_MAX + 1),
        }),
        ctx(templateId),
      );

      await expectTooLong(response, TEMPLATE_TEXT_MAX);
      expectNoDbCalls();
      expect(loggerError).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/templates', () => {
    const validBody = { name: 'Cierre', periodicity: 'mensual', targetCycleDays: 10 };

    it('con name demasiado largo devuelve 400 sin insertar ni auditar', async () => {
      const response = await POST_TEMPLATE(
        jsonRequest('/api/templates', 'POST', { ...validBody, name: 'a'.repeat(TEMPLATE_NAME_MAX + 1) }),
      );

      await expectTooLong(response, TEMPLATE_NAME_MAX);
      expectNoDbCalls();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('con un body normal inserta la plantilla y responde 201', async () => {
      const row = { id: templateId, ...validBody, autoGenerate: false, active: true };
      const chain = makeChain(() => [row], ['values', 'returning']);
      mocks.insert.mockReturnValue(chain);

      const response = await POST_TEMPLATE(jsonRequest('/api/templates', 'POST', validBody));

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual(row);
      expect(chain.values).toHaveBeenCalledWith({ ...validBody, autoGenerate: false });
    });
  });
});

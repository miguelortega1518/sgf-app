import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type Row = Record<string, unknown>;

const mocks = vi.hoisted(() => {
  const state = {
    tables: {} as Record<string, unknown>,
    persons: [] as Record<string, unknown>[],
    members: [] as Record<string, unknown>[],
    milestones: [] as Record<string, unknown>[],
  };
  const calls = {
    select: [] as unknown[],
    insert: [] as { table: unknown; values: unknown }[],
  };

  function rowsFor(table: unknown) {
    if (table === state.tables.persons) return state.persons;
    if (table === state.tables.spaceMembers) return state.members;
    if (table === state.tables.milestones) return state.milestones;
    return [];
  }

  const select = vi.fn(() => ({
    from: (table: unknown) => ({
      where: () => {
        calls.select.push(table);
        return Promise.resolve(rowsFor(table));
      },
    }),
  }));

  const insert = vi.fn((table: unknown) => ({
    values: (values: unknown) => {
      calls.insert.push({ table, values });
      const done = Promise.resolve(undefined);
      return {
        returning: () => Promise.resolve(
          (Array.isArray(values) ? values : [values]).map((v: Record<string, unknown>) => ({ id: crypto.randomUUID(), title: v.title })),
        ),
        then: done.then.bind(done),
      };
    },
  }));

  const tx = { select, insert };

  return {
    state,
    calls,
    select,
    insert,
    tx,
    transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
    requireSession: vi.fn(),
    requireProjectAccess: vi.fn(),
    notify: vi.fn(),
    buildAssignmentNotifications: vi.fn(),
    checkRateLimit: vi.fn(),
    recordFailure: vi.fn(),
  };
});

vi.mock('@/lib/auth', () => ({ requireSession: mocks.requireSession }));
vi.mock('@/lib/db', () => ({ db: { transaction: mocks.transaction, select: mocks.select, insert: mocks.insert } }));
vi.mock('@/lib/notify', () => ({ notify: mocks.notify }));
vi.mock('@/lib/assignment-notifications', () => ({ buildAssignmentNotifications: mocks.buildAssignmentNotifications }));
vi.mock('@/lib/rate-limit', async () => ({
  checkRateLimit: mocks.checkRateLimit,
  recordFailure: mocks.recordFailure,
  formatWait: (await import('../src/lib/rate-limit-policy')).formatWait,
}));
vi.mock('@/lib/project-access', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/project-access')>()),
  requireProjectAccess: mocks.requireProjectAccess,
}));

import { POST } from '../src/app/api/spaces/[id]/import-csv/route';
import { auditLog, milestones, persons, spaceMembers, tasks } from '../src/lib/db/schema';
import { logger } from '../src/lib/logger';
import { IMPORT_CSV_MAX_BODY_BYTES, IMPORT_CSV_MAX_PER_WINDOW } from '../src/lib/schemas/task-import';

mocks.state.tables = { persons, spaceMembers, milestones };

const userId = crypto.randomUUID();
const spaceId = crypto.randomUUID();
const ownerId = crypto.randomUUID();
const ana = { id: crypto.randomUUID(), name: 'Ana', email: 'ana@ejemplo.com', role: 'miembro', active: true };
const beto = { id: crypto.randomUUID(), name: 'Beto', email: 'Beto@Ejemplo.com', role: 'miembro', active: true };
const lider = { id: crypto.randomUUID(), name: 'Lía', email: 'lia@ejemplo.com', role: 'miembro', active: true };
const olga = { id: crypto.randomUUID(), name: 'Olga', email: 'olga@ejemplo.com', role: 'miembro', active: true };
const ines = { id: crypto.randomUUID(), name: 'Inés', email: 'ines@ejemplo.com', role: 'miembro', active: false };
const omar = { id: crypto.randomUUID(), name: 'Omar', email: 'omar@ejemplo.com', role: 'observador', active: true };
const adri = { id: crypto.randomUUID(), name: 'Adri', email: 'adri@ejemplo.com', role: 'admin', active: true };
const ajeno = { id: crypto.randomUUID(), name: 'Ajeno', email: 'ajeno@ejemplo.com', role: 'miembro', active: true };
const hitoBeta = { id: crypto.randomUUID(), name: 'Beta' };

function space(overrides: Row = {}) {
  return { id: spaceId, ownerId, leaderId: lider.id, status: 'activo', ...overrides };
}

function request(body: unknown, headers: Record<string, string> = {}, id = spaceId) {
  return [
    new NextRequest(`http://localhost/api/spaces/${id}/import-csv`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', ...headers },
    }),
    { params: Promise.resolve({ id }) },
  ] as const;
}

function csvWith(n: number, responsible = 'ana@ejemplo.com') {
  const lines = ['titulo,responsable,fecha_limite,hito'];
  for (let i = 1; i <= n; i++) lines.push(`Tarea ${i},${responsible},15/03/2026,Beta`);
  return lines.join('\n');
}

function httpError(message: string, httpStatus: number) {
  return Object.assign(new Error(message), { httpStatus });
}

function insertsInto(table: unknown) {
  return mocks.calls.insert.filter(c => c.table === table);
}

function dbCallCount() {
  return mocks.calls.select.length + mocks.calls.insert.length;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.calls.select.length = 0;
  mocks.calls.insert.length = 0;
  mocks.state.persons = [ana, beto, lider, olga, ines, omar, adri, ajeno];
  mocks.state.members = [
    { personId: ana.id, spaceRole: 'colaborador' },
    { personId: beto.id, spaceRole: 'colaborador' },
    { personId: lider.id, spaceRole: 'dueño' },
    { personId: olga.id, spaceRole: 'observador' },
    { personId: ines.id, spaceRole: 'colaborador' },
    { personId: omar.id, spaceRole: 'colaborador' },
  ];
  mocks.state.milestones = [{ ...hitoBeta }];
  mocks.requireSession.mockResolvedValue({ id: userId, role: 'miembro' });
  mocks.requireProjectAccess.mockResolvedValue(space());
  mocks.checkRateLimit.mockResolvedValue({ allowed: true });
  mocks.recordFailure.mockResolvedValue(undefined);
  vi.spyOn(logger, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/spaces/[id]/import-csv: permisos y entrada', () => {
  it('un observador recibe 403 sin tocar la BD', async () => {
    mocks.requireSession.mockResolvedValue({ id: userId, role: 'observador' });
    const res = await POST(...request({ csv: csvWith(1), dryRun: true }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('Sin permisos para crear tareas');
    expect(mocks.requireProjectAccess).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('sin sesión responde 401', async () => {
    mocks.requireSession.mockRejectedValue(new Error('UNAUTHORIZED'));
    const res = await POST(...request({ csv: csvWith(1), dryRun: true }));
    expect(res.status).toBe(401);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('un id mal formado da 400 sin BD ni logger.error', async () => {
    const res = await POST(...request({ csv: csvWith(1), dryRun: true }, {}, 'no-es-uuid'));
    expect(res.status).toBe(400);
    expect(mocks.requireProjectAccess).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it.each([
    ['Proyecto no encontrado', 404],
    ['Sin acceso a este proyecto', 403],
    ['Sin permisos de escritura en este proyecto', 403],
    ['El proyecto está cerrado', 409],
  ])('propaga el rechazo de requireProjectAccess (%s)', async (message, status) => {
    mocks.requireProjectAccess.mockRejectedValue(httpError(message, status));
    const res = await POST(...request({ csv: csvWith(1), dryRun: true }));
    expect(res.status).toBe(status);
    expect((await res.json()).error).toBe(message);
    expect(mocks.requireProjectAccess).toHaveBeenCalledWith(expect.objectContaining({ id: userId }), spaceId, 'write');
    expect(mocks.select).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('un proyecto en borrador da 409', async () => {
    mocks.requireProjectAccess.mockResolvedValue(space({ status: 'borrador' }));
    const res = await POST(...request({ csv: csvWith(1), dryRun: true }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('Sólo se puede importar en un proyecto activo');
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('un Content-Length excesivo da 400 antes de leer el cuerpo', async () => {
    const res = await POST(...request(
      { csv: csvWith(1), dryRun: true },
      { 'content-length': String(IMPORT_CSV_MAX_BODY_BYTES + 1) },
    ));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('tamaño máximo');
    expect(mocks.requireProjectAccess).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it.each([
    [{ csv: '', dryRun: true }],
    [{ csv: 'titulo\nUno' }],
    [{ csv: 'titulo\nUno', dryRun: 'sí' }],
    [{ csv: 'titulo\nUno', dryRun: true, defaultResponsibleId: 'x' }],
  ])('un cuerpo inválido da 400 sin logger.error (%j)', async body => {
    const res = await POST(...request(body));
    expect(res.status).toBe(400);
    expect(mocks.requireProjectAccess).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });
});

describe('POST /api/spaces/[id]/import-csv: vista previa y todo o nada', () => {
  it('dryRun devuelve la vista previa sin escribir ni contar en el rate limit', async () => {
    const res = await POST(...request({ csv: csvWith(2), dryRun: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.errors).toEqual([]);
    expect(body.warnings).toEqual([]);
    expect(body.total).toBe(2);
    expect(body.rows).toHaveLength(2);
    expect(body.rows[0]).toMatchObject({
      line: 2,
      title: 'Tarea 1',
      responsible: { id: ana.id, name: 'Ana', email: 'ana@ejemplo.com' },
      reviewer: { id: lider.id, name: 'Lía' },
      dueDate: '2026-03-15',
      priority: 'normal',
      kind: 'feature',
      milestone: { id: hitoBeta.id, name: 'Beta' },
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.recordFailure).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('dryRun con errores responde 200 con la lista', async () => {
    const res = await POST(...request({ csv: 'titulo,responsable\nUno,zoe@x.com\n', dryRun: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.errors).toEqual([{ line: 2, column: 'responsable', message: 'zoe@x.com no es miembro del proyecto con permiso de escritura' }]);
    expect(body.rows).toEqual([]);
  });

  it('con un error no importa nada y responde 400 con la lista', async () => {
    const csv = 'titulo,responsable\nUno,ana@ejemplo.com\nDos,zoe@x.com\nTres,beto@ejemplo.com\n';
    const res = await POST(...request({ csv, dryRun: false }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('El CSV tiene 1 error; no se importó ninguna tarea');
    expect(body.errors).toEqual([expect.objectContaining({ line: 3, column: 'responsable' })]);
    expect(body.total).toBe(3);
    expect(body.warnings).toEqual([]);
    expect(insertsInto(tasks)).toEqual([]);
    expect(insertsInto(auditLog)).toEqual([]);
    expect(mocks.recordFailure).not.toHaveBeenCalled();
  });

  it('concuerda el plural del número de errores', async () => {
    const csv = 'titulo,responsable\n,ana@ejemplo.com\nDos,zoe@x.com\n';
    const res = await POST(...request({ csv, dryRun: false }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('El CSV tiene 2 errores; no se importó ninguna tarea');
  });

  it('sólo admite personas activas con permiso de escritura en el proyecto', async () => {
    const csv = [
      'titulo,responsable,revisor',
      'Observadora del proyecto,olga@ejemplo.com,',
      'Inactiva,ines@ejemplo.com,',
      'Observador global,omar@ejemplo.com,',
      'Sin acceso,ajeno@ejemplo.com,',
      'Admin no miembro,adri@ejemplo.com,BETO@ejemplo.com',
    ].join('\n');
    const res = await POST(...request({ csv, dryRun: true }));
    const body = await res.json();
    expect(body.errors.map((e: Row) => [e.line, e.column])).toEqual([
      [2, 'responsable'], [3, 'responsable'], [4, 'responsable'], [5, 'responsable'],
    ]);
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]).toMatchObject({ responsible: { id: adri.id }, reviewer: { id: beto.id } });
  });

  it('el dueño del proyecto es elegible aunque no figure en space_members', async () => {
    const owner = { id: ownerId, name: 'Dueña', email: 'duena@ejemplo.com', role: 'miembro', active: true };
    mocks.state.persons = [...mocks.state.persons, owner];
    const res = await POST(...request({ csv: 'titulo,responsable\nUno,duena@ejemplo.com\n', dryRun: true }));
    const body = await res.json();
    expect(body.errors).toEqual([]);
    expect(body.rows[0].responsible.id).toBe(ownerId);
  });

  it('usa el responsable por defecto elegible', async () => {
    const res = await POST(...request({ csv: 'titulo\nUno\n', dryRun: true, defaultResponsibleId: beto.id }));
    const body = await res.json();
    expect(body.errors).toEqual([]);
    expect(body.rows[0].responsible).toEqual({ id: beto.id, name: 'Beto', email: 'Beto@Ejemplo.com' });
  });

  it('un responsable por defecto no elegible da error en la columna responsable', async () => {
    const res = await POST(...request({ csv: 'titulo,responsable\nUno,ana@ejemplo.com\n', dryRun: true, defaultResponsibleId: olga.id }));
    const body = await res.json();
    expect(body.errors).toEqual([expect.objectContaining({ line: null, column: 'responsable' })]);
  });

  it('si el líder no es elegible, el revisor por defecto queda vacío con un aviso', async () => {
    mocks.state.members = mocks.state.members.map(m => m.personId === lider.id ? { ...m, spaceRole: 'observador' } : m);
    const res = await POST(...request({ csv: csvWith(1), dryRun: true }));
    const body = await res.json();
    expect(body.errors).toEqual([]);
    expect(body.rows[0].reviewer).toBeNull();
    expect(body.warnings).toHaveLength(1);
  });
});

describe('POST /api/spaces/[id]/import-csv: importación', () => {
  it('importa 200 tareas en una sola transacción con inserciones por lotes', async () => {
    const res = await POST(...request({ csv: csvWith(200), dryRun: false }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ imported: 200 });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);

    const taskInserts = insertsInto(tasks);
    expect(taskInserts).toHaveLength(1);
    const values = taskInserts[0].values as Row[];
    expect(values).toHaveLength(200);
    for (const v of values) {
      expect(v.status === undefined || v.status === 'no_iniciada').toBe(true);
      expect(v).toMatchObject({
        spaceId,
        creatorId: userId,
        responsibleId: ana.id,
        reviewerId: lider.id,
        milestoneId: hitoBeta.id,
        dueDate: '2026-03-15',
        dueDateOriginal: '2026-03-15',
        priority: 'normal',
        kind: 'feature',
      });
    }
    expect(values[0].title).toBe('Tarea 1');

    const auditInserts = insertsInto(auditLog);
    expect(auditInserts).toHaveLength(2);
    const created = auditInserts[0].values as Row[];
    expect(created).toHaveLength(200);
    for (const a of created) {
      expect(a).toMatchObject({ action: 'task_created', actorId: userId, spaceId });
      expect(typeof a.taskId).toBe('string');
      expect(String(a.newValue)).toMatch(/^Tarea \d+$/);
    }
    expect(auditInserts[1].values).toMatchObject({
      action: 'tasks_imported',
      actorId: userId,
      spaceId,
      newValue: '200 tareas importadas desde CSV',
    });

    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.buildAssignmentNotifications).not.toHaveBeenCalled();
  });

  it('con una fila concuerda el singular', async () => {
    const res = await POST(...request({ csv: csvWith(1), dryRun: false }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ imported: 1 });
    expect(insertsInto(auditLog)[1].values).toMatchObject({ newValue: '1 tarea importada desde CSV' });
  });

  it('cuenta la importación en el rate limit después de la transacción', async () => {
    const res = await POST(...request({ csv: csvWith(1), dryRun: false }));
    expect(res.status).toBe(201);
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(`import-csv:${userId}`, IMPORT_CSV_MAX_PER_WINDOW);
    expect(mocks.recordFailure).toHaveBeenCalledWith(`import-csv:${userId}`);
    expect(mocks.recordFailure.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.transaction.mock.invocationCallOrder[0]);
  });

  it('las búsquedas y escrituras son de coste constante (1 fila = 200 filas)', async () => {
    await POST(...request({ csv: csvWith(1), dryRun: false }));
    const withOne = dbCallCount();
    mocks.calls.select.length = 0;
    mocks.calls.insert.length = 0;
    await POST(...request({ csv: csvWith(200), dryRun: false }));
    const withTwoHundred = dbCallCount();
    expect(withOne).toBe(withTwoHundred);
    expect(withOne).toBeLessThanOrEqual(6);
  });

  it('la vista previa también es de coste constante', async () => {
    await POST(...request({ csv: csvWith(1), dryRun: true }));
    const withOne = mocks.calls.select.length;
    mocks.calls.select.length = 0;
    await POST(...request({ csv: csvWith(200, 'beto@ejemplo.com'), dryRun: true }));
    expect(mocks.calls.select.length).toBe(withOne);
  });

  it('con el rate limit superado responde 429 sin transacción', async () => {
    mocks.checkRateLimit.mockResolvedValue({ allowed: false, retryAfterMs: 5 * 60 * 1000 });
    const res = await POST(...request({ csv: csvWith(1), dryRun: false }));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toContain('5 minutos');
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.recordFailure).not.toHaveBeenCalled();
  });

  it('la vista previa no consulta el rate limit', async () => {
    mocks.checkRateLimit.mockResolvedValue({ allowed: false, retryAfterMs: 60_000 });
    const res = await POST(...request({ csv: csvWith(1), dryRun: true }));
    expect(res.status).toBe(200);
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
  });
});

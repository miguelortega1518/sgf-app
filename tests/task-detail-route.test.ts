import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  requireTaskAccess: vi.fn(),
  select: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  requireSession: mocks.requireSession,
}));
vi.mock('@/lib/db', () => ({
  db: { select: mocks.select },
}));
vi.mock('@/lib/project-access', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/project-access')>()),
  requireTaskAccess: mocks.requireTaskAccess,
}));
vi.mock('@/lib/db/schema', () => ({
  tasks: { id: 'tasks.id', title: 'tasks.title', status: 'tasks.status' },
  spaces: { id: 'spaces.id', name: 'spaces.name' },
  evidence: { taskId: 'evidence.taskId' },
  subtasks: { taskId: 'subtasks.taskId' },
  comments: { id: 'comments.id', content: 'comments.content', createdAt: 'comments.createdAt', editedAt: 'comments.editedAt', authorId: 'comments.authorId', taskId: 'comments.taskId' },
  persons: { id: 'persons.id', name: 'persons.name', email: 'persons.email' },
  auditLog: { id: 'auditLog.id', action: 'auditLog.action', previousValue: 'auditLog.previousValue', newValue: 'auditLog.newValue', reason: 'auditLog.reason', timestamp: 'auditLog.timestamp', actorId: 'auditLog.actorId', taskId: 'auditLog.taskId' },
  taskDependencies: { taskId: 'taskDependencies.taskId', predecessorId: 'taskDependencies.predecessorId' },
  githubPullRequests: { taskId: 'githubPullRequests.taskId', openedAt: 'githubPullRequests.openedAt' },
}));
vi.mock('drizzle-orm', () => ({
  eq: (left: unknown, right: unknown) => ({ operator: 'eq', left, right }),
  desc: (column: unknown) => ({ operator: 'desc', column }),
}));

import { GET } from '../src/app/api/tasks/[id]/route';

const taskId = crypto.randomUUID();
const userId = crypto.randomUUID();

function ctx() {
  return { params: Promise.resolve({ id: taskId }) };
}

function getRequest() {
  return new NextRequest(`http://localhost/api/tasks/${taskId}`, { method: 'GET' });
}

const auditRows = [
  { id: 'a1', action: 'comment_deleted', previousValue: 'texto borrado', newValue: null, reason: null, timestamp: '2026-11-12T10:00:00.000Z', actorName: 'Ana' },
  { id: 'a2', action: 'comment_deleted', previousValue: 'texto moderado', newValue: null, reason: 'Moderado por admin', timestamp: '2026-11-12T09:00:00.000Z', actorName: 'Admin' },
  { id: 'a3', action: 'comment_edited', previousValue: 'antes mod', newValue: 'después mod', reason: 'Moderado por admin', timestamp: '2026-11-12T08:00:00.000Z', actorName: 'Admin' },
  { id: 'a4', action: 'comment_edited', previousValue: 'antes autor', newValue: 'después autor', reason: null, timestamp: '2026-11-12T07:00:00.000Z', actorName: 'Ana' },
  { id: 'a5', action: 'status_changed', previousValue: 'en_proceso', newValue: 'completada', reason: null, timestamp: '2026-11-12T06:00:00.000Z', actorName: 'Ana' },
];

// Builder encadenable y thenable: cada db.select() toma el siguiente resultado de la cola.
// IMPORTANTE: la cola sigue el orden de las 9 consultas del GET de src/app/api/tasks/[id]/route.ts:
// responsable, proyecto, subtareas, evidencia, comentarios, auditoría, predecesoras, sucesoras, PR.
// Si ese orden cambia, hay que actualizar la cola.
let fromCalls: unknown[];
let orderByCalls: unknown[];
let limitCalls: unknown[];

function queueResults(results: unknown[][]) {
  const queue = [...results];
  fromCalls = [];
  orderByCalls = [];
  limitCalls = [];
  mocks.select.mockImplementation(() => {
    const result = queue.shift() ?? [];
    const builder: Record<string, unknown> = {};
    for (const method of ['where', 'innerJoin']) {
      builder[method] = () => builder;
    }
    builder.from = (table: unknown) => { fromCalls.push(table); return builder; };
    builder.orderBy = (order: unknown) => { orderByCalls.push(order); return builder; };
    builder.limit = (n: unknown) => { limitCalls.push(n); return builder; };
    builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject);
    return builder;
  });
}

function setupDb() {
  queueResults([
    [{ name: 'Ana', email: 'ana@example.com' }],
    [{ name: 'Proyecto' }],
    [],
    [],
    [],
    structuredClone(auditRows),
    [],
    [],
    [],
  ]);
}

async function getAudit(role: string) {
  mocks.requireSession.mockResolvedValue({ id: userId, role });
  const response = await GET(getRequest(), ctx());
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(mocks.select).toHaveBeenCalledTimes(9);
  return body.audit as Array<Record<string, unknown>>;
}

describe('GET /api/tasks/[id]: redacción de la auditoría de comentarios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireTaskAccess.mockResolvedValue({
      id: taskId,
      spaceId: crypto.randomUUID(),
      responsibleId: userId,
      status: 'en_proceso',
      dueDateOriginal: null,
    });
    setupDb();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(['miembro', 'observador'])('%s recibe sin texto los comentarios borrados y moderados', async (role) => {
    const audit = await getAudit(role);
    expect(audit.map((e) => e.id)).toEqual(['a1', 'a2', 'a3', 'a4', 'a5']);
    for (const entry of audit.slice(0, 3)) {
      expect(entry.previousValue).toBeNull();
      expect(entry.newValue).toBeNull();
      expect(entry.redacted).toBe(true);
    }
    expect(audit[1].reason).toBe('Moderado por admin');
    expect(audit[2].reason).toBe('Moderado por admin');
    expect(audit[3]).toEqual({ ...auditRows[3], redacted: false });
    expect(audit[4]).toEqual({ ...auditRows[4], redacted: false });
    expect(JSON.stringify(audit)).not.toContain('texto borrado');
    expect(JSON.stringify(audit)).not.toContain('texto moderado');
    expect(JSON.stringify(audit)).not.toContain('antes mod');
  });

  it('admin recibe el texto completo', async () => {
    const audit = await getAudit('admin');
    expect(audit).toEqual(auditRows.map((e) => ({ ...e, redacted: false })));
  });
});

const chainedAuditRows = [
  { id: 'b1', action: 'comment_deleted', previousValue: 'secreto final', newValue: null, reason: null, timestamp: '2026-11-12T10:00:00.000Z', actorName: 'Ana' },
  { id: 'b2', action: 'comment_edited', previousValue: 'secreto inicial', newValue: 'secreto final', reason: null, timestamp: '2026-11-12T09:00:00.000Z', actorName: 'Ana' },
  { id: 'b3', action: 'comment_edited', previousValue: 'vivo antes', newValue: 'vivo después', reason: null, timestamp: '2026-11-12T08:00:00.000Z', actorName: 'Luis' },
];

describe('GET /api/tasks/[id]: redacción de ediciones del autor de comentarios luego borrados', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireTaskAccess.mockResolvedValue({
      id: taskId,
      spaceId: crypto.randomUUID(),
      responsibleId: userId,
      status: 'en_proceso',
      dueDateOriginal: null,
    });
    // Mismo orden de las 9 consultas del GET que setupDb().
    queueResults([
      [{ name: 'Ana', email: 'ana@example.com' }],
      [{ name: 'Proyecto' }],
      [],
      [],
      [],
      structuredClone(chainedAuditRows),
      [],
      [],
      [],
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(['miembro', 'observador'])('%s no ve el texto de las ediciones previas al borrado', async (role) => {
    const audit = await getAudit(role);
    expect(audit.map((e) => e.id)).toEqual(['b1', 'b2', 'b3']);
    for (const entry of audit.slice(0, 2)) {
      expect(entry.previousValue).toBeNull();
      expect(entry.newValue).toBeNull();
      expect(entry.redacted).toBe(true);
    }
    expect(audit[2]).toEqual({ ...chainedAuditRows[2], redacted: false });
    expect(JSON.stringify(audit)).not.toContain('secreto');
  });

  it('admin recibe toda la cadena intacta', async () => {
    const audit = await getAudit('admin');
    expect(audit).toEqual(chainedAuditRows.map((e) => ({ ...e, redacted: false })));
  });
});

describe('GET /api/tasks/[id]: panel del pull request', () => {
  const prRow = {
    url: 'https://github.com/forja/app/pull/7',
    taskId,
    number: 7,
    title: 'Filtros guardados',
    state: 'abierto',
    headSha: 'abc',
    authorLogin: 'ana',
    openedAt: new Date('2026-11-15T12:00:00.000Z'),
    readyAt: null,
    mergedAt: null,
    closedAt: null,
    firstReviewAt: new Date('2026-11-15T14:15:00.000Z'),
    reviewers: [{ login: 'luis', state: 'aprobado', submittedAt: '2026-11-15T14:15:00.000Z' }],
    checks: {
      sha: 'abc', total: 2, success: 1, failure: 1, pending: 0, updatedAt: '2026-11-15T15:00:00.000Z',
      runs: { lint: { id: 1, suiteId: 9, state: 'success' }, test: { id: 2, suiteId: 9, state: 'failure' } },
      suites: { 9: 'failure' },
    },
    updatedAt: new Date('2026-11-15T15:00:00.000Z'),
  };

  function queueWithPr(rows: unknown[]) {
    queueResults([
      [{ name: 'Ana', email: 'ana@example.com' }],
      [{ name: 'Proyecto' }],
      [],
      [],
      [],
      [],
      [],
      [],
      rows,
    ]);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue({ id: userId, role: 'miembro' });
    mocks.requireTaskAccess.mockResolvedValue({
      id: taskId,
      spaceId: crypto.randomUUID(),
      responsibleId: userId,
      status: 'en_proceso',
      dueDateOriginal: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('devuelve el PR más reciente con revisores { login, state } y checks sin mapas internos', async () => {
    queueWithPr([structuredClone(prRow)]);
    const response = await GET(getRequest(), ctx());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(mocks.requireTaskAccess).toHaveBeenCalledWith(expect.objectContaining({ id: userId }), taskId, 'read');
    expect(mocks.select).toHaveBeenCalledTimes(9);
    expect(fromCalls[8]).toEqual({ taskId: 'githubPullRequests.taskId', openedAt: 'githubPullRequests.openedAt' });
    expect(orderByCalls).toContainEqual({ operator: 'desc', column: 'githubPullRequests.openedAt' });
    expect(limitCalls).toContain(1);
    expect(body.pullRequest).toEqual({
      url: 'https://github.com/forja/app/pull/7',
      number: 7,
      title: 'Filtros guardados',
      state: 'abierto',
      authorLogin: 'ana',
      openedAt: '2026-11-15T12:00:00.000Z',
      readyAt: null,
      mergedAt: null,
      closedAt: null,
      firstReviewAt: '2026-11-15T14:15:00.000Z',
      reviewers: [{ login: 'luis', state: 'aprobado' }],
      checks: { sha: 'abc', total: 2, success: 1, failure: 1, pending: 0, updatedAt: '2026-11-15T15:00:00.000Z' },
    });
    expect(JSON.stringify(body.pullRequest)).not.toContain('runs');
    expect(JSON.stringify(body.pullRequest)).not.toContain('suites');
  });

  it('sin PR → pullRequest: null', async () => {
    queueWithPr([]);
    const response = await GET(getRequest(), ctx());
    expect(response.status).toBe(200);
    expect((await response.json()).pullRequest).toBeNull();
  });
});

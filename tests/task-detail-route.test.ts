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
// IMPORTANTE: la cola sigue el orden de las 8 consultas del GET de src/app/api/tasks/[id]/route.ts:
// responsable, proyecto, subtareas, evidencia, comentarios, auditoría, predecesoras, sucesoras.
// Si ese orden cambia, hay que actualizar la cola.
function queueResults(results: unknown[][]) {
  const queue = [...results];
  mocks.select.mockImplementation(() => {
    const result = queue.shift() ?? [];
    const builder: Record<string, unknown> = {};
    for (const method of ['from', 'where', 'limit', 'innerJoin', 'orderBy']) {
      builder[method] = () => builder;
    }
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
  ]);
}

async function getAudit(role: string) {
  mocks.requireSession.mockResolvedValue({ id: userId, role });
  const response = await GET(getRequest(), ctx());
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(mocks.select).toHaveBeenCalledTimes(8);
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

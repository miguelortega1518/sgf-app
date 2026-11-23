import { createHash } from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Query = { projection: Record<string, unknown> | undefined; table: string; where: unknown };

const mocks = vi.hoisted(() => {
  const state = {
    queries: [] as Query[],
    results: {} as Record<string, unknown[]>,
  };
  const select = vi.fn((projection?: Record<string, unknown>) => {
    const query: Query = { projection, table: '', where: undefined };
    const builder: Record<string, unknown> = {};
    builder.from = (table: { __name: string }) => { query.table = table.__name; state.queries.push(query); return builder; };
    builder.where = (cond: unknown) => { query.where = cond; return builder; };
    builder.limit = () => builder;
    builder.orderBy = () => builder;
    builder.innerJoin = () => { throw new Error('join no permitido'); };
    builder.leftJoin = () => { throw new Error('join no permitido'); };
    builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(state.results[query.table] ?? []).then(resolve, reject);
    return builder;
  });
  return {
    state,
    select,
    checkRateLimit: vi.fn(),
    recordFailure: vi.fn(),
  };
});

function table(name: string, columns: string[]) {
  return Object.fromEntries([['__name', name], ...columns.map(c => [c, `${name}.${c}`])]);
}

vi.mock('@/lib/db', () => ({ db: { select: mocks.select } }));
vi.mock('@/lib/db/schema', () => ({
  spaceShareLinks: table('space_share_links', ['spaceId', 'tokenHash', 'createdBy', 'createdAt', 'revokedAt']),
  spaces: table('spaces', ['id', 'name', 'objective', 'declaredHealth', 'status', 'ownerId']),
  milestones: table('milestones', ['id', 'spaceId', 'name', 'targetDate', 'completed', 'order', 'createdAt']),
  tasks: table('tasks', [
    'id', 'spaceId', 'title', 'status', 'dueDate', 'blockedByArea', 'blockedByAreaText', 'milestoneId', 'sprintId',
    'completedAt', 'createdAt', 'archived', 'responsibleId', 'number', 'prUrl', 'description',
  ]),
  sprints: table('sprints', ['id', 'spaceId', 'status', 'startDate', 'endDate', 'name']),
  persons: table('persons', ['id', 'name', 'email']),
  comments: table('comments', ['id', 'content']),
  spaceUpdates: table('space_updates', ['id', 'content']),
}));
vi.mock('drizzle-orm', () => ({
  and: (...conditions: unknown[]) => ({ op: 'and', conditions }),
  eq: (left: unknown, right: unknown) => ({ op: 'eq', left, right }),
  isNull: (col: unknown) => ({ op: 'isNull', col }),
  asc: (col: unknown) => ({ op: 'asc', col }),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
  recordFailure: mocks.recordFailure,
  formatWait: () => 'x',
}));

import { loadSharedProject, SHARE_VIEW_MAX_PER_WINDOW } from '../src/lib/shared-project';

const TOKEN = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123-_6';
const TOKEN_HASH = createHash('sha256').update(TOKEN).digest('hex');
const spaceId = crypto.randomUUID();

function flatten(cond: unknown): { op: string; left?: unknown; right?: unknown; col?: unknown }[] {
  if (!cond || typeof cond !== 'object') return [];
  const c = cond as { op: string; conditions?: unknown[] };
  if (c.op === 'and') return (c.conditions ?? []).flatMap(flatten);
  return [c as { op: string }];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.queries = [];
  mocks.state.results = {
    space_share_links: [{ spaceId }],
    spaces: [{ name: 'Portal', objective: 'Facturas en línea', declaredHealth: 'verde', status: 'activo' }],
    milestones: [{ id: 'm1', name: 'Piloto', targetDate: '2026-12-01', completed: false, order: 1, createdAt: new Date('2026-10-01') }],
    tasks: [
      {
        id: 't1', title: 'Orden de compra', status: 'bloqueada', dueDate: null, blockedByArea: 'compras',
        milestoneId: 'm1', sprintId: null, completedAt: null, createdAt: new Date('2026-10-02'), archived: false,
      },
    ],
    sprints: [],
  };
  mocks.checkRateLimit.mockResolvedValue({ allowed: true });
  mocks.recordFailure.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('loadSharedProject: rate limit', () => {
  it('cupo agotado → rate_limited sin consultar enlaces ni contar la visita', async () => {
    mocks.checkRateLimit.mockResolvedValue({ allowed: false, retryAfterMs: 90_000 });

    const result = await loadSharedProject(TOKEN, '1.2.3.4');

    expect(result).toEqual({ kind: 'rate_limited', retryAfterMs: 90_000 });
    expect(mocks.checkRateLimit).toHaveBeenCalledWith('share-view:ip:1.2.3.4', SHARE_VIEW_MAX_PER_WINDOW);
    expect(SHARE_VIEW_MAX_PER_WINDOW).toBe(60);
    expect(mocks.recordFailure).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('permitido → cuenta la visita con recordFailure sobre la clave de la IP', async () => {
    await loadSharedProject(TOKEN, '1.2.3.4');
    expect(mocks.recordFailure).toHaveBeenCalledWith('share-view:ip:1.2.3.4');
  });
});

describe('loadSharedProject: token', () => {
  it('token mal formado → not_found sin consultar la BD', async () => {
    for (const bad of ['', 'corto', `${TOKEN}x`, `${TOKEN.slice(0, 42)}/`]) {
      expect(await loadSharedProject(bad, '1.2.3.4')).toEqual({ kind: 'not_found' });
    }
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('busca por el SHA-256 del token, nunca por el token en claro, y sólo enlaces sin revocar', async () => {
    await loadSharedProject(TOKEN, '1.2.3.4');

    const linkQuery = mocks.state.queries.find(q => q.table === 'space_share_links')!;
    expect(linkQuery).toBeDefined();
    const conds = flatten(linkQuery.where);
    expect(conds).toContainEqual({ op: 'eq', left: 'space_share_links.tokenHash', right: TOKEN_HASH });
    expect(conds).toContainEqual({ op: 'isNull', col: 'space_share_links.revokedAt' });
    expect(JSON.stringify(mocks.state.queries)).not.toContain(TOKEN);
  });

  it('token bien formado sin fila (inexistente o revocado) → not_found idéntico', async () => {
    const malformed = await loadSharedProject('x', '1.2.3.4');
    mocks.state.results.space_share_links = [];
    const missing = await loadSharedProject(TOKEN, '1.2.3.4');
    expect(missing).toEqual({ kind: 'not_found' });
    expect(missing).toEqual(malformed);
    expect(mocks.state.queries.map(q => q.table)).toEqual(['space_share_links']);
  });
});

describe('loadSharedProject: vista', () => {
  it('token válido → ok con la vista pública', async () => {
    const result = await loadSharedProject(TOKEN, '1.2.3.4');

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.view.name).toBe('Portal');
    expect(result.view.health.label).toBe('En buen estado');
    expect(result.view.risks).toEqual([{ title: 'Orden de compra', reasons: ['Bloqueado por Compras'] }]);
    expect(result.view.milestones[0]).toMatchObject({ name: 'Piloto', taskCount: 1, openTasks: 1 });
  });

  it('proyecta sólo las columnas necesarias y nunca consulta personas, comentarios ni actualizaciones', async () => {
    await loadSharedProject(TOKEN, '1.2.3.4');

    const tables = mocks.state.queries.map(q => q.table);
    expect(tables).not.toContain('persons');
    expect(tables).not.toContain('comments');
    expect(tables).not.toContain('space_updates');

    const byTable = Object.fromEntries(mocks.state.queries.map(q => [q.table, q]));
    for (const q of mocks.state.queries) expect(q.projection, `${q.table} sin proyección`).toBeDefined();
    expect(Object.keys(byTable.spaces.projection!).sort()).toEqual(['declaredHealth', 'name', 'objective', 'status']);
    expect(Object.keys(byTable.milestones.projection!).sort()).toEqual(
      ['completed', 'createdAt', 'id', 'name', 'order', 'targetDate'],
    );
    expect(Object.keys(byTable.tasks.projection!).sort()).toEqual([
      'archived', 'blockedByArea', 'completedAt', 'createdAt', 'dueDate', 'id', 'milestoneId', 'sprintId', 'status', 'title',
    ]);
    expect(Object.keys(byTable.sprints.projection!).sort()).toEqual(['endDate', 'id', 'startDate', 'status']);
  });

  it('filtra cada consulta por el proyecto del enlace', async () => {
    await loadSharedProject(TOKEN, '1.2.3.4');
    for (const name of ['spaces', 'milestones', 'tasks', 'sprints']) {
      const q = mocks.state.queries.find(x => x.table === name)!;
      expect(flatten(q.where).some(c => c.op === 'eq' && c.right === spaceId), name).toBe(true);
    }
  });

  it('proyecto inexistente tras el enlace → not_found', async () => {
    mocks.state.results.spaces = [];
    expect(await loadSharedProject(TOKEN, '1.2.3.4')).toEqual({ kind: 'not_found' });
  });
});

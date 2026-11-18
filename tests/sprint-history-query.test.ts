import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: { select: mocks.select },
}));
vi.mock('@/lib/db/schema', () => ({
  auditLog: {
    taskId: 'auditLog.taskId',
    spaceId: 'auditLog.spaceId',
    action: 'auditLog.action',
    previousValue: 'auditLog.previousValue',
    newValue: 'auditLog.newValue',
    reason: 'auditLog.reason',
    timestamp: 'auditLog.timestamp',
  },
}));
vi.mock('drizzle-orm', () => ({
  and: (...conditions: unknown[]) => ({ operator: 'and', conditions }),
  eq: (left: unknown, right: unknown) => ({ operator: 'eq', left, right }),
  asc: (column: unknown) => ({ operator: 'asc', column }),
  inArray: (left: unknown, values: unknown[]) => ({ operator: 'inArray', left, values }),
}));

import { loadSprintChangeEvents } from '../src/lib/sprint-history-query';
import { loadStatusEvents } from '../src/lib/status-history-query';

type Condition = { operator: string; left?: unknown; right?: unknown; values?: unknown[]; conditions?: Condition[] };

function executor() {
  const ex = { select: vi.fn(), from: vi.fn(), where: vi.fn(), orderBy: vi.fn() };
  ex.select.mockReturnValue({ from: ex.from });
  ex.from.mockReturnValue({ where: ex.where });
  ex.where.mockReturnValue({ orderBy: ex.orderBy });
  ex.orderBy.mockResolvedValue([]);
  return ex;
}

const spaceId = crypto.randomUUID();

describe('loadSprintChangeEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.select.mockReturnValue({ from: mocks.from });
    mocks.from.mockReturnValue({ where: mocks.where });
    mocks.where.mockReturnValue({ orderBy: mocks.orderBy });
  });

  it('con una lista vacía no consulta', async () => {
    const ex = executor();
    const r = await loadSprintChangeEvents([], spaceId, ex as never);
    expect(r.size).toBe(0);
    expect(ex.select).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('una sola consulta filtrada por acción, proyecto y tareas; agrupa por taskId', async () => {
    const t1 = new Date('2026-11-01T12:00:00Z');
    const t2 = new Date('2026-11-02T12:00:00Z');
    mocks.orderBy.mockResolvedValue([
      { taskId: 'a', previousValue: 'Backlog', newValue: 'Sprint 3', reason: '{"from":null,"to":"x"}', at: t1 },
      { taskId: 'a', previousValue: 'Sprint 3', newValue: 'Backlog', reason: null, at: t2 },
      { taskId: 'c', previousValue: 'Backlog', newValue: 'Sprint 3', reason: null, at: t1 },
      { taskId: null, previousValue: 'x', newValue: 'y', reason: null, at: t1 },
    ]);

    const r = await loadSprintChangeEvents(['a', 'b', 'c'], spaceId);

    expect(mocks.select).toHaveBeenCalledTimes(1);
    const where = mocks.where.mock.calls[0][0] as Condition;
    expect(where.operator).toBe('and');
    expect(where.conditions).toContainEqual({ operator: 'eq', left: 'auditLog.action', right: 'task_sprint_changed' });
    expect(where.conditions).toContainEqual({ operator: 'eq', left: 'auditLog.spaceId', right: spaceId });
    expect(where.conditions).toContainEqual({ operator: 'inArray', left: 'auditLog.taskId', values: ['a', 'b', 'c'] });
    expect(mocks.orderBy).toHaveBeenCalledWith(
      { operator: 'asc', column: 'auditLog.taskId' },
      { operator: 'asc', column: 'auditLog.timestamp' },
    );
    expect([...r.keys()]).toEqual(['a', 'c']);
    expect(r.get('a')).toEqual([
      { taskId: 'a', previousValue: 'Backlog', newValue: 'Sprint 3', reason: '{"from":null,"to":"x"}', at: t1 },
      { taskId: 'a', previousValue: 'Sprint 3', newValue: 'Backlog', reason: null, at: t2 },
    ]);
  });

  it('usa el executor recibido (p. ej. el tx) y no el db global', async () => {
    const ex = executor();
    await loadSprintChangeEvents(['a'], spaceId, ex as never);
    expect(ex.select).toHaveBeenCalledTimes(1);
    expect(mocks.select).not.toHaveBeenCalled();
  });
});

describe('loadStatusEvents con executor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('usa el executor recibido y no el db global', async () => {
    const ex = executor();
    await loadStatusEvents(['a'], ex as never);
    expect(ex.select).toHaveBeenCalledTimes(1);
    expect(mocks.select).not.toHaveBeenCalled();
  });
});

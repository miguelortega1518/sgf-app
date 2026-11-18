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
}));

import { loadSprintEvents } from '../src/lib/sprint-history-query';

type Condition = { operator: string; left?: unknown; right?: unknown; conditions?: Condition[] };

describe('loadSprintEvents', () => {
  const spaceId = crypto.randomUUID();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.select.mockReturnValue({ from: mocks.from });
    mocks.from.mockReturnValue({ where: mocks.where });
    mocks.where.mockReturnValue({ orderBy: mocks.orderBy });
  });

  it('hace una sola consulta por acción y proyecto, agrupa por taskId e ignora filas sin taskId', async () => {
    const t1 = new Date('2026-11-02T12:00:00Z');
    const t2 = new Date('2026-11-03T12:00:00Z');
    const reason = JSON.stringify({ from: null, to: 's1' });
    mocks.orderBy.mockResolvedValue([
      { taskId: 'a', previousValue: 'Backlog', newValue: 'Sprint 1', reason, at: t1 },
      { taskId: null, previousValue: 'Backlog', newValue: 'Sprint 1', reason: null, at: t1 },
      { taskId: 'b', previousValue: 'Backlog', newValue: 'Sprint 1', reason: null, at: t1 },
      { taskId: 'a', previousValue: 'Sprint 1', newValue: 'Backlog', reason: null, at: t2 },
    ]);

    const r = await loadSprintEvents(spaceId);

    expect(mocks.select).toHaveBeenCalledTimes(1);
    expect(mocks.select).toHaveBeenCalledWith({
      taskId: 'auditLog.taskId',
      previousValue: 'auditLog.previousValue',
      newValue: 'auditLog.newValue',
      reason: 'auditLog.reason',
      at: 'auditLog.timestamp',
    });
    expect(mocks.from).toHaveBeenCalledWith(expect.objectContaining({ action: 'auditLog.action' }));
    const where = mocks.where.mock.calls[0][0] as Condition;
    expect(where.operator).toBe('and');
    expect(where.conditions).toContainEqual({ operator: 'eq', left: 'auditLog.action', right: 'task_sprint_changed' });
    expect(where.conditions).toContainEqual({ operator: 'eq', left: 'auditLog.spaceId', right: spaceId });
    expect(mocks.orderBy).toHaveBeenCalledWith({ operator: 'asc', column: 'auditLog.timestamp' });

    expect([...r.keys()]).toEqual(['a', 'b']);
    expect(r.get('a')).toEqual([
      { taskId: 'a', previousValue: 'Backlog', newValue: 'Sprint 1', reason, at: t1 },
      { taskId: 'a', previousValue: 'Sprint 1', newValue: 'Backlog', reason: null, at: t2 },
    ]);
    expect(r.get('b')).toHaveLength(1);
  });

  it('sin eventos devuelve un Map vacío', async () => {
    mocks.orderBy.mockResolvedValue([]);
    const r = await loadSprintEvents(spaceId);
    expect(r).toBeInstanceOf(Map);
    expect(r.size).toBe(0);
  });
});

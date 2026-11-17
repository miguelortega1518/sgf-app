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
    action: 'auditLog.action',
    previousValue: 'auditLog.previousValue',
    newValue: 'auditLog.newValue',
    timestamp: 'auditLog.timestamp',
  },
}));
vi.mock('drizzle-orm', () => ({
  and: (...conditions: unknown[]) => ({ operator: 'and', conditions }),
  eq: (left: unknown, right: unknown) => ({ operator: 'eq', left, right }),
  asc: (column: unknown) => ({ operator: 'asc', column }),
  inArray: (left: unknown, values: unknown[]) => ({ operator: 'inArray', left, values }),
}));

import { loadStatusEvents } from '../src/lib/status-history-query';

type Condition = { operator: string; left?: unknown; right?: unknown; values?: unknown[]; conditions?: Condition[] };

describe('loadStatusEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.select.mockReturnValue({ from: mocks.from });
    mocks.from.mockReturnValue({ where: mocks.where });
    mocks.where.mockReturnValue({ orderBy: mocks.orderBy });
  });

  it('con una lista vacía no consulta la BD', async () => {
    const r = await loadStatusEvents([]);
    expect(r).toBeInstanceOf(Map);
    expect(r.size).toBe(0);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('hace una sola consulta filtrada y agrupa por taskId', async () => {
    const t1 = new Date('2026-10-01T12:00:00Z');
    const t2 = new Date('2026-10-02T12:00:00Z');
    mocks.orderBy.mockResolvedValue([
      { taskId: 'a', previousValue: 'no_iniciada', newValue: 'en_proceso', at: t1 },
      { taskId: 'a', previousValue: 'en_proceso', newValue: 'completada', at: t2 },
      { taskId: 'c', previousValue: 'no_iniciada', newValue: 'bloqueada', at: t1 },
    ]);

    const r = await loadStatusEvents(['a', 'b', 'c']);

    expect(mocks.select).toHaveBeenCalledTimes(1);
    expect(mocks.from).toHaveBeenCalledWith(expect.objectContaining({ action: 'auditLog.action' }));
    const where = mocks.where.mock.calls[0][0] as Condition;
    expect(where.operator).toBe('and');
    expect(where.conditions).toContainEqual({ operator: 'eq', left: 'auditLog.action', right: 'status_changed' });
    expect(where.conditions).toContainEqual({ operator: 'inArray', left: 'auditLog.taskId', values: ['a', 'b', 'c'] });
    expect(mocks.orderBy).toHaveBeenCalledWith(
      { operator: 'asc', column: 'auditLog.taskId' },
      { operator: 'asc', column: 'auditLog.timestamp' },
    );

    expect([...r.keys()]).toEqual(['a', 'c']);
    expect(r.get('a')).toEqual([
      { taskId: 'a', previousValue: 'no_iniciada', newValue: 'en_proceso', at: t1 },
      { taskId: 'a', previousValue: 'en_proceso', newValue: 'completada', at: t2 },
    ]);
    expect(r.get('c')).toHaveLength(1);
    expect(r.get('b')).toBeUndefined();
  });
});

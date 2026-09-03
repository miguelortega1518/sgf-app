import { db } from '@/lib/db';
import { spaces, tasks, persons, spaceUpdates } from '@/lib/db/schema';
import { requireRole } from '@/lib/auth';
import { success, handleError } from '@/lib/api-utils';
import { todayRD } from '@/lib/date-utils';
import { eq, and, ne, count, max, desc, sql } from 'drizzle-orm';

export async function GET() {
  try {
    await requireRole('admin');
    const today = todayRD();

    const activeSpaces = await db
      .select({
        id: spaces.id,
        name: spaces.name,
        type: spaces.type,
        status: spaces.status,
        targetDate: spaces.targetDate,
        declaredHealth: spaces.declaredHealth,
        ownerId: spaces.ownerId,
        ownerName: persons.name,
        openDate: spaces.openDate,
        period: spaces.period,
      })
      .from(spaces)
      .innerJoin(persons, eq(spaces.ownerId, persons.id))
      .where(ne(spaces.status, 'cerrado'))
      .orderBy(desc(spaces.createdAt));

    const spaceIds = activeSpaces.map(s => s.id);

    const spaceStats = await Promise.all(
      spaceIds.map(async (spaceId) => {
        const [taskCounts] = await db
          .select({
            total: count(),
            completed: count(
              sql`CASE WHEN ${tasks.status} = 'completada' THEN 1 END`
            ),
            overdue: count(
              sql`CASE WHEN ${tasks.dueDateOriginal} < ${today} AND ${tasks.status} != 'completada' THEN 1 END`
            ),
            blocked: count(
              sql`CASE WHEN ${tasks.status} = 'bloqueada' THEN 1 END`
            ),
          })
          .from(tasks)
          .where(and(eq(tasks.spaceId, spaceId), eq(tasks.archived, false)));

        const [lastUpdate] = await db
          .select({
            createdAt: spaceUpdates.createdAt,
            health: spaceUpdates.health,
          })
          .from(spaceUpdates)
          .where(eq(spaceUpdates.spaceId, spaceId))
          .orderBy(desc(spaceUpdates.createdAt))
          .limit(1);

        return {
          spaceId,
          totalTasks: taskCounts?.total ?? 0,
          completedTasks: taskCounts?.completed ?? 0,
          overdueTasks: taskCounts?.overdue ?? 0,
          blockedTasks: taskCounts?.blocked ?? 0,
          lastUpdate: lastUpdate?.createdAt ?? null,
          lastHealth: lastUpdate?.health ?? null,
        };
      })
    );

    const enriched = activeSpaces.map(space => {
      const stats = spaceStats.find(s => s.spaceId === space.id);
      let daysSinceUpdate: number | null = null;
      if (stats?.lastUpdate) {
        const lastDate = new Date(stats.lastUpdate);
        const now = new Date();
        daysSinceUpdate = Math.floor(
          (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
        );
      }

      const noSignal = space.type === 'proyecto' &&
        (daysSinceUpdate === null || daysSinceUpdate > 14);

      return {
        ...space,
        ...stats,
        daysSinceUpdate,
        noSignal,
      };
    });

    enriched.sort((a, b) => {
      if (a.noSignal && !b.noSignal) return -1;
      if (!a.noSignal && b.noSignal) return 1;
      return (b.overdueTasks ?? 0) - (a.overdueTasks ?? 0);
    });

    return success(enriched);
  } catch (err) {
    return handleError(err);
  }
}

import { db } from '@/lib/db';
import { spaces, tasks, persons, spaceUpdates } from '@/lib/db/schema';
import { requireRole } from '@/lib/auth';
import { success, handleError } from '@/lib/api-utils';
import { todayRD } from '@/lib/date-utils';
import { eq, and, ne, count, desc, sql, inArray } from 'drizzle-orm';

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

    const taskStats = spaceIds.length > 0
      ? await db
          .select({
            spaceId: tasks.spaceId,
            total: count(),
            completed: count(sql`CASE WHEN ${tasks.status} = 'completada' THEN 1 END`),
            overdue: count(sql`CASE WHEN ${tasks.dueDateOriginal} < ${today} AND ${tasks.status} != 'completada' THEN 1 END`),
            blocked: count(sql`CASE WHEN ${tasks.status} = 'bloqueada' THEN 1 END`),
          })
          .from(tasks)
          .where(and(inArray(tasks.spaceId, spaceIds), eq(tasks.archived, false)))
          .groupBy(tasks.spaceId)
      : [];

    const latestUpdates = spaceIds.length > 0
      ? await db
          .select({
            spaceId: spaceUpdates.spaceId,
            createdAt: sql<Date>`MAX(${spaceUpdates.createdAt})`.as('max_created'),
            health: sql<string>`(array_agg(${spaceUpdates.health} ORDER BY ${spaceUpdates.createdAt} DESC))[1]`.as('latest_health'),
          })
          .from(spaceUpdates)
          .where(inArray(spaceUpdates.spaceId, spaceIds))
          .groupBy(spaceUpdates.spaceId)
      : [];

    const statsMap = new Map(taskStats.map(s => [s.spaceId, s]));
    const updatesMap = new Map(latestUpdates.map(u => [u.spaceId, u]));

    const enriched = activeSpaces.map(space => {
      const stats = statsMap.get(space.id);
      const lastUpd = updatesMap.get(space.id);

      let daysSinceUpdate: number | null = null;
      if (lastUpd?.createdAt) {
        const lastDate = new Date(lastUpd.createdAt);
        const now = new Date();
        daysSinceUpdate = Math.floor(
          (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
        );
      }

      const noSignal = space.type === 'proyecto' &&
        (daysSinceUpdate === null || daysSinceUpdate > 14);

      return {
        ...space,
        totalTasks: stats?.total ?? 0,
        completedTasks: stats?.completed ?? 0,
        overdueTasks: stats?.overdue ?? 0,
        blockedTasks: stats?.blocked ?? 0,
        lastUpdate: lastUpd?.createdAt ?? null,
        lastHealth: lastUpd?.health ?? null,
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

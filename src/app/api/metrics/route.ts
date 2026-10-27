import { db } from '@/lib/db';
import { tasks, persons } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { success, handleError } from '@/lib/api-utils';
import { eq } from 'drizzle-orm';
import {
  weeklyVelocity, cycleTime, workInProgress, blockersByArea, doneByKind, type MetricTask,
} from '@/lib/metrics';

export async function GET() {
  try {
    await requireSession();

    const rows: MetricTask[] = await db
      .select({
        status: tasks.status,
        kind: tasks.kind,
        estimate: tasks.estimate,
        createdAt: tasks.createdAt,
        completedAt: tasks.completedAt,
        responsibleId: tasks.responsibleId,
        responsibleName: persons.name,
        blockedByArea: tasks.blockedByArea,
      })
      .from(tasks)
      .innerJoin(persons, eq(tasks.responsibleId, persons.id))
      .where(eq(tasks.archived, false));

    const velocity = weeklyVelocity(rows, 8);
    const last4 = velocity.slice(-4);
    return success({
      velocity,
      averagePointsPerWeek: Math.round((last4.reduce((s, w) => s + w.points, 0) / last4.length) * 10) / 10,
      cycleTime: cycleTime(rows, 60),
      wip: workInProgress(rows),
      blockers: blockersByArea(rows),
      doneByKind: doneByKind(rows, 30),
      openTasks: rows.filter(t => t.status !== 'completada').length,
    });
  } catch (err) {
    return handleError(err);
  }
}

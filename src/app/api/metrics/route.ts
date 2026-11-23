import { db } from '@/lib/db';
import { tasks, persons } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { success, handleError } from '@/lib/api-utils';
import { eq, and, inArray } from 'drizzle-orm';
import { accessibleSpaceIds } from '@/lib/project-access';
import {
  weeklyVelocity, cycleTime, leadTime, wipAging, isWip, blockersByArea, doneByKind, type MetricTask,
} from '@/lib/metrics';
import { buildStatusHistory } from '@/lib/status-history';
import { loadStatusEvents } from '@/lib/status-history-query';

const WINDOW_DAYS = 60;
const DAY = 86_400_000;
const WIP_AGING_LIMIT = 10;

/**
 * Métricas de entrega del equipo (totales). El trabajo en curso por persona está en
 * /api/metrics/people, que depende del ajuste del equipo (DECISIONES §22).
 */
export async function GET() {
  try {
    const session = await requireSession();
    const allowedSpaceIds = await accessibleSpaceIds(session);
    const rows: MetricTask[] = await db
      .select({
        id: tasks.id,
        number: tasks.number,
        title: tasks.title,
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
      .where(and(eq(tasks.archived, false), allowedSpaceIds === null ? undefined : inArray(tasks.spaceId, allowedSpaceIds)));

    const now = new Date();
    const since = now.getTime() - WINDOW_DAYS * DAY;
    // Sólo hace falta el historial de lo que entra en el ciclo (60 días) o en la antigüedad (en curso).
    const relevant = rows.filter(t =>
      isWip(t.status) || (t.status === 'completada' && t.completedAt !== null && t.completedAt.getTime() >= since));
    const events = await loadStatusEvents(relevant.map(t => t.id));
    const histories = new Map(relevant.map(t => [t.id, buildStatusHistory(t, events.get(t.id) ?? [])]));

    const velocity = weeklyVelocity(rows, 8, now);
    const last4 = velocity.slice(-4);
    const aging = wipAging(rows, histories, now);
    return success({
      velocity,
      averagePointsPerWeek: Math.round((last4.reduce((s, w) => s + w.points, 0) / last4.length) * 10) / 10,
      cycleTime: cycleTime(rows, histories, WINDOW_DAYS, now),
      leadTime: leadTime(rows, WINDOW_DAYS, now),
      wipAging: aging.slice(0, WIP_AGING_LIMIT),
      wipAgingTotal: aging.length,
      blockers: blockersByArea(rows),
      doneByKind: doneByKind(rows, 30, now),
      openTasks: rows.filter(t => t.status !== 'completada').length,
    });
  } catch (err) {
    return handleError(err);
  }
}

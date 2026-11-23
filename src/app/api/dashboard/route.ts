import { db } from '@/lib/db';
import { tasks, companies } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { success, handleError } from '@/lib/api-utils';
import { todayRD } from '@/lib/date-utils';
import { eq, and, count, sql, desc, inArray } from 'drizzle-orm';
import { accessibleSpaceIds } from '@/lib/project-access';

/**
 * KPIs de Panorama: sólo totales del equipo. La carga por persona está en
 * /api/metrics/people, que depende del ajuste del equipo (DECISIONES §22).
 */
export async function GET() {
  try {
    const session = await requireSession();
    const today = todayRD();
    const allowedSpaceIds = await accessibleSpaceIds(session);
    const baseCondition = allowedSpaceIds === null
      ? eq(tasks.archived, false)
      : allowedSpaceIds.length > 0
        ? and(eq(tasks.archived, false), inArray(tasks.spaceId, allowedSpaceIds))
        : and(eq(tasks.archived, false), sql`false`);

    const [totals] = await db
      .select({
        total: count(),
        completed: count(sql`CASE WHEN ${tasks.status} = 'completada' THEN 1 END`),
        overdue: count(sql`CASE WHEN ${tasks.dueDateOriginal} < ${today} AND ${tasks.status} != 'completada' THEN 1 END`),
        blocked: count(sql`CASE WHEN ${tasks.status} = 'bloqueada' THEN 1 END`),
        inProgress: count(sql`CASE WHEN ${tasks.status} = 'en_proceso' THEN 1 END`),
        inReview: count(sql`CASE WHEN ${tasks.status} = 'en_revision' THEN 1 END`),
        notStarted: count(sql`CASE WHEN ${tasks.status} = 'no_iniciada' THEN 1 END`),
      })
      .from(tasks)
      .where(baseCondition);

    const byCompany = await db
      .select({
        companyId: tasks.companyId,
        companyName: companies.name,
        total: count(),
        completed: count(sql`CASE WHEN ${tasks.status} = 'completada' THEN 1 END`),
        overdue: count(sql`CASE WHEN ${tasks.dueDateOriginal} < ${today} AND ${tasks.status} != 'completada' THEN 1 END`),
      })
      .from(tasks)
      .innerJoin(companies, eq(tasks.companyId, companies.id))
      .where(baseCondition)
      .groupBy(tasks.companyId, companies.name)
      .orderBy(desc(count()));

    const byStatus = [
      { status: 'no_iniciada', label: 'No iniciada', count: totals.notStarted, color: '#9CA3AF' },
      { status: 'en_proceso', label: 'En proceso', count: totals.inProgress, color: '#3B82F6' },
      { status: 'en_revision', label: 'En revisión', count: totals.inReview, color: '#F59E0B' },
      { status: 'completada', label: 'Completada', count: totals.completed, color: '#10B981' },
      { status: 'bloqueada', label: 'Bloqueada', count: totals.blocked, color: '#EF4444' },
    ];

    const completionRate = totals.total > 0
      ? Math.round((totals.completed / totals.total) * 100)
      : 0;

    return success({
      totals: { ...totals, completionRate },
      byStatus,
      byCompany,
    });
  } catch (err) {
    return handleError(err);
  }
}

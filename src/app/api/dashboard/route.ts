import { db } from '@/lib/db';
import { tasks, persons, companies, spaces } from '@/lib/db/schema';
import { requireRole } from '@/lib/auth';
import { success, handleError } from '@/lib/api-utils';
import { todayRD } from '@/lib/date-utils';
import { eq, and, ne, count, sql, desc } from 'drizzle-orm';

export async function GET() {
  try {
    await requireRole('admin');
    const today = todayRD();

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
      .where(eq(tasks.archived, false));

    const byPerson = await db
      .select({
        personId: tasks.responsibleId,
        personName: persons.name,
        total: count(),
        completed: count(sql`CASE WHEN ${tasks.status} = 'completada' THEN 1 END`),
        overdue: count(sql`CASE WHEN ${tasks.dueDateOriginal} < ${today} AND ${tasks.status} != 'completada' THEN 1 END`),
      })
      .from(tasks)
      .innerJoin(persons, eq(tasks.responsibleId, persons.id))
      .where(eq(tasks.archived, false))
      .groupBy(tasks.responsibleId, persons.name)
      .orderBy(desc(count()));

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
      .where(eq(tasks.archived, false))
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
      byPerson,
      byCompany,
    });
  } catch (err) {
    return handleError(err);
  }
}

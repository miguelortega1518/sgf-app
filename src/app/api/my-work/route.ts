import { db } from '@/lib/db';
import { tasks, spaces, persons, companies } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { success, handleError } from '@/lib/api-utils';
import { todayRD } from '@/lib/date-utils';
import { eq, and, ne, lt, lte, gte, isNull, or, asc } from 'drizzle-orm';

export async function GET() {
  try {
    const session = await requireSession();
    const today = todayRD();
    const weekEnd = addDays(today, 7);

    const myTasks = await db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        dueDate: tasks.dueDate,
        dueDateOriginal: tasks.dueDateOriginal,
        priority: tasks.priority,
        spaceId: tasks.spaceId,
        spaceName: spaces.name,
        spaceType: spaces.type,
        companyId: tasks.companyId,
        companyName: companies.name,
        requiresApproval: tasks.requiresApproval,
        blockedByArea: tasks.blockedByArea,
      })
      .from(tasks)
      .innerJoin(spaces, eq(tasks.spaceId, spaces.id))
      .leftJoin(companies, eq(tasks.companyId, companies.id))
      .where(
        and(
          eq(tasks.responsibleId, session.id),
          eq(tasks.archived, false),
          ne(tasks.status, 'completada'),
        ),
      )
      .orderBy(asc(tasks.dueDate));

    const overdue = myTasks.filter(
      t => t.dueDateOriginal && t.dueDateOriginal < today
    );
    const dueToday = myTasks.filter(
      t => t.dueDate === today
    );
    const dueThisWeek = myTasks.filter(
      t => t.dueDate && t.dueDate > today && t.dueDate <= weekEnd
    );
    const upcoming = myTasks.filter(
      t => t.dueDate && t.dueDate > weekEnd && t.status !== 'bloqueada'
    );
    const noDueDate = myTasks.filter(t => !t.dueDate && t.status !== 'bloqueada');
    const blocked = myTasks.filter(t => t.status === 'bloqueada');

    return success({
      overdue,
      dueToday,
      dueThisWeek,
      upcoming,
      noDueDate,
      blocked,
      total: myTasks.length,
    });
  } catch (err) {
    return handleError(err);
  }
}

function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr + 'T12:00:00');
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

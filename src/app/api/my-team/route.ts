import { db } from '@/lib/db';
import { tasks, spaces, persons, companies } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { success, handleError } from '@/lib/api-utils';
import { todayRD } from '@/lib/date-utils';
import { eq, and, ne, asc } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

export async function GET() {
  try {
    const session = await requireSession();
    const today = todayRD();

    const responsible = alias(persons, 'responsible');

    const teamTasks = await db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        dueDate: tasks.dueDate,
        dueDateOriginal: tasks.dueDateOriginal,
        priority: tasks.priority,
        spaceName: spaces.name,
        spaceType: spaces.type,
        companyName: companies.name,
        blockedByArea: tasks.blockedByArea,
        requiresApproval: tasks.requiresApproval,
        responsibleId: tasks.responsibleId,
        responsibleName: responsible.name,
        responsibleEmail: responsible.email,
      })
      .from(tasks)
      .innerJoin(spaces, eq(tasks.spaceId, spaces.id))
      .innerJoin(responsible, eq(tasks.responsibleId, responsible.id))
      .leftJoin(companies, eq(tasks.companyId, companies.id))
      .where(
        and(
          eq(tasks.reviewerId, session.id),
          eq(tasks.archived, false),
          ne(tasks.status, 'completada'),
        ),
      )
      .orderBy(asc(tasks.dueDate));

    const grouped: Record<string, {
      personId: string;
      personName: string;
      personEmail: string;
      total: number;
      overdue: number;
      tasks: typeof teamTasks;
    }> = {};

    for (const t of teamTasks) {
      if (!grouped[t.responsibleId]) {
        grouped[t.responsibleId] = {
          personId: t.responsibleId,
          personName: t.responsibleName,
          personEmail: t.responsibleEmail,
          total: 0,
          overdue: 0,
          tasks: [],
        };
      }
      const g = grouped[t.responsibleId];
      g.total++;
      if (t.dueDateOriginal && t.dueDateOriginal < today) {
        g.overdue++;
      }
      g.tasks.push(t);
    }

    const members = Object.values(grouped).sort((a, b) => b.overdue - a.overdue || b.total - a.total);

    return success({
      members,
      totalTasks: teamTasks.length,
      totalOverdue: teamTasks.filter(t => t.dueDateOriginal && t.dueDateOriginal < today).length,
      totalMembers: members.length,
    });
  } catch (err) {
    return handleError(err);
  }
}

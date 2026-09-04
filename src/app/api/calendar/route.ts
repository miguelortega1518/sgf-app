import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { tasks, spaces, persons } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { success, handleError } from '@/lib/api-utils';
import { eq, and, ne, isNotNull, asc } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const personId = searchParams.get('personId');

    const conditions = [
      eq(tasks.archived, false),
      ne(tasks.status, 'completada'),
      isNotNull(tasks.dueDate),
    ];

    if (session.role !== 'admin' || !personId || personId === 'all') {
      if (session.role !== 'admin') {
        conditions.push(eq(tasks.responsibleId, session.id));
      }
    } else {
      conditions.push(eq(tasks.responsibleId, personId));
    }

    const result = await db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        dueDate: tasks.dueDate,
        priority: tasks.priority,
        spaceName: spaces.name,
        responsibleName: persons.name,
        responsibleId: tasks.responsibleId,
      })
      .from(tasks)
      .innerJoin(spaces, eq(tasks.spaceId, spaces.id))
      .innerJoin(persons, eq(tasks.responsibleId, persons.id))
      .where(and(...conditions))
      .orderBy(asc(tasks.dueDate));

    return success(result);
  } catch (err) {
    return handleError(err);
  }
}

import { db } from '@/lib/db';
import { tasks, spaces, persons, companies } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { success, error, handleError } from '@/lib/api-utils';
import { ilike, or, eq, and } from 'drizzle-orm';
import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const q = req.nextUrl.searchParams.get('q')?.trim();
    if (!q || q.length < 2) return error('Búsqueda muy corta', 400);

    const pattern = `%${q}%`;

    const [matchedTasks, matchedSpaces, matchedPersons] = await Promise.all([
      db
        .select({
          id: tasks.id,
          title: tasks.title,
          status: tasks.status,
          spaceName: spaces.name,
          responsibleName: persons.name,
        })
        .from(tasks)
        .innerJoin(spaces, eq(tasks.spaceId, spaces.id))
        .innerJoin(persons, eq(tasks.responsibleId, persons.id))
        .where(and(
          eq(tasks.archived, false),
          or(ilike(tasks.title, pattern), ilike(tasks.description, pattern)),
        ))
        .limit(20),

      db
        .select({
          id: spaces.id,
          name: spaces.name,
          type: spaces.type,
          status: spaces.status,
        })
        .from(spaces)
        .where(ilike(spaces.name, pattern))
        .limit(10),

      db
        .select({
          id: persons.id,
          name: persons.name,
          email: persons.email,
          role: persons.role,
        })
        .from(persons)
        .where(or(ilike(persons.name, pattern), ilike(persons.email, pattern)))
        .limit(10),
    ]);

    return success({
      tasks: matchedTasks,
      spaces: matchedSpaces,
      persons: matchedPersons,
    });
  } catch (err) {
    return handleError(err);
  }
}

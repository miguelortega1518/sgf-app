import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { spaceUpdates, spaces, persons } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { success, error, handleError } from '@/lib/api-utils';
import { eq, desc } from 'drizzle-orm';
import { z } from 'zod';

const createSchema = z.object({
  health: z.enum(['verde', 'amarillo', 'rojo']),
  content: z.string().min(1).max(2000),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id: spaceId } = await params;

    const updates = await db
      .select({
        id: spaceUpdates.id,
        health: spaceUpdates.health,
        content: spaceUpdates.content,
        createdAt: spaceUpdates.createdAt,
        authorName: persons.name,
      })
      .from(spaceUpdates)
      .innerJoin(persons, eq(spaceUpdates.authorId, persons.id))
      .where(eq(spaceUpdates.spaceId, spaceId))
      .orderBy(desc(spaceUpdates.createdAt))
      .limit(20);

    return success(updates);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    if (session.role === 'observador') return error('Sin permisos', 403);
    const { id: spaceId } = await params;

    const [space] = await db.select().from(spaces).where(eq(spaces.id, spaceId)).limit(1);
    if (!space) return error('Espacio no encontrado', 404);

    const input = createSchema.parse(await req.json());

    const [update] = await db
      .insert(spaceUpdates)
      .values({
        spaceId,
        authorId: session.id,
        health: input.health,
        content: input.content,
      })
      .returning();

    await db
      .update(spaces)
      .set({ declaredHealth: input.health })
      .where(eq(spaces.id, spaceId));

    return success(update, 201);
  } catch (err) {
    return handleError(err);
  }
}

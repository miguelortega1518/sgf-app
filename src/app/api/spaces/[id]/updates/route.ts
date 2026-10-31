import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { spaceUpdates, spaces, persons } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { success, error, handleError } from '@/lib/api-utils';
import { stripHtml } from '@/lib/sanitize';
import { eq, desc } from 'drizzle-orm';
import { requireProjectAccess } from '@/lib/project-access';
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
    const session = await requireSession();
    const { id: spaceId } = await params;
    await requireProjectAccess(session, spaceId, 'read');

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
    const { id: spaceId } = await params;

    const input = createSchema.parse(await req.json());
    const content = stripHtml(input.content).trim();
    if (!content) return error('El contenido no puede estar vacío', 400);

    const update = await db.transaction(async tx => {
      await requireProjectAccess(session, spaceId, 'write', tx);
      const [row] = await tx
        .insert(spaceUpdates)
        .values({ spaceId, authorId: session.id, health: input.health, content })
        .returning();
      await tx.update(spaces).set({ declaredHealth: input.health }).where(eq(spaces.id, spaceId));
      return row;
    });

    return success(update, 201);
  } catch (err) {
    return handleError(err);
  }
}

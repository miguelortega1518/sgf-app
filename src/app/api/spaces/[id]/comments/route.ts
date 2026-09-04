import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { comments, persons } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { success, error, handleError } from '@/lib/api-utils';
import { eq, desc } from 'drizzle-orm';
import { z } from 'zod';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id } = await params;

    const rows = await db
      .select({
        id: comments.id,
        content: comments.content,
        authorId: comments.authorId,
        authorName: persons.name,
        createdAt: comments.createdAt,
        editedAt: comments.editedAt,
      })
      .from(comments)
      .innerJoin(persons, eq(comments.authorId, persons.id))
      .where(eq(comments.spaceId, id))
      .orderBy(desc(comments.createdAt));

    return success(rows);
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
    const { id } = await params;
    const body = await req.json();
    const { content } = z.object({ content: z.string().min(1).max(5000) }).parse(body);

    const [comment] = await db.insert(comments).values({
      spaceId: id,
      authorId: session.id,
      content,
    }).returning();

    return success(comment, 201);
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const { commentId, content } = z.object({
      commentId: z.string().uuid(),
      content: z.string().min(1).max(5000),
    }).parse(body);

    const [existing] = await db.select().from(comments).where(eq(comments.id, commentId)).limit(1);
    if (!existing) return error('Comentario no encontrado', 404);
    if (existing.authorId !== session.id && session.role !== 'admin') return error('Sin permisos', 403);

    const [updated] = await db.update(comments)
      .set({ content, editedAt: new Date() })
      .where(eq(comments.id, commentId))
      .returning();
    return success(updated);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const { commentId } = z.object({ commentId: z.string().uuid() }).parse(body);

    const [existing] = await db.select().from(comments).where(eq(comments.id, commentId)).limit(1);
    if (!existing) return error('Comentario no encontrado', 404);
    if (existing.authorId !== session.id && session.role !== 'admin') return error('Sin permisos', 403);

    await db.delete(comments).where(eq(comments.id, commentId));
    return success({ deleted: true });
  } catch (err) {
    return handleError(err);
  }
}

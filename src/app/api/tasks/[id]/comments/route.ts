import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { comments, tasks } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { canComment } from '@/lib/permissions';
import { success, error, handleError } from '@/lib/api-utils';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

const addCommentSchema = z.object({
  content: z.string().min(1, 'Contenido requerido').max(2000),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const { id: taskId } = await params;
    const body = await req.json();
    const input = addCommentSchema.parse(body);

    if (!canComment(session.role as 'admin' | 'miembro' | 'observador')) {
      return error('Sin permisos para comentar', 403);
    }

    const [task] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);

    if (!task) return error('Tarea no encontrada', 404);

    const [created] = await db
      .insert(comments)
      .values({
        taskId,
        authorId: session.id,
        content: input.content,
      })
      .returning();

    return success(created, 201);
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const { id: taskId } = await params;
    const body = await req.json();
    const { commentId, content } = z.object({
      commentId: z.string().uuid(),
      content: z.string().min(1).max(2000),
    }).parse(body);

    const [comment] = await db
      .select()
      .from(comments)
      .where(and(eq(comments.id, commentId), eq(comments.taskId, taskId)))
      .limit(1);

    if (!comment) return error('Comentario no encontrado', 404);
    if (comment.authorId !== session.id && session.role !== 'admin') {
      return error('Solo puedes editar tus propios comentarios', 403);
    }

    const [updated] = await db
      .update(comments)
      .set({ content, editedAt: new Date() })
      .where(eq(comments.id, commentId))
      .returning();

    return success(updated);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const { id: taskId } = await params;
    const { searchParams } = new URL(req.url);
    const commentId = searchParams.get('commentId');

    if (!commentId) return error('commentId requerido', 400);

    const [comment] = await db
      .select()
      .from(comments)
      .where(and(eq(comments.id, commentId), eq(comments.taskId, taskId)))
      .limit(1);

    if (!comment) return error('Comentario no encontrado', 404);
    if (comment.authorId !== session.id && session.role !== 'admin') {
      return error('Solo puedes eliminar tus propios comentarios', 403);
    }

    await db.delete(comments).where(eq(comments.id, commentId));
    return success({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}

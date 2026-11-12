import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { comments } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { canComment } from '@/lib/permissions';
import { success, error, handleError } from '@/lib/api-utils';
import { stripHtml } from '@/lib/sanitize';
import { logAudit } from '@/lib/audit';
import { requireTaskAccess, assertValidUuid } from '@/lib/project-access';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { COMMENT_MODERATED_REASON } from '@/lib/labels';

const addCommentSchema = z.object({
  content: z.string().transform(stripHtml).pipe(z.string().trim().min(1, 'Contenido requerido').max(2000)),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const { id: taskId } = await params;
    await requireTaskAccess(session, taskId, 'write');
    const body = await req.json();
    const input = addCommentSchema.parse(body);

    if (!canComment(session.role as 'admin' | 'miembro' | 'observador')) {
      return error('Sin permisos para comentar', 403);
    }



    const [created] = await db
      .insert(comments)
      .values({
        taskId,
        authorId: session.id,
        content: stripHtml(input.content),
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
    await requireTaskAccess(session, taskId, 'write');
    const body = await req.json();
    const { commentId, content } = z.object({
      commentId: z.string().uuid(),
      content: addCommentSchema.shape.content,
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

    const sanitized = stripHtml(content);
    const moderated = comment.authorId !== session.id;

    const updated = await db.transaction(async tx => {
      const [row] = await tx
        .update(comments)
        .set({ content: sanitized, editedAt: new Date() })
        .where(eq(comments.id, commentId))
        .returning();

      await logAudit({
        actorId: session.id,
        action: 'comment_edited',
        taskId,
        previousValue: comment.content,
        newValue: sanitized,
        ...(moderated ? { reason: COMMENT_MODERATED_REASON } : {}),
      }, tx);
      return row;
    });

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
    await requireTaskAccess(session, taskId, 'write');
    const { searchParams } = new URL(req.url);
    const commentId = searchParams.get('commentId');

    if (!commentId) return error('commentId requerido', 400);
    assertValidUuid(commentId);

    const [comment] = await db
      .select()
      .from(comments)
      .where(and(eq(comments.id, commentId), eq(comments.taskId, taskId)))
      .limit(1);

    if (!comment) return error('Comentario no encontrado', 404);
    if (comment.authorId !== session.id && session.role !== 'admin') {
      return error('Solo puedes eliminar tus propios comentarios', 403);
    }

    const moderated = comment.authorId !== session.id;

    await db.transaction(async tx => {
      await tx.delete(comments).where(eq(comments.id, commentId));

      await logAudit({
        actorId: session.id,
        action: 'comment_deleted',
        taskId,
        previousValue: comment.content,
        ...(moderated ? { reason: COMMENT_MODERATED_REASON } : {}),
      }, tx);
    });

    return success({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}

import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { comments, persons } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { success, error, handleError } from '@/lib/api-utils';
import { stripHtml } from '@/lib/sanitize';
import { logAudit } from '@/lib/audit';
import { eq, desc, and } from 'drizzle-orm';
import { z } from 'zod';
import { requireProjectAccess } from '@/lib/project-access';

/** Motivo de auditoría cuando un admin edita o borra un comentario ajeno. */
const MODERATED_REASON = 'Moderado por admin';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    await requireProjectAccess(session, id);

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
    await requireProjectAccess(session, id, 'write');
    const body = await req.json();
    const { content } = z.object({ content: z.string().transform(stripHtml).pipe(z.string().trim().min(1).max(5000)) }).parse(body);

    const [comment] = await db.insert(comments).values({
      spaceId: id,
      authorId: session.id,
      content: stripHtml(content),
    }).returning();

    return success(comment, 201);
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    await requireProjectAccess(session, id, 'write');
    const body = await req.json();
    const { commentId, content } = z.object({
      commentId: z.string().uuid(),
      content: z.string().transform(stripHtml).pipe(z.string().trim().min(1).max(5000)),
    }).parse(body);

    const [existing] = await db.select().from(comments).where(and(eq(comments.id, commentId), eq(comments.spaceId, id))).limit(1);
    if (!existing) return error('Comentario no encontrado', 404);
    if (existing.authorId !== session.id && session.role !== 'admin') return error('Sin permisos', 403);

    const sanitized = stripHtml(content);
    const moderated = existing.authorId !== session.id;

    const updated = await db.transaction(async tx => {
      const [row] = await tx.update(comments)
        .set({ content: sanitized, editedAt: new Date() })
        .where(and(eq(comments.id, commentId), eq(comments.spaceId, id)))
        .returning();

      await logAudit({
        actorId: session.id,
        action: 'comment_edited',
        spaceId: id,
        previousValue: existing.content,
        newValue: sanitized,
        ...(moderated ? { reason: MODERATED_REASON } : {}),
      }, tx);
      return row;
    });

    return success(updated);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    await requireProjectAccess(session, id, 'write');
    const body = await req.json();
    const { commentId } = z.object({ commentId: z.string().uuid() }).parse(body);

    const [existing] = await db.select().from(comments).where(and(eq(comments.id, commentId), eq(comments.spaceId, id))).limit(1);
    if (!existing) return error('Comentario no encontrado', 404);
    if (existing.authorId !== session.id && session.role !== 'admin') return error('Sin permisos', 403);

    const moderated = existing.authorId !== session.id;

    await db.transaction(async tx => {
      await tx.delete(comments).where(and(eq(comments.id, commentId), eq(comments.spaceId, id)));

      await logAudit({
        actorId: session.id,
        action: 'comment_deleted',
        spaceId: id,
        previousValue: existing.content,
        ...(moderated ? { reason: MODERATED_REASON } : {}),
      }, tx);
    });

    return success({ deleted: true });
  } catch (err) {
    return handleError(err);
  }
}

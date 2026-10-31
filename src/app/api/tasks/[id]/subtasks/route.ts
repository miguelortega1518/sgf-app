import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { subtasks } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { success, error, handleError } from '@/lib/api-utils';
import { eq, and, max } from 'drizzle-orm';
import { z } from 'zod';
import { requireTaskAccess, assertValidUuid } from '@/lib/project-access';

const createSchema = z.object({
  title: z.string().trim().min(1).max(500),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    if (session.role === 'observador') return error('Sin permisos', 403);
    const { id: taskId } = await params;
    await requireTaskAccess(session, taskId, 'write');



    const input = createSchema.parse(await req.json());

    const [maxOrder] = await db
      .select({ max: max(subtasks.order) })
      .from(subtasks)
      .where(eq(subtasks.taskId, taskId));

    const [sub] = await db
      .insert(subtasks)
      .values({
        taskId,
        title: input.title,
        order: (maxOrder?.max ?? 0) + 1,
      })
      .returning();

    return success(sub, 201);
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
    if (session.role === 'observador') return error('Sin permisos', 403);
    const { id: taskId } = await params;
    await requireTaskAccess(session, taskId, 'write');

    const body = z.object({ subtaskId: z.string().uuid(), title: createSchema.shape.title.optional(), completed: z.boolean().optional() }).parse(await req.json());
    const subtaskId = body.subtaskId;
    if (!subtaskId) return error('subtaskId requerido', 400);
    assertValidUuid(subtaskId);

    const updates: Record<string, unknown> = {};
    if (typeof body.completed === 'boolean') updates.completed = body.completed;
    if (typeof body.title === 'string') updates.title = body.title;

    if (!Object.keys(updates).length) return error('No hay cambios', 400);
    const [updated] = await db
      .update(subtasks)
      .set(updates)
      .where(and(eq(subtasks.id, subtaskId), eq(subtasks.taskId, taskId)))
      .returning();

    if (!updated) return error('Subtarea no encontrada', 404);
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
    if (session.role === 'observador') return error('Sin permisos', 403);
    const { id: taskId } = await params;
    await requireTaskAccess(session, taskId, 'write');

    const subtaskId = req.nextUrl.searchParams.get('subtaskId');
    if (!subtaskId) return error('subtaskId requerido', 400);
    assertValidUuid(subtaskId);

    const [deleted] = await db
      .delete(subtasks)
      .where(and(eq(subtasks.id, subtaskId), eq(subtasks.taskId, taskId)))
      .returning();

    if (!deleted) return error('Subtarea no encontrada', 404);
    return success({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}

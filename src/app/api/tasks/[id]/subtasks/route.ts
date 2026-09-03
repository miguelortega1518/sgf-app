import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { subtasks, tasks } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { success, error, handleError } from '@/lib/api-utils';
import { eq, and, max } from 'drizzle-orm';
import { z } from 'zod';

const createSchema = z.object({
  title: z.string().min(1).max(500),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    if (session.role === 'observador') return error('Sin permisos', 403);
    const { id: taskId } = await params;

    const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
    if (!task) return error('Tarea no encontrada', 404);

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

    const body = await req.json();
    const subtaskId = body.subtaskId;
    if (!subtaskId) return error('subtaskId requerido', 400);

    const updates: Record<string, unknown> = {};
    if (typeof body.completed === 'boolean') updates.completed = body.completed;
    if (typeof body.title === 'string') updates.title = body.title;

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

    const subtaskId = req.nextUrl.searchParams.get('subtaskId');
    if (!subtaskId) return error('subtaskId requerido', 400);

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

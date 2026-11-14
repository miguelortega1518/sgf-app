import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { subtasks } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { success, error, handleError } from '@/lib/api-utils';
import { eq, and, max } from 'drizzle-orm';
import { z } from 'zod';
import { requireTaskAccess, assertValidUuid } from '@/lib/project-access';

const createSchema = z.object({
  title: z.string().trim().min(1).max(500),
});

function completionText(title: string, completed: boolean): string {
  return `${title}: ${completed ? 'Hecha' : 'Pendiente'}`;
}

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

    const sub = await db.transaction(async tx => {
      const [maxOrder] = await tx
        .select({ max: max(subtasks.order) })
        .from(subtasks)
        .where(eq(subtasks.taskId, taskId));

      const [row] = await tx
        .insert(subtasks)
        .values({
          taskId,
          title: input.title,
          order: (maxOrder?.max ?? 0) + 1,
        })
        .returning();

      await logAudit({
        actorId: session.id,
        action: 'subtask_added',
        taskId,
        newValue: row.title,
      }, tx);

      return row;
    });

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

    if (body.title === undefined && body.completed === undefined) {
      return error('No hay cambios', 400);
    }

    const updated = await db.transaction(async tx => {
      const [current] = await tx.select().from(subtasks)
        .where(and(eq(subtasks.id, subtaskId), eq(subtasks.taskId, taskId)))
        .limit(1)
        .for('update');
      if (!current) throw Object.assign(new Error('Subtarea no encontrada'), { httpStatus: 404 });

      const titleChanged = body.title !== undefined && body.title !== current.title;
      const completedChanged = body.completed !== undefined && body.completed !== current.completed;
      if (!titleChanged && !completedChanged) return current;

      const updates: { title?: string; completed?: boolean } = {};
      if (titleChanged) updates.title = body.title;
      if (completedChanged) updates.completed = body.completed;

      const [row] = await tx
        .update(subtasks)
        .set(updates)
        .where(and(eq(subtasks.id, subtaskId), eq(subtasks.taskId, taskId)))
        .returning();

      if (titleChanged) {
        await logAudit({
          actorId: session.id,
          action: 'subtask_renamed',
          taskId,
          previousValue: current.title,
          newValue: body.title,
        }, tx);
      }

      // Se usa el título previo en ambos valores para que la Bitácora se lea igual.
      if (completedChanged) {
        await logAudit({
          actorId: session.id,
          action: 'subtask_completion_changed',
          taskId,
          previousValue: completionText(current.title, current.completed),
          newValue: completionText(current.title, body.completed === true),
        }, tx);
      }

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
    if (session.role === 'observador') return error('Sin permisos', 403);
    const { id: taskId } = await params;
    await requireTaskAccess(session, taskId, 'write');

    const subtaskId = req.nextUrl.searchParams.get('subtaskId');
    if (!subtaskId) return error('subtaskId requerido', 400);
    assertValidUuid(subtaskId);

    await db.transaction(async tx => {
      const [current] = await tx.select().from(subtasks)
        .where(and(eq(subtasks.id, subtaskId), eq(subtasks.taskId, taskId)))
        .limit(1)
        .for('update');
      if (!current) throw Object.assign(new Error('Subtarea no encontrada'), { httpStatus: 404 });

      await tx
        .delete(subtasks)
        .where(and(eq(subtasks.id, subtaskId), eq(subtasks.taskId, taskId)));

      await logAudit({
        actorId: session.id,
        action: 'subtask_removed',
        taskId,
        previousValue: current.title,
      }, tx);
    });

    return success({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}

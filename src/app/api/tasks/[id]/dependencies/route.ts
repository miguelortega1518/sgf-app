import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { taskDependencies, tasks } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { success, error, handleError } from '@/lib/api-utils';
import { eq, and, or } from 'drizzle-orm';
import { z } from 'zod';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id: taskId } = await params;

    const predecessorRows = await db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
      })
      .from(taskDependencies)
      .innerJoin(tasks, eq(taskDependencies.predecessorId, tasks.id))
      .where(eq(taskDependencies.taskId, taskId));

    const successorRows = await db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
      })
      .from(taskDependencies)
      .innerJoin(tasks, eq(taskDependencies.taskId, tasks.id))
      .where(eq(taskDependencies.predecessorId, taskId));

    return success({ predecessors: predecessorRows, successors: successorRows });
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

    const { id: taskId } = await params;
    const body = await req.json();
    const { predecessorId } = z.object({
      predecessorId: z.string().uuid(),
    }).parse(body);

    if (predecessorId === taskId) return error('Una tarea no puede depender de sí misma', 400);

    const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
    const [pred] = await db.select().from(tasks).where(eq(tasks.id, predecessorId)).limit(1);
    if (!task || !pred) return error('Tarea no encontrada', 404);

    await db
      .insert(taskDependencies)
      .values({ taskId, predecessorId })
      .onConflictDoNothing();

    return success({ ok: true }, 201);
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
    const { searchParams } = new URL(req.url);
    const predecessorId = searchParams.get('predecessorId');
    if (!predecessorId) return error('predecessorId requerido', 400);

    await db
      .delete(taskDependencies)
      .where(and(
        eq(taskDependencies.taskId, taskId),
        eq(taskDependencies.predecessorId, predecessorId),
      ));

    return success({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}

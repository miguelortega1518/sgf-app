import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { taskDependencies, tasks } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { success, error, handleError } from '@/lib/api-utils';
import { eq, and, sql } from 'drizzle-orm';
import { z } from 'zod';
import { requireTaskAccess, assertValidUuid } from '@/lib/project-access';
import { logAudit } from '@/lib/audit';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const { id: taskId } = await params;
    const task = await requireTaskAccess(session, taskId);

    const predecessorRows = await db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
      })
      .from(taskDependencies)
      .innerJoin(tasks, eq(taskDependencies.predecessorId, tasks.id))
      .where(and(eq(taskDependencies.taskId, taskId), eq(tasks.spaceId, task.spaceId)));

    const successorRows = await db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
      })
      .from(taskDependencies)
      .innerJoin(tasks, eq(taskDependencies.taskId, tasks.id))
      .where(and(eq(taskDependencies.predecessorId, taskId), eq(tasks.spaceId, task.spaceId)));

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

    const task = await requireTaskAccess(session, taskId, 'write');
    const pred = await requireTaskAccess(session, predecessorId);
    if (task.spaceId !== pred.spaceId) return error('Las dependencias deben pertenecer al mismo proyecto', 400);

    await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${task.spaceId}))`);
      const cycle = await tx.execute(sql`with recursive ancestors(id) as (
        select ${predecessorId}::uuid union
        select d.predecessor_id from task_dependencies d join ancestors a on d.task_id = a.id
      ) select id from ancestors where id = ${taskId}::uuid`);
      if (cycle.length) throw Object.assign(new Error('La dependencia crea un ciclo'), { httpStatus: 400 });
      const inserted = await tx
        .insert(taskDependencies)
        .values({ taskId, predecessorId })
        .onConflictDoNothing()
        .returning();
      // Sólo se audita si se creó la dependencia; un POST repetido es idempotente.
      if (inserted.length > 0) {
        await logAudit({ actorId: session.id, action: 'dependency_added', taskId, newValue: pred.title }, tx);
      }
    });

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
    assertValidUuid(predecessorId);
    await requireTaskAccess(session, taskId, 'write');

    const removed = await db.transaction(async tx => {
      const rows = await tx
        .delete(taskDependencies)
        .where(and(
          eq(taskDependencies.taskId, taskId),
          eq(taskDependencies.predecessorId, predecessorId),
        ))
        .returning();
      if (rows.length === 0) return false;

      // La FK garantiza que el predecesor existe; el id es sólo un respaldo defensivo.
      const [pred] = await tx
        .select({ title: tasks.title })
        .from(tasks)
        .where(eq(tasks.id, predecessorId))
        .limit(1);
      await logAudit({
        actorId: session.id,
        action: 'dependency_removed',
        taskId,
        previousValue: pred?.title ?? predecessorId,
      }, tx);
      return true;
    });

    if (!removed) return error('Dependencia no encontrada', 404);
    return success({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}

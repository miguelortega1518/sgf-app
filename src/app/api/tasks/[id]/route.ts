import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { tasks, spaces, evidence, subtasks, comments, persons, auditLog, taskDependencies } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { canChangeDueDate } from '@/lib/permissions';
import { updateTaskSchema, updateTaskStatusSchema } from '@/lib/schemas/task';
import { success, error, handleError } from '@/lib/api-utils';
import { logAudit } from '@/lib/audit';
import { notify } from '@/lib/notify';
import { isOverdue } from '@/lib/date-utils';
import { requireTaskAccess, requireProjectAccess, validateTaskReferences } from '@/lib/project-access';
import { applyStatusTransition } from '@/lib/task-transitions';
import { eq, desc } from 'drizzle-orm';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const { id } = await params;

    const task = await requireTaskAccess(session, id, 'read');

    const [responsible] = await db
      .select({ name: persons.name, email: persons.email })
      .from(persons)
      .where(eq(persons.id, task.responsibleId));

    const [space] = await db
      .select({ name: spaces.name })
      .from(spaces)
      .where(eq(spaces.id, task.spaceId))
      .limit(1);

    const taskSubtasks = await db
      .select()
      .from(subtasks)
      .where(eq(subtasks.taskId, id));

    const taskEvidence = await db
      .select()
      .from(evidence)
      .where(eq(evidence.taskId, id));

    const taskComments = await db
      .select({
        id: comments.id,
        content: comments.content,
        createdAt: comments.createdAt,
        editedAt: comments.editedAt,
        authorName: persons.name,
        authorId: comments.authorId,
      })
      .from(comments)
      .innerJoin(persons, eq(comments.authorId, persons.id))
      .where(eq(comments.taskId, id))
      .orderBy(desc(comments.createdAt));

    const taskAudit = await db
      .select({
        id: auditLog.id,
        action: auditLog.action,
        previousValue: auditLog.previousValue,
        newValue: auditLog.newValue,
        reason: auditLog.reason,
        timestamp: auditLog.timestamp,
        actorName: persons.name,
      })
      .from(auditLog)
      .innerJoin(persons, eq(auditLog.actorId, persons.id))
      .where(eq(auditLog.taskId, id))
      .orderBy(desc(auditLog.timestamp));

    const predecessors = await db
      .select({ id: tasks.id, title: tasks.title, status: tasks.status })
      .from(taskDependencies)
      .innerJoin(tasks, eq(taskDependencies.predecessorId, tasks.id))
      .where(eq(taskDependencies.taskId, id));

    const successors = await db
      .select({ id: tasks.id, title: tasks.title, status: tasks.status })
      .from(taskDependencies)
      .innerJoin(tasks, eq(taskDependencies.taskId, tasks.id))
      .where(eq(taskDependencies.predecessorId, id));

    return success({
      task: {
        ...task,
        overdue: isOverdue(task.dueDateOriginal, task.status),
        responsibleName: responsible?.name,
        spaceName: space?.name,
      },
      subtasks: taskSubtasks,
      evidence: taskEvidence,
      comments: taskComments,
      audit: taskAudit,
      dependencies: { predecessors, successors },
    });
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
    const { id } = await params;
    const body = await req.json();

    const task = await requireTaskAccess(session, id, 'write');

    const [space] = await db.select().from(spaces).where(eq(spaces.id, task.spaceId)).limit(1);
    if (!space) return error('Proyecto no encontrado', 404);

    if (body.status !== undefined) {
      const statusInput = updateTaskStatusSchema.parse(body);
      let updated: typeof tasks.$inferSelect;
      let notifyIntents: import('@/lib/task-transitions').NotificationIntent[] = [];

      await db.transaction(async (tx) => {
        const [current] = await tx.select().from(tasks).where(eq(tasks.id, id)).for('update');
        const currentSpace = await requireProjectAccess(session, current.spaceId, 'write', tx);
        const result = await applyStatusTransition(tx, session, current, currentSpace, statusInput);
        updated = result.task;
        notifyIntents = result.notifications;
      });

      for (const intent of notifyIntents) {
        notify(intent).catch(() => {});
      }

      return success(updated!);
    }

    const input = updateTaskSchema.parse(body);
    if (Object.keys(input).length === 0) return error('Debe proporcionar al menos un campo para actualizar', 400);

    if (input.dueDate !== undefined) {
      const isOwner = space.ownerId === session.id;
      const isOwnTask = task.responsibleId === session.id;
      if (!canChangeDueDate(session.role, space.type, isOwner, isOwnTask)) {
        return error('Sin permisos para cambiar la fecha límite', 403);
      }

    }
    const updated = await db.transaction(async tx => {
      const [current] = await tx.select().from(tasks).where(eq(tasks.id, id)).for('update');
      await requireProjectAccess(session, current.spaceId, 'write', tx);
      await validateTaskReferences(current.spaceId, input, tx);
      if (!Object.keys(input).length) return current;
      const [row] = await tx.update(tasks).set(input).where(eq(tasks.id, id)).returning();
      if (input.dueDate !== undefined && input.dueDate !== current.dueDate) {
        await logAudit({ actorId: session.id, action: 'due_date_changed', taskId: id,
          previousValue: current.dueDate ?? undefined, newValue: input.dueDate ?? undefined }, tx);
      }
      if (input.responsibleId && input.responsibleId !== current.responsibleId) {
        await logAudit({ actorId: session.id, action: 'responsible_changed', taskId: id,
          previousValue: current.responsibleId, newValue: input.responsibleId }, tx);
      }
      return row;
    });

    return success(updated);
  } catch (err) {
    return handleError(err);
  }
}
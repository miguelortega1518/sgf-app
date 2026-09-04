import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { tasks, spaces, evidence, subtasks, comments, persons, auditLog, taskDependencies } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { canChangeDueDate, canApproveTask } from '@/lib/permissions';
import { updateTaskSchema, updateTaskStatusSchema } from '@/lib/schemas/task';
import { success, error, handleError } from '@/lib/api-utils';
import { logAudit } from '@/lib/audit';
import { notify } from '@/lib/notify';
import { isOverdue } from '@/lib/date-utils';
import { eq, desc } from 'drizzle-orm';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id } = await params;

    const [task] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, id))
      .limit(1);

    if (!task) return error('Tarea no encontrada', 404);

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

    const [task] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    if (!task) return error('Tarea no encontrada', 404);

    const [space] = await db.select().from(spaces).where(eq(spaces.id, task.spaceId)).limit(1);
    if (!space) return error('Espacio no encontrado', 404);

    if (session.role === 'observador') {
      return error('Sin permisos', 403);
    }

    if (body.status !== undefined) {
      const statusInput = updateTaskStatusSchema.parse(body);
      return await handleStatusChange(session, task, space, statusInput, id);
    }

    const input = updateTaskSchema.parse(body);

    if (input.dueDate !== undefined) {
      const isOwner = space.ownerId === session.id;
      const isOwnTask = task.responsibleId === session.id;
      if (!canChangeDueDate(session.role, space.type, isOwner, isOwnTask)) {
        return error('Sin permisos para cambiar la fecha límite', 403);
      }

      if (input.dueDate !== task.dueDate) {
        await logAudit({
          actorId: session.id,
          action: 'due_date_changed',
          taskId: id,
          previousValue: task.dueDate ?? undefined,
          newValue: input.dueDate ?? undefined,
        });
      }
    }

    if (input.responsibleId && input.responsibleId !== task.responsibleId) {
      await logAudit({
        actorId: session.id,
        action: 'responsible_changed',
        taskId: id,
        previousValue: task.responsibleId,
        newValue: input.responsibleId,
      });
    }

    const [updated] = await db
      .update(tasks)
      .set(input)
      .where(eq(tasks.id, id))
      .returning();

    return success(updated);
  } catch (err) {
    return handleError(err);
  }
}

async function handleStatusChange(
  session: { id: string; role: string },
  task: typeof tasks.$inferSelect,
  space: typeof spaces.$inferSelect,
  input: { status: string; delayReason?: string; delayReasonText?: string; blockedByArea?: string; blockedByAreaText?: string },
  taskId: string,
) {
  const isOwnTask = task.responsibleId === session.id;
  const isAdmin = session.role === 'admin';

  if (session.role === 'observador') {
    return error('Sin permisos', 403);
  }

  if (input.status === 'completada' && task.requiresApproval) {
    if (!canApproveTask(session.role as 'admin' | 'miembro' | 'observador', session.id, task.reviewerId)) {
      return error('Solo el revisor o un admin puede aprobar esta tarea', 403);
    }
    if (task.status !== 'en_revision') {
      return error('La tarea debe estar en revisión para ser aprobada', 400);
    }

    const isAdminOverride = session.id !== task.reviewerId && isAdmin;

    await logAudit({
      actorId: session.id,
      action: isAdminOverride ? 'task_approved_admin_override' : 'task_approved',
      taskId,
    });
  }

  if (input.status === 'en_revision' && !task.requiresApproval) {
    return error('Esta tarea no requiere aprobación, pase directo a completada', 400);
  }

  if (input.status === 'completada' && task.requiresEvidence) {
    const evidenceCount = await db
      .select()
      .from(evidence)
      .where(eq(evidence.taskId, taskId));
    if (evidenceCount.length === 0) {
      return error('Se requiere evidencia para completar esta tarea', 400);
    }
  }

  if (input.status === 'bloqueada') {
    if (!input.blockedByArea) {
      return error('Indique el área que bloquea la tarea', 400);
    }
    if (input.blockedByArea === 'otro' && !input.blockedByAreaText) {
      return error('Especifique el área de bloqueo', 400);
    }
  }

  const updateData: Record<string, unknown> = {
    status: input.status,
  };

  if (input.status === 'completada') {
    updateData.completedAt = new Date();
    if (input.delayReason) {
      updateData.delayReason = input.delayReason;
      updateData.delayReasonText = input.delayReasonText;
    }
  }

  if (input.status === 'bloqueada') {
    updateData.blockedByArea = input.blockedByArea;
    updateData.blockedByAreaText = input.blockedByAreaText;
    updateData.blockedSince = new Date().toISOString().slice(0, 10);
  }

  if (task.status === 'bloqueada' && input.status !== 'bloqueada') {
    updateData.blockedByArea = null;
    updateData.blockedByAreaText = null;
    updateData.blockedSince = null;
  }

  const [updated] = await db
    .update(tasks)
    .set(updateData)
    .where(eq(tasks.id, taskId))
    .returning();

  await logAudit({
    actorId: session.id,
    action: 'status_changed',
    taskId,
    previousValue: task.status,
    newValue: input.status,
    reason: input.delayReason,
  });

  if (input.status === 'completada' && task.reviewerId && task.reviewerId !== session.id) {
    notify({
      recipientId: task.reviewerId,
      type: 'task_completed',
      title: `Tarea completada: ${task.title}`,
      body: 'Una tarea que supervisas ha sido completada.',
      taskId,
    }).catch(() => {});
  }

  if (input.status === 'en_revision' && task.reviewerId) {
    notify({
      recipientId: task.reviewerId,
      type: 'task_review',
      title: `Tarea en revisión: ${task.title}`,
      body: 'Una tarea requiere tu aprobación.',
      taskId,
    }).catch(() => {});
  }

  if (input.status === 'bloqueada' && task.responsibleId !== session.id) {
    notify({
      recipientId: task.responsibleId,
      type: 'task_blocked',
      title: `Tarea bloqueada: ${task.title}`,
      body: `Bloqueada por: ${input.blockedByArea || 'sin especificar'}`,
      taskId,
    }).catch(() => {});
  }

  return success(updated);
}

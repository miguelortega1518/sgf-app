import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { tasks, spaces, evidence, subtasks, comments, persons, auditLog, taskDependencies, githubPullRequests, sprints } from '@/lib/db/schema';
import { pullRequestView } from '@/lib/github-pull-request';
import { requireSession } from '@/lib/auth';
import { canChangeDueDate } from '@/lib/permissions';
import { updateTaskSchema, updateTaskStatusSchema } from '@/lib/schemas/task';
import { success, error, handleError } from '@/lib/api-utils';
import { logAudit } from '@/lib/audit';
import { redactTaskAuditForRole } from '@/lib/audit-redaction';
import { notify } from '@/lib/notify';
import { isOverdue } from '@/lib/date-utils';
import { requireTaskAccess, requireProjectAccess, validateTaskReferences } from '@/lib/project-access';
import { applyStatusTransition } from '@/lib/task-transitions';
import { buildAssignmentNotifications } from '@/lib/assignment-notifications';
import { and, eq, desc } from 'drizzle-orm';

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

    // Panel «Pull request»: el PR más reciente de la tarea.
    const [pullRequest] = await db
      .select()
      .from(githubPullRequests)
      .where(eq(githubPullRequests.taskId, id))
      .orderBy(desc(githubPullRequests.openedAt))
      .limit(1);

    // Décima consulta, sólo si la tarea está en un sprint (sin `and`: basta el id).
    let sprint: { id: string; name: string; status: string } | null = null;
    if (task.sprintId) {
      const [row] = await db
        .select({ id: sprints.id, name: sprints.name, status: sprints.status })
        .from(sprints)
        .where(eq(sprints.id, task.sprintId))
        .limit(1);
      sprint = row ?? null;
    }

    return success({
      task: {
        ...task,
        overdue: isOverdue(task.dueDateOriginal, task.status),
        responsibleName: responsible?.name,
        spaceName: space?.name,
        sprint,
      },
      subtasks: taskSubtasks,
      evidence: taskEvidence,
      comments: taskComments,
      audit: redactTaskAuditForRole(taskAudit, session.role),
      dependencies: { predecessors, successors },
      pullRequest: pullRequest ? pullRequestView(pullRequest) : null,
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
    const { row: updated, intents } = await db.transaction(async tx => {
      const [current] = await tx.select().from(tasks).where(eq(tasks.id, id)).for('update');
      await requireProjectAccess(session, current.spaceId, 'write', tx);
      await validateTaskReferences(current.spaceId, input, tx);
      if (!Object.keys(input).length) return { row: current, intents: [] };

      // El sprint destino debe ser del mismo proyecto y no estar cerrado.
      let newSprintName: string | null = null;
      if (input.sprintId) {
        const [target] = await tx
          .select({ id: sprints.id, name: sprints.name, status: sprints.status })
          .from(sprints)
          .where(and(eq(sprints.id, input.sprintId), eq(sprints.spaceId, current.spaceId)))
          .limit(1);
        if (!target) throw Object.assign(new Error('El sprint no pertenece al proyecto'), { httpStatus: 400 });
        if (target.status === 'cerrado') throw Object.assign(new Error('El sprint está cerrado'), { httpStatus: 409 });
        newSprintName = target.name;
      }

      const [row] = await tx.update(tasks).set(input).where(eq(tasks.id, id)).returning();
      if (input.dueDate !== undefined && input.dueDate !== current.dueDate) {
        await logAudit({ actorId: session.id, action: 'due_date_changed', taskId: id,
          previousValue: current.dueDate ?? undefined, newValue: input.dueDate ?? undefined }, tx);
      }
      if (input.responsibleId && input.responsibleId !== current.responsibleId) {
        await logAudit({ actorId: session.id, action: 'responsible_changed', taskId: id,
          previousValue: current.responsibleId, newValue: input.responsibleId }, tx);
      }
      if (input.sprintId !== undefined && input.sprintId !== current.sprintId) {
        let previousSprintName: string | null = null;
        if (current.sprintId) {
          const [previous] = await tx.select({ name: sprints.name }).from(sprints)
            .where(eq(sprints.id, current.sprintId)).limit(1);
          previousSprintName = previous?.name ?? null;
        }
        // Valores legibles en la Bitácora: nombres de sprint o «Backlog», nunca UUID.
        // Los ids van en `reason` como referencia interna para el burndown y la velocidad
        // (src/lib/sprint-metrics.ts): la Bitácora y la Actividad no lo muestran.
        await logAudit({ actorId: session.id, action: 'task_sprint_changed', taskId: id, spaceId: current.spaceId,
          previousValue: previousSprintName ?? 'Backlog', newValue: newSprintName ?? 'Backlog',
          reason: JSON.stringify({ from: current.sprintId ?? null, to: input.sprintId ?? null }) }, tx);
      }
      const intents = buildAssignmentNotifications({
        actorId: session.id,
        task: row,
        previous: current,
        notifyReviewer: input.reviewerId !== undefined,
      });
      return { row, intents };
    });

    // Fuera de la transacción: la fila ya no está bloqueada con FOR UPDATE.
    for (const intent of intents) {
      notify(intent).catch(() => {});
    }

    return success(updated);
  } catch (err) {
    return handleError(err);
  }
}
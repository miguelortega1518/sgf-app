import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { tasks } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { canCreateAndAssignTask } from '@/lib/permissions';
import { createTaskSchema } from '@/lib/schemas/task';
import { success, error, handleError } from '@/lib/api-utils';
import { logAudit } from '@/lib/audit';
import { accessibleSpaceIds, requireProjectAccess, assertValidUuid, validateTaskReferences } from '@/lib/project-access';
import { eq, and, asc, ilike, inArray } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const spaceId = searchParams.get('spaceId');
    const responsibleId = searchParams.get('responsibleId');
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const search = searchParams.get('search');

    const conditions = [eq(tasks.archived, false)];
    const allowed = await accessibleSpaceIds(session);
    if (allowed !== null) conditions.push(inArray(tasks.spaceId, allowed));
    if (spaceId) await requireProjectAccess(session, spaceId);
    if (responsibleId) assertValidUuid(responsibleId);
    if (status && !tasks.status.enumValues.includes(status as typeof tasks.status.enumValues[number])) return error('Estado inválido', 400);
    if (priority && !tasks.priority.enumValues.includes(priority as typeof tasks.priority.enumValues[number])) return error('Prioridad inválida', 400);
    if (spaceId) conditions.push(eq(tasks.spaceId, spaceId));
    if (responsibleId) conditions.push(eq(tasks.responsibleId, responsibleId));
    if (status) conditions.push(eq(tasks.status, status as typeof tasks.status.enumValues[number]));
    if (priority) conditions.push(eq(tasks.priority, priority as typeof tasks.priority.enumValues[number]));
    if (search) conditions.push(ilike(tasks.title, `%${search}%`));

    const result = await db
      .select()
      .from(tasks)
      .where(and(...conditions))
      .orderBy(asc(tasks.dueDate));

    return success(result);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!canCreateAndAssignTask(session.role)) {
      return error('Sin permisos para crear tareas', 403);
    }

    const body = await req.json();
    const input = createTaskSchema.parse(body);

    const space = await requireProjectAccess(session, input.spaceId, 'write');

    const reviewerId = input.reviewerId || space.leaderId || null;

    const task = await db.transaction(async tx => {
    await validateTaskReferences(input.spaceId, { ...input, reviewerId }, tx);
    const [task] = await tx.insert(tasks).values({
      spaceId: input.spaceId,
      title: input.title,
      description: input.description,
      responsibleId: input.responsibleId,
      reviewerId,
      creatorId: session.id,
      companyId: input.companyId,
      milestoneId: input.milestoneId,
      dueDate: input.dueDate,
      dueDateOriginal: input.dueDate,
      priority: input.priority,
      requiresApproval: input.requiresApproval,
      requiresEvidence: input.requiresEvidence,
      doneDefinition: input.doneDefinition,
      instructions: input.instructions,
      kind: input.kind,
      estimate: input.estimate ?? null,
      branch: input.branch ?? null,
      prUrl: input.prUrl ?? null,
      labels: input.labels ?? [],
    }).returning();

    await logAudit({
      actorId: session.id,
      action: 'task_created',
      taskId: task.id,
      spaceId: input.spaceId,
      newValue: JSON.stringify({ title: task.title, responsible: task.responsibleId }),
    }, tx);
    return task;
    });

    return success(task, 201);
  } catch (err) {
    return handleError(err);
  }
}

import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { tasks, spaces } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { canCreateAndAssignTask } from '@/lib/permissions';
import { createTaskSchema } from '@/lib/schemas/task';
import { success, error, handleError } from '@/lib/api-utils';
import { logAudit } from '@/lib/audit';
import { eq, and, or, ne, isNull, asc } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const spaceId = searchParams.get('spaceId');
    const responsibleId = searchParams.get('responsibleId');

    const conditions = [eq(tasks.archived, false)];
    if (spaceId) conditions.push(eq(tasks.spaceId, spaceId));
    if (responsibleId) conditions.push(eq(tasks.responsibleId, responsibleId));

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

    const [space] = await db
      .select()
      .from(spaces)
      .where(eq(spaces.id, input.spaceId))
      .limit(1);

    if (!space) return error('Espacio no encontrado', 404);

    const [task] = await db.insert(tasks).values({
      spaceId: input.spaceId,
      title: input.title,
      description: input.description,
      responsibleId: input.responsibleId,
      reviewerId: input.reviewerId,
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
    }).returning();

    await logAudit({
      actorId: session.id,
      action: 'task_created',
      taskId: task.id,
      spaceId: input.spaceId,
      newValue: JSON.stringify({ title: task.title, responsible: task.responsibleId }),
    });

    return success(task, 201);
  } catch (err) {
    return handleError(err);
  }
}

import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { spaceTemplates, taskTemplates, templateDependencies, companies, persons } from '@/lib/db/schema';
import { requireRole } from '@/lib/auth';
import { updateSpaceTemplateSchema } from '@/lib/schemas/template';
import { success, error, handleError } from '@/lib/api-utils';
import { eq, asc, inArray } from 'drizzle-orm';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireRole('admin');
    const { id } = await params;

    const [template] = await db
      .select()
      .from(spaceTemplates)
      .where(eq(spaceTemplates.id, id))
      .limit(1);

    if (!template) return error('Plantilla no encontrada', 404);

    const tasks = await db
      .select({
        id: taskTemplates.id,
        taskName: taskTemplates.taskName,
        companyId: taskTemplates.companyId,
        companyName: companies.name,
        order: taskTemplates.order,
        businessDayLimit: taskTemplates.businessDayLimit,
        defaultResponsibleId: taskTemplates.defaultResponsibleId,
        responsibleName: persons.name,
        alternateId: taskTemplates.alternateId,
        reviewerId: taskTemplates.reviewerId,
        requiresApproval: taskTemplates.requiresApproval,
        requiresEvidence: taskTemplates.requiresEvidence,
        instructions: taskTemplates.instructions,
        doneDefinition: taskTemplates.doneDefinition,
        applies: taskTemplates.applies,
        notApplicableReason: taskTemplates.notApplicableReason,
        active: taskTemplates.active,
      })
      .from(taskTemplates)
      .leftJoin(companies, eq(taskTemplates.companyId, companies.id))
      .leftJoin(persons, eq(taskTemplates.defaultResponsibleId, persons.id))
      .where(eq(taskTemplates.spaceTemplateId, id))
      .orderBy(asc(taskTemplates.order));

    const taskIds = tasks.map(t => t.id);
    let dependencies: { templateId: string; predecessorId: string }[] = [];
    if (taskIds.length > 0) {
      dependencies = await db
        .select()
        .from(templateDependencies)
        .where(inArray(templateDependencies.templateId, taskIds));
    }

    return success({ template, tasks, dependencies });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireRole('admin');
    const { id } = await params;
    const body = await req.json();
    const input = updateSpaceTemplateSchema.parse(body);

    const [updated] = await db
      .update(spaceTemplates)
      .set(input)
      .where(eq(spaceTemplates.id, id))
      .returning();

    if (!updated) return error('Plantilla no encontrada', 404);

    return success(updated);
  } catch (err) {
    return handleError(err);
  }
}

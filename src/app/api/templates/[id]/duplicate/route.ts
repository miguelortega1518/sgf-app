import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { spaceTemplates, taskTemplates, templateDependencies } from '@/lib/db/schema';
import { requireRole } from '@/lib/auth';
import { success, error, handleError } from '@/lib/api-utils';
import { eq, inArray } from 'drizzle-orm';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireRole('admin');
    const { id } = await params;

    const [source] = await db.select().from(spaceTemplates)
      .where(eq(spaceTemplates.id, id)).limit(1);
    if (!source) return error('Plantilla no encontrada', 404);

    const sourceTasks = await db.select().from(taskTemplates)
      .where(eq(taskTemplates.spaceTemplateId, id));

    const sourceTaskIds = sourceTasks.map(t => t.id);
    let sourceDeps: { templateId: string; predecessorId: string }[] = [];
    if (sourceTaskIds.length > 0) {
      sourceDeps = await db.select().from(templateDependencies)
        .where(inArray(templateDependencies.templateId, sourceTaskIds));
    }

    const [newTemplate] = await db.insert(spaceTemplates).values({
      name: `${source.name} (copia)`,
      periodicity: source.periodicity,
      targetCycleDays: source.targetCycleDays,
      autoGenerate: false,
      active: source.active,
    }).returning();

    const idMap = new Map<string, string>();
    for (const task of sourceTasks) {
      const [newTask] = await db.insert(taskTemplates).values({
        spaceTemplateId: newTemplate.id,
        companyId: task.companyId,
        taskName: task.taskName,
        order: task.order,
        businessDayLimit: task.businessDayLimit,
        defaultResponsibleId: task.defaultResponsibleId,
        alternateId: task.alternateId,
        reviewerId: task.reviewerId,
        requiresApproval: task.requiresApproval,
        requiresEvidence: task.requiresEvidence,
        instructions: task.instructions,
        doneDefinition: task.doneDefinition,
        applies: task.applies,
        notApplicableReason: task.notApplicableReason,
        active: task.active,
      }).returning();
      idMap.set(task.id, newTask.id);
    }

    for (const dep of sourceDeps) {
      const newTplId = idMap.get(dep.templateId);
      const newPredId = idMap.get(dep.predecessorId);
      if (newTplId && newPredId) {
        await db.insert(templateDependencies).values({
          templateId: newTplId,
          predecessorId: newPredId,
        });
      }
    }

    return success(newTemplate, 201);
  } catch (err) {
    return handleError(err);
  }
}

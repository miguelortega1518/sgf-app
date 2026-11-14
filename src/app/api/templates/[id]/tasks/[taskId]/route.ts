import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { spaceTemplates, taskTemplates, templateDependencies } from '@/lib/db/schema';
import { requireRole } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { assertValidUuid } from '@/lib/project-access';
import { updateTaskTemplateSchema } from '@/lib/schemas/template';
import { describeTaskTemplateChanges, templateTaskLabel } from '@/lib/template-audit';
import { success, error, handleError } from '@/lib/api-utils';
import { and, eq, or } from 'drizzle-orm';

function taskOfTemplate(id: string, taskId: string) {
  return and(eq(taskTemplates.id, taskId), eq(taskTemplates.spaceTemplateId, id));
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    const session = await requireRole('admin');
    const { id, taskId } = await params;
    assertValidUuid(id, 'ID de plantilla');
    assertValidUuid(taskId, 'ID de tarea de plantilla');
    const body = await req.json();
    const input = updateTaskTemplateSchema.parse(body);

    const updated = await db.transaction(async tx => {
      const [current] = await tx
        .select({
          taskName: taskTemplates.taskName,
          order: taskTemplates.order,
          businessDayLimit: taskTemplates.businessDayLimit,
          requiresApproval: taskTemplates.requiresApproval,
          requiresEvidence: taskTemplates.requiresEvidence,
          applies: taskTemplates.applies,
          instructions: taskTemplates.instructions,
          doneDefinition: taskTemplates.doneDefinition,
          notApplicableReason: taskTemplates.notApplicableReason,
          companyId: taskTemplates.companyId,
          defaultResponsibleId: taskTemplates.defaultResponsibleId,
          alternateId: taskTemplates.alternateId,
          reviewerId: taskTemplates.reviewerId,
          templateName: spaceTemplates.name,
        })
        .from(taskTemplates)
        .innerJoin(spaceTemplates, eq(taskTemplates.spaceTemplateId, spaceTemplates.id))
        .where(taskOfTemplate(id, taskId))
        .limit(1)
        .for('update');
      if (!current) return null;

      const [row] = await tx
        .update(taskTemplates)
        .set(input)
        .where(taskOfTemplate(id, taskId))
        .returning();

      const diff = describeTaskTemplateChanges(current.templateName, current, input);
      if (diff) {
        await logAudit({
          actorId: session.id,
          action: 'template_task_updated',
          previousValue: diff.previousValue,
          newValue: diff.newValue,
        }, tx);
      }
      return row;
    });

    if (!updated) return error('Tarea de plantilla no encontrada', 404);

    return success(updated);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    const session = await requireRole('admin');
    const { id, taskId } = await params;
    assertValidUuid(id, 'ID de plantilla');
    assertValidUuid(taskId, 'ID de tarea de plantilla');

    const deleted = await db.transaction(async tx => {
      const [row] = await tx
        .select({
          id: taskTemplates.id,
          taskName: taskTemplates.taskName,
          templateName: spaceTemplates.name,
        })
        .from(taskTemplates)
        .innerJoin(spaceTemplates, eq(taskTemplates.spaceTemplateId, spaceTemplates.id))
        .where(taskOfTemplate(id, taskId))
        .limit(1)
        .for('update');
      if (!row) return false;

      await tx
        .delete(templateDependencies)
        .where(
          or(
            eq(templateDependencies.templateId, taskId),
            eq(templateDependencies.predecessorId, taskId),
          ),
        );

      await tx.delete(taskTemplates).where(taskOfTemplate(id, taskId));

      await logAudit({
        actorId: session.id,
        action: 'template_task_deleted',
        previousValue: templateTaskLabel(row.templateName, row.taskName),
      }, tx);
      return true;
    });

    if (!deleted) return error('Tarea de plantilla no encontrada', 404);

    return success({ deleted: true });
  } catch (err) {
    return handleError(err);
  }
}

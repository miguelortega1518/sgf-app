import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { taskTemplates, templateDependencies } from '@/lib/db/schema';
import { requireRole } from '@/lib/auth';
import { assertValidUuid } from '@/lib/project-access';
import { updateTaskTemplateSchema } from '@/lib/schemas/template';
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
    await requireRole('admin');
    const { id, taskId } = await params;
    assertValidUuid(id, 'ID de plantilla');
    assertValidUuid(taskId, 'ID de tarea de plantilla');
    const body = await req.json();
    const input = updateTaskTemplateSchema.parse(body);

    const [updated] = await db
      .update(taskTemplates)
      .set(input)
      .where(taskOfTemplate(id, taskId))
      .returning();

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
    await requireRole('admin');
    const { id, taskId } = await params;
    assertValidUuid(id, 'ID de plantilla');
    assertValidUuid(taskId, 'ID de tarea de plantilla');

    const deleted = await db.transaction(async tx => {
      const [row] = await tx
        .select({ id: taskTemplates.id })
        .from(taskTemplates)
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
      return true;
    });

    if (!deleted) return error('Tarea de plantilla no encontrada', 404);

    return success({ deleted: true });
  } catch (err) {
    return handleError(err);
  }
}

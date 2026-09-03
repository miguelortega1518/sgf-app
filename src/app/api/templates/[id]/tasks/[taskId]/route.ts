import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { taskTemplates, templateDependencies } from '@/lib/db/schema';
import { requireRole } from '@/lib/auth';
import { updateTaskTemplateSchema } from '@/lib/schemas/template';
import { success, error, handleError } from '@/lib/api-utils';
import { eq, or } from 'drizzle-orm';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    await requireRole('admin');
    const { taskId } = await params;
    const body = await req.json();
    const input = updateTaskTemplateSchema.parse(body);

    const [updated] = await db
      .update(taskTemplates)
      .set(input)
      .where(eq(taskTemplates.id, taskId))
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
    const { taskId } = await params;

    await db
      .delete(templateDependencies)
      .where(
        or(
          eq(templateDependencies.templateId, taskId),
          eq(templateDependencies.predecessorId, taskId),
        ),
      );

    const [deleted] = await db
      .delete(taskTemplates)
      .where(eq(taskTemplates.id, taskId))
      .returning();

    if (!deleted) return error('Tarea de plantilla no encontrada', 404);

    return success({ deleted: true });
  } catch (err) {
    return handleError(err);
  }
}

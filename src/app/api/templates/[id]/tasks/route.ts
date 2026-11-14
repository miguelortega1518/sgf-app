import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { spaceTemplates, taskTemplates } from '@/lib/db/schema';
import { requireRole } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { assertValidUuid } from '@/lib/project-access';
import { createTaskTemplateSchema } from '@/lib/schemas/template';
import { templateTaskLabel } from '@/lib/template-audit';
import { success, error, handleError } from '@/lib/api-utils';
import { eq } from 'drizzle-orm';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireRole('admin');
    const { id: spaceTemplateId } = await params;
    assertValidUuid(spaceTemplateId, 'ID de plantilla');
    const body = await req.json();
    const input = createTaskTemplateSchema.parse(body);

    const taskTemplate = await db.transaction(async tx => {
      const [template] = await tx
        .select({ id: spaceTemplates.id, name: spaceTemplates.name })
        .from(spaceTemplates)
        .where(eq(spaceTemplates.id, spaceTemplateId))
        .limit(1);
      if (!template) return null;

      const [row] = await tx
        .insert(taskTemplates)
        .values({
          ...input,
          spaceTemplateId,
          companyId: input.companyId ?? null,
          defaultResponsibleId: input.defaultResponsibleId ?? null,
          alternateId: input.alternateId ?? null,
          reviewerId: input.reviewerId ?? null,
          instructions: input.instructions ?? null,
          doneDefinition: input.doneDefinition ?? null,
          notApplicableReason: input.notApplicableReason ?? null,
        })
        .returning();

      await logAudit({
        actorId: session.id,
        action: 'template_task_created',
        newValue: templateTaskLabel(template.name, row.taskName),
      }, tx);
      return row;
    });

    if (!taskTemplate) return error('Plantilla no encontrada', 404);

    return success(taskTemplate, 201);
  } catch (err) {
    return handleError(err);
  }
}

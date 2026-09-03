import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { taskTemplates, templateDependencies } from '@/lib/db/schema';
import { requireRole } from '@/lib/auth';
import { createTaskTemplateSchema } from '@/lib/schemas/template';
import { success, error, handleError } from '@/lib/api-utils';
import { eq, asc } from 'drizzle-orm';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireRole('admin');
    const { id: spaceTemplateId } = await params;
    const body = await req.json();
    const input = createTaskTemplateSchema.parse(body);

    const [taskTemplate] = await db
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

    return success(taskTemplate, 201);
  } catch (err) {
    return handleError(err);
  }
}

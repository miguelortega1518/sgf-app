import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { spaceTemplates, taskTemplates, companies, persons } from '@/lib/db/schema';
import { requireRole } from '@/lib/auth';
import { createSpaceTemplateSchema } from '@/lib/schemas/template';
import { success, error, handleError } from '@/lib/api-utils';
import { eq, asc, count } from 'drizzle-orm';

export async function GET() {
  try {
    await requireRole('admin');

    const templates = await db
      .select({
        id: spaceTemplates.id,
        name: spaceTemplates.name,
        periodicity: spaceTemplates.periodicity,
        targetCycleDays: spaceTemplates.targetCycleDays,
        autoGenerate: spaceTemplates.autoGenerate,
        active: spaceTemplates.active,
        createdAt: spaceTemplates.createdAt,
        taskCount: count(taskTemplates.id),
      })
      .from(spaceTemplates)
      .leftJoin(taskTemplates, eq(taskTemplates.spaceTemplateId, spaceTemplates.id))
      .groupBy(spaceTemplates.id)
      .orderBy(asc(spaceTemplates.name));

    return success(templates);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireRole('admin');
    const body = await req.json();
    const input = createSpaceTemplateSchema.parse(body);

    const [template] = await db
      .insert(spaceTemplates)
      .values(input)
      .returning();

    return success(template, 201);
  } catch (err) {
    return handleError(err);
  }
}

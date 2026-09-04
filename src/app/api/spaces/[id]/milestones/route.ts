import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { milestones, tasks } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { success, error, handleError } from '@/lib/api-utils';
import { eq, asc, count } from 'drizzle-orm';
import { z } from 'zod';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id } = await params;

    const rows = await db
      .select()
      .from(milestones)
      .where(eq(milestones.spaceId, id))
      .orderBy(asc(milestones.order));

    const taskCounts = await db
      .select({ milestoneId: tasks.milestoneId, total: count() })
      .from(tasks)
      .where(eq(tasks.spaceId, id))
      .groupBy(tasks.milestoneId);

    const countMap = new Map(taskCounts.map(tc => [tc.milestoneId, Number(tc.total)]));

    return success(rows.map(m => ({ ...m, taskCount: countMap.get(m.id) || 0 })));
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    if (session.role === 'observador') return error('Sin permisos', 403);
    const { id } = await params;
    const body = await req.json();
    const input = z.object({
      name: z.string().min(1).max(200),
      targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(body);

    const existing = await db.select({ order: milestones.order }).from(milestones)
      .where(eq(milestones.spaceId, id)).orderBy(asc(milestones.order));
    const order = existing.length > 0 ? existing[existing.length - 1].order + 1 : 0;

    const [milestone] = await db.insert(milestones).values({
      spaceId: id,
      name: input.name,
      targetDate: input.targetDate,
      targetDateOriginal: input.targetDate,
      order,
    }).returning();

    return success(milestone, 201);
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();
    if (session.role === 'observador') return error('Sin permisos', 403);
    const body = await req.json();
    const { milestoneId, ...updates } = z.object({
      milestoneId: z.string().uuid(),
      name: z.string().min(1).max(200).optional(),
      targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      completed: z.boolean().optional(),
      order: z.number().int().min(0).optional(),
    }).parse(body);

    const setValues: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.name !== undefined) setValues.name = updates.name;
    if (updates.targetDate !== undefined) setValues.targetDate = updates.targetDate;
    if (updates.completed !== undefined) setValues.completed = updates.completed;
    if (updates.order !== undefined) setValues.order = updates.order;

    const [updated] = await db.update(milestones)
      .set(setValues)
      .where(eq(milestones.id, milestoneId))
      .returning();
    if (!updated) return error('Hito no encontrado', 404);

    return success(updated);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireSession();
    if (session.role === 'observador') return error('Sin permisos', 403);
    const body = await req.json();
    const { milestoneId } = z.object({ milestoneId: z.string().uuid() }).parse(body);

    await db.update(tasks).set({ milestoneId: null }).where(eq(tasks.milestoneId, milestoneId));
    await db.delete(milestones).where(eq(milestones.id, milestoneId));

    return success({ deleted: true });
  } catch (err) {
    return handleError(err);
  }
}

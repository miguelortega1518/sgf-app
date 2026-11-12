import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { milestones, tasks } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { success, error, handleError } from '@/lib/api-utils';
import { eq, asc, count, and } from 'drizzle-orm';
import { z } from 'zod';
import { requireProjectAccess } from '@/lib/project-access';
import { isValidIsoDate } from '@/lib/validation';
import { logAudit } from '@/lib/audit';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    await requireProjectAccess(session, id);

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
    await requireProjectAccess(session, id, 'write');
    const body = await req.json();
    const input = z.object({
      name: z.string().trim().min(1).max(200),
      targetDate: z.string().refine(isValidIsoDate, 'Fecha inválida'),
    }).parse(body);

    const milestone = await db.transaction(async tx => {
      const existing = await tx.select({ order: milestones.order }).from(milestones)
        .where(eq(milestones.spaceId, id)).orderBy(asc(milestones.order));
      const order = existing.length > 0 ? existing[existing.length - 1].order + 1 : 0;

      const [created] = await tx.insert(milestones).values({
        spaceId: id,
        name: input.name,
        targetDate: input.targetDate,
        targetDateOriginal: input.targetDate,
        order,
      }).returning();

      await logAudit({
        actorId: session.id,
        action: 'milestone_created',
        spaceId: id,
        newValue: `${created.name}: ${created.targetDate}`,
      }, tx);

      return created;
    });

    return success(milestone, 201);
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    if (session.role === 'observador') return error('Sin permisos', 403);
    const { id } = await params;
    await requireProjectAccess(session, id, 'write');
    const body = await req.json();
    const { milestoneId, ...updates } = z.object({
      milestoneId: z.string().uuid(),
      name: z.string().trim().min(1).max(200).optional(),
      targetDate: z.string().refine(isValidIsoDate, 'Fecha inválida').optional(),
      completed: z.boolean().optional(),
      order: z.number().int().min(0).optional(),
    }).parse(body);

    const setValues: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.name !== undefined) setValues.name = updates.name;
    if (updates.targetDate !== undefined) setValues.targetDate = updates.targetDate;
    if (updates.completed !== undefined) setValues.completed = updates.completed;
    if (updates.order !== undefined) setValues.order = updates.order;

    const updated = await db.transaction(async tx => {
      const [current] = await tx.select().from(milestones)
        .where(and(eq(milestones.id, milestoneId), eq(milestones.spaceId, id)))
        .for('update');
      if (!current) throw Object.assign(new Error('Hito no encontrado'), { httpStatus: 404 });

      const [row] = await tx.update(milestones)
        .set(setValues)
        .where(and(eq(milestones.id, milestoneId), eq(milestones.spaceId, id)))
        .returning();

      // Un registro por campo que cambia de verdad. `order` no se audita: la
      // reordenación es un cambio de presentación, no de contenido del hito.
      if (updates.name !== undefined && updates.name !== current.name) {
        await logAudit({
          actorId: session.id,
          action: 'milestone_renamed',
          spaceId: id,
          previousValue: current.name,
          newValue: updates.name,
        }, tx);
      }

      // Fechas 'YYYY-MM-DD' (date mode 'string'): la comparación directa es válida.
      // Se usa el nombre previo en ambos valores para que la Bitácora se lea igual.
      if (updates.targetDate !== undefined && updates.targetDate !== current.targetDate) {
        await logAudit({
          actorId: session.id,
          action: 'milestone_date_changed',
          spaceId: id,
          previousValue: `${current.name}: ${current.targetDate}`,
          newValue: `${current.name}: ${updates.targetDate}`,
        }, tx);
      }

      if (updates.completed !== undefined && updates.completed !== current.completed) {
        await logAudit({
          actorId: session.id,
          action: 'milestone_completion_changed',
          spaceId: id,
          previousValue: `${current.name}: ${current.completed ? 'completado' : 'pendiente'}`,
          newValue: `${current.name}: ${updates.completed ? 'completado' : 'pendiente'}`,
        }, tx);
      }

      return row;
    });

    return success(updated);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    if (session.role === 'observador') return error('Sin permisos', 403);
    const { id } = await params;
    await requireProjectAccess(session, id, 'write');
    const body = await req.json();
    const { milestoneId } = z.object({ milestoneId: z.string().uuid() }).parse(body);

    await db.transaction(async tx => {
      const [milestone] = await tx.select().from(milestones).where(and(eq(milestones.id, milestoneId), eq(milestones.spaceId, id))).for('update');
      if (!milestone) throw Object.assign(new Error('Hito no encontrado'), { httpStatus: 404 });
      await tx.update(tasks).set({ milestoneId: null }).where(and(eq(tasks.milestoneId, milestoneId), eq(tasks.spaceId, id)));
      await tx.delete(milestones).where(eq(milestones.id, milestoneId));
      await logAudit({
        actorId: session.id,
        action: 'milestone_deleted',
        spaceId: id,
        previousValue: `${milestone.name}: ${milestone.targetDate}`,
      }, tx);
    });

    return success({ deleted: true });
  } catch (err) {
    return handleError(err);
  }
}

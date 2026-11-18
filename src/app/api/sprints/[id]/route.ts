import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { sprints } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { success, error, handleError } from '@/lib/api-utils';
import { and, eq, ne } from 'drizzle-orm';
import { assertValidUuid, requireProjectAccess } from '@/lib/project-access';
import { SPRINT_DATES_MESSAGE, updateSprintSchema } from '@/lib/schemas/sprint';
import { canTransitionSprint, isValidSprintRange } from '@/lib/sprints';
import { SPRINT_STATUS_LABEL } from '@/lib/labels';
import { logAudit } from '@/lib/audit';

function httpError(message: string, httpStatus: number) {
  return Object.assign(new Error(message), { httpStatus });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    if (session.role === 'observador') return error('Sin permisos', 403);
    const { id } = await params;
    assertValidUuid(id, 'ID de sprint');
    const input = updateSprintSchema.parse(await req.json());
    // Un objetivo vacío equivale a «sin objetivo» (null), igual que al crear.
    const goal = input.goal === undefined ? undefined : (input.goal?.trim() || null);

    const [sprint] = await db.select().from(sprints).where(eq(sprints.id, id)).limit(1);
    if (!sprint) return error('Sprint no encontrado', 404);
    const spaceId = sprint.spaceId;
    await requireProjectAccess(session, spaceId, 'write');

    const updated = await db.transaction(async tx => {
      const [current] = await tx.select().from(sprints)
        .where(and(eq(sprints.id, id), eq(sprints.spaceId, spaceId)))
        .for('update');
      if (!current) throw httpError('Sprint no encontrado', 404);
      if (current.status === 'cerrado') throw httpError('El sprint está cerrado', 409);

      const nextStatus = input.status;
      if (nextStatus !== undefined) {
        if (!canTransitionSprint(current.status, nextStatus)) {
          throw httpError('Transición de sprint no permitida', 409);
        }
        if (nextStatus === 'activo') {
          const [otherActive] = await tx.select({ id: sprints.id }).from(sprints)
            .where(and(eq(sprints.spaceId, spaceId), eq(sprints.status, 'activo'), ne(sprints.id, id)))
            .limit(1);
          if (otherActive) throw httpError('Ya hay un sprint activo en este proyecto', 409);
        }
      }

      const startDate = input.startDate ?? current.startDate;
      const endDate = input.endDate ?? current.endDate;
      if (!isValidSprintRange(startDate, endDate)) throw httpError(SPRINT_DATES_MESSAGE, 400);

      const setValues: Partial<typeof sprints.$inferInsert> = { updatedAt: new Date() };
      if (input.name !== undefined) setValues.name = input.name;
      if (goal !== undefined) setValues.goal = goal;
      if (input.startDate !== undefined) setValues.startDate = input.startDate;
      if (input.endDate !== undefined) setValues.endDate = input.endDate;
      if (nextStatus !== undefined) setValues.status = nextStatus;

      // Cerrar sólo cambia el estado del sprint: sus tareas no se tocan.
      const [row] = await tx.update(sprints)
        .set(setValues)
        .where(and(eq(sprints.id, id), eq(sprints.spaceId, spaceId)))
        .returning();

      // Auditoría de proyecto (sin taskId): un registro por cambio real.
      if (nextStatus !== undefined) {
        const isStart = nextStatus === 'activo';
        await logAudit({
          actorId: session.id,
          action: isStart ? 'sprint_started' : 'sprint_closed',
          spaceId,
          previousValue: `${current.name}: ${SPRINT_STATUS_LABEL[current.status]}`,
          newValue: `${current.name}: ${SPRINT_STATUS_LABEL[nextStatus]}`,
        }, tx);
      }

      if (input.name !== undefined && input.name !== current.name) {
        await logAudit({
          actorId: session.id,
          action: 'sprint_updated',
          spaceId,
          previousValue: `Nombre: ${current.name}`,
          newValue: `Nombre: ${input.name}`,
        }, tx);
      }

      // Fechas 'YYYY-MM-DD': la comparación de cadenas es válida.
      if (startDate !== current.startDate || endDate !== current.endDate) {
        await logAudit({
          actorId: session.id,
          action: 'sprint_updated',
          spaceId,
          previousValue: `${current.name}: ${current.startDate} → ${current.endDate}`,
          newValue: `${row.name}: ${startDate} → ${endDate}`,
        }, tx);
      }

      if (goal !== undefined && goal !== (current.goal || null)) {
        await logAudit({
          actorId: session.id,
          action: 'sprint_updated',
          spaceId,
          previousValue: `${current.name} · Objetivo: ${current.goal || 'sin objetivo'}`,
          newValue: `${row.name} · Objetivo: ${goal || 'sin objetivo'}`,
        }, tx);
      }

      return row;
    });

    return success(updated);
  } catch (err) {
    return handleError(err);
  }
}

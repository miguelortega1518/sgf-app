import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { persons, spaceMembers, sprintCapacity, sprints, tasks } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { success, error, handleError } from '@/lib/api-utils';
import { and, eq } from 'drizzle-orm';
import { assertValidUuid, requireProjectAccess } from '@/lib/project-access';
import { sprintCapacitySchema } from '@/lib/schemas/sprint-capacity';
import { capacityAuditValue } from '@/lib/sprint-capacity';
import { logAudit } from '@/lib/audit';

function httpError(message: string, httpStatus: number) {
  return Object.assign(new Error(message), { httpStatus });
}

/**
 * Guarda la capacidad (puntos) de una persona en un sprint planificado o activo.
 * `points: null` borra el valor guardado y la capacidad vuelve a la de por defecto.
 * La persona debe ser miembro no observador del proyecto o responsable de una tarea del sprint.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    if (session.role === 'observador') return error('Sin permisos', 403);
    const { id } = await params;
    assertValidUuid(id, 'ID de sprint');
    const input = sprintCapacitySchema.parse(await req.json());

    const [sprint] = await db.select().from(sprints).where(eq(sprints.id, id)).limit(1);
    if (!sprint) return error('Sprint no encontrado', 404);
    const spaceId = sprint.spaceId;
    await requireProjectAccess(session, spaceId, 'write');

    const saved = await db.transaction(async tx => {
      const [current] = await tx.select().from(sprints)
        .where(and(eq(sprints.id, id), eq(sprints.spaceId, spaceId)))
        .for('update');
      if (!current) throw httpError('Sprint no encontrado', 404);
      if (current.status === 'cerrado') throw httpError('El sprint está cerrado', 409);

      // Miembro no observador del proyecto o, si no, responsable de una tarea del sprint.
      const [membership] = await tx
        .select({ name: persons.name, spaceRole: spaceMembers.spaceRole })
        .from(spaceMembers)
        .innerJoin(persons, eq(spaceMembers.personId, persons.id))
        .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.personId, input.personId)))
        .limit(1);
      let personName = membership && membership.spaceRole !== 'observador' ? membership.name : null;
      if (personName === null) {
        const [responsible] = await tx
          .select({ name: persons.name })
          .from(tasks)
          .innerJoin(persons, eq(tasks.responsibleId, persons.id))
          .where(and(eq(tasks.sprintId, id), eq(tasks.responsibleId, input.personId), eq(tasks.archived, false)))
          .limit(1);
        personName = responsible?.name ?? null;
      }
      if (personName === null) throw httpError('La persona no participa en este proyecto ni en el sprint', 400);

      const result = { sprintId: id, personId: input.personId, points: input.points };
      const where = and(eq(sprintCapacity.sprintId, id), eq(sprintCapacity.personId, input.personId));

      if (input.points === null) {
        // Idempotente: sin fila no hay nada que auditar.
        const [deleted] = await tx.delete(sprintCapacity).where(where).returning();
        if (!deleted) return result;
        await logAudit({
          actorId: session.id,
          action: 'sprint_capacity_changed',
          spaceId,
          previousValue: capacityAuditValue(current.name, personName, deleted.points),
          newValue: capacityAuditValue(current.name, personName, null),
        }, tx);
        return result;
      }

      // La fila del sprint ya está bloqueada (FOR UPDATE): sus capacidades no cambian en paralelo.
      const [existing] = await tx.select({ points: sprintCapacity.points }).from(sprintCapacity).where(where).limit(1);
      const previous = existing?.points ?? null;
      if (previous === input.points) return result;

      await tx.insert(sprintCapacity)
        .values({ sprintId: id, personId: input.personId, points: input.points })
        .onConflictDoUpdate({
          target: [sprintCapacity.sprintId, sprintCapacity.personId],
          set: { points: input.points, updatedAt: new Date() },
        })
        .returning();

      await logAudit({
        actorId: session.id,
        action: 'sprint_capacity_changed',
        spaceId,
        previousValue: capacityAuditValue(current.name, personName, previous),
        newValue: capacityAuditValue(current.name, personName, input.points),
      }, tx);
      return result;
    });

    return success(saved);
  } catch (err) {
    return handleError(err);
  }
}

import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { holidays, persons, sprints, tasks, type Sprint } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { success, error, handleError } from '@/lib/api-utils';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { assertValidUuid, requireProjectAccess } from '@/lib/project-access';
import { SPRINT_DATES_MESSAGE, updateSprintSchema } from '@/lib/schemas/sprint';
import { canTransitionSprint, isValidSprintRange, nextPlannedSprint } from '@/lib/sprints';
import { SPRINT_STATUS_LABEL } from '@/lib/labels';
import { logAudit } from '@/lib/audit';
import { todayRD } from '@/lib/date-utils';
import { buildStatusHistory } from '@/lib/status-history';
import { loadStatusEvents } from '@/lib/status-history-query';
import { loadSprintChangeEvents } from '@/lib/sprint-history-query';
import { sprintChangeReason } from '@/lib/sprint-history';
import { buildSprintSummary, type SprintSummary } from '@/lib/sprint-summary';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const BACKLOG_LABEL = 'Backlog';

function httpError(message: string, httpStatus: number) {
  return Object.assign(new Error(message), { httpStatus });
}

/**
 * Destino de las tareas no terminadas: 'backlog' → null; un uuid → ese sprint si es
 * del proyecto y está planificado; sin indicar → el siguiente planificado o el backlog.
 * El destino se bloquea FOR UPDATE. Los errores se lanzan antes de cualquier escritura.
 */
async function resolveCarryTarget(
  tx: Tx,
  sprint: Sprint,
  carryOverTo: string | undefined,
): Promise<{ sprintId: string | null; name: string }> {
  if (carryOverTo === 'backlog') return { sprintId: null, name: BACKLOG_LABEL };

  if (carryOverTo !== undefined) {
    const [target] = await tx.select().from(sprints).where(eq(sprints.id, carryOverTo)).for('update');
    if (!target || target.spaceId !== sprint.spaceId) {
      throw httpError('El sprint de destino no pertenece a este proyecto', 400);
    }
    if (target.status !== 'planificado') throw httpError('El sprint de destino debe estar planificado', 409);
    return { sprintId: target.id, name: target.name };
  }

  const planned = await tx.select().from(sprints)
    .where(and(eq(sprints.spaceId, sprint.spaceId), eq(sprints.status, 'planificado')))
    .for('update');
  const next = nextPlannedSprint(planned);
  return next ? { sprintId: next.id, name: next.name } : { sprintId: null, name: BACKLOG_LABEL };
}

/**
 * Cierre de un sprint dentro del tx: mueve sus tareas no archivadas y no
 * completadas al destino (un único update + un task_sprint_changed por tarea) y
 * devuelve la retrospectiva calculada sobre el alcance ANTES de moverlas.
 */
async function carryOverAndSummarize(
  tx: Tx,
  { sprint, carryOverTo, businessDaysOnly, actorId, now }: {
    sprint: Sprint;
    carryOverTo: string | undefined;
    businessDaysOnly: boolean;
    actorId: string;
    now: Date;
  },
): Promise<SprintSummary> {
  const target = await resolveCarryTarget(tx, sprint, carryOverTo);
  const inSprint = and(eq(tasks.sprintId, sprint.id), eq(tasks.archived, false));

  // Bloquea las pendientes antes de leer el alcance.
  const pending = await tx.select({ id: tasks.id }).from(tasks)
    .where(and(inSprint, ne(tasks.status, 'completada')))
    .for('update');
  const pendingIds = pending.map(t => t.id);

  const scope = await tx
    .select({
      id: tasks.id,
      status: tasks.status,
      estimate: tasks.estimate,
      responsibleId: tasks.responsibleId,
      responsibleName: persons.name,
      blockedByArea: tasks.blockedByArea,
      createdAt: tasks.createdAt,
      completedAt: tasks.completedAt,
    })
    .from(tasks)
    .innerJoin(persons, eq(tasks.responsibleId, persons.id))
    .where(inSprint);
  const scopeIds = scope.map(t => t.id);

  const holidaySet = businessDaysOnly
    ? new Set((await tx.select({ date: holidays.date }).from(holidays)).map(h => h.date))
    : new Set<string>();

  const statusEvents = await loadStatusEvents(scopeIds, tx);
  const sprintEvents = await loadSprintChangeEvents(scopeIds, sprint.spaceId, tx);
  const statusHistories = new Map(scope.map(t => [t.id, buildStatusHistory(t, statusEvents.get(t.id) ?? [])]));

  const summary = buildSprintSummary({
    sprint: { id: sprint.id, name: sprint.name, startDate: sprint.startDate, startedAt: sprint.startedAt },
    scope,
    carryTarget: target,
    sprintEvents,
    statusHistories,
    businessDaysOnly,
    holidays: holidaySet,
    closedOn: todayRD(),
  });

  if (pendingIds.length > 0) {
    await tx.update(tasks)
      .set({ sprintId: target.sprintId, updatedAt: now })
      .where(and(inArray(tasks.id, pendingIds), eq(tasks.sprintId, sprint.id)));
    // Valores legibles (nombres o «Backlog»); los ids van en reason para la retrospectiva.
    for (const taskId of pendingIds) {
      await logAudit({
        actorId,
        action: 'task_sprint_changed',
        taskId,
        spaceId: sprint.spaceId,
        previousValue: sprint.name,
        newValue: target.name,
        reason: sprintChangeReason(sprint.id, target.sprintId),
      }, tx);
    }
  }

  return summary;
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
    const space = await requireProjectAccess(session, spaceId, 'write');

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

      const now = new Date();
      const setValues: Partial<typeof sprints.$inferInsert> = { updatedAt: now };
      if (input.name !== undefined) setValues.name = input.name;
      if (goal !== undefined) setValues.goal = goal;
      if (input.startDate !== undefined) setValues.startDate = input.startDate;
      if (input.endDate !== undefined) setValues.endDate = input.endDate;
      if (nextStatus !== undefined) setValues.status = nextStatus;
      if (nextStatus === 'activo') setValues.startedAt = now;

      // Cerrar: arrastra las tareas no terminadas y guarda la retrospectiva en el
      // mismo update que pone 'cerrado'. Todo dentro de este tx (todo o nada).
      if (nextStatus === 'cerrado') {
        setValues.summary = await carryOverAndSummarize(tx, {
          sprint: current,
          carryOverTo: input.carryOverTo,
          businessDaysOnly: space.businessDaysOnly,
          actorId: session.id,
          now,
        });
      }

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

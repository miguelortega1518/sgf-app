import { NextRequest } from 'next/server';
import { and, eq, gte, lte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { holidays, sprints, tasks } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { success, error, handleError } from '@/lib/api-utils';
import { assertValidUuid, requireProjectAccess } from '@/lib/project-access';
import { buildStatusHistory } from '@/lib/status-history';
import { loadStatusEvents } from '@/lib/status-history-query';
import { loadSprintChangeEvents } from '@/lib/sprint-history-query';
import { buildSprintBurndown, isBurndownCandidate } from '@/lib/sprint-burndown';

/**
 * Burndown de un sprint activo o cerrado (sólo lectura, sin auditoría). Carga en
 * bloque: el sprint, las tareas no archivadas del proyecto (para ver también las
 * que salieron), sus cambios de sprint, los cambios de estado de las candidatas y,
 * si se cuentan días hábiles, los feriados del rango.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    assertValidUuid(id, 'ID de sprint');

    const [sprint] = await db.select().from(sprints).where(eq(sprints.id, id)).limit(1);
    if (!sprint) return error('Sprint no encontrado', 404);
    const space = await requireProjectAccess(session, sprint.spaceId, 'read');
    if (sprint.status === 'planificado') return error('El sprint aún no ha empezado', 409);

    const isClosed = sprint.status === 'cerrado';
    // En los cerrados manda el ajuste guardado al cerrar; sin summary, el del proyecto.
    const savedBusinessDays = isClosed ? sprint.summary?.businessDaysOnly : undefined;
    const businessDaysOnly = typeof savedBusinessDays === 'boolean' ? savedBusinessDays : space.businessDaysOnly;

    const projectTasks = await db
      .select({
        id: tasks.id,
        status: tasks.status,
        estimate: tasks.estimate,
        createdAt: tasks.createdAt,
        completedAt: tasks.completedAt,
        sprintId: tasks.sprintId,
      })
      .from(tasks)
      .where(and(eq(tasks.spaceId, sprint.spaceId), eq(tasks.archived, false)));

    const sprintEvents = await loadSprintChangeEvents(projectTasks.map(t => t.id), sprint.spaceId);
    const candidates = projectTasks.filter(t => isBurndownCandidate(t, sprintEvents.get(t.id) ?? [], sprint));
    const statusEvents = await loadStatusEvents(candidates.map(t => t.id));
    const statusHistories = new Map(candidates.map(t => [t.id, buildStatusHistory(t, statusEvents.get(t.id) ?? [])]));

    const holidaySet = businessDaysOnly
      ? new Set((await db.select({ date: holidays.date }).from(holidays)
        .where(and(gte(holidays.date, sprint.startDate), lte(holidays.date, sprint.endDate)))).map(h => h.date))
      : new Set<string>();

    return success(buildSprintBurndown({
      sprint: {
        id: sprint.id,
        name: sprint.name,
        status: isClosed ? 'cerrado' : 'activo',
        startDate: sprint.startDate,
        endDate: sprint.endDate,
        startedAt: sprint.startedAt,
        // El PATCH rechaza los cerrados con 409: updated_at queda congelado en el cierre.
        closedAt: isClosed ? sprint.updatedAt : null,
      },
      tasks: candidates,
      sprintEvents,
      statusHistories,
      businessDaysOnly,
      holidays: holidaySet,
      now: new Date(),
    }));
  } catch (err) {
    return handleError(err);
  }
}

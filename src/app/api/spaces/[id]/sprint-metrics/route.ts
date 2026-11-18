import { NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sprints, tasks } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { success, handleError } from '@/lib/api-utils';
import { assertValidUuid, requireProjectAccess } from '@/lib/project-access';
import { buildStatusHistory, type StatusSegment } from '@/lib/status-history';
import { loadStatusEvents } from '@/lib/status-history-query';
import { loadSprintEvents } from '@/lib/sprint-history-query';
import { projectSprintMetrics } from '@/lib/sprint-metrics';

/**
 * Burndown del sprint activo y de los cerrados, y velocidad de los últimos sprints
 * cerrados. Sólo lectura: se reconstruye en cada GET desde audit_log y tasks, con
 * los eventos cargados en bloque (nunca una consulta por tarea).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    assertValidUuid(id, 'ID de proyecto');
    await requireProjectAccess(session, id, 'read');

    const sprintRows = await db.select().from(sprints).where(eq(sprints.spaceId, id));

    // Las tareas archivadas no cuentan ni en el burndown ni en la velocidad.
    const taskRows = await db
      .select({
        id: tasks.id,
        status: tasks.status,
        estimate: tasks.estimate,
        sprintId: tasks.sprintId,
        createdAt: tasks.createdAt,
        completedAt: tasks.completedAt,
      })
      .from(tasks)
      .where(and(eq(tasks.spaceId, id), eq(tasks.archived, false)));

    const sprintEvents = await loadSprintEvents(id);

    // Sólo interesan las tareas que están o estuvieron en algún sprint.
    const relevant = taskRows.filter(t => t.sprintId !== null || sprintEvents.has(t.id));
    const statusEvents = await loadStatusEvents(relevant.map(t => t.id));
    const statusHistories = new Map<string, StatusSegment[]>(
      relevant.map(t => [t.id, buildStatusHistory(t, statusEvents.get(t.id) ?? [])]),
    );

    return success(projectSprintMetrics({
      sprints: sprintRows,
      tasks: relevant,
      statusHistories,
      sprintEvents,
      now: new Date(),
    }));
  } catch (err) {
    return handleError(err);
  }
}

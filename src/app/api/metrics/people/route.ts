import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tasks, persons } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { success, error, handleError } from '@/lib/api-utils';
import { accessibleSpaceIds } from '@/lib/project-access';
import { todayRD } from '@/lib/date-utils';
import { personLoad, workInProgress } from '@/lib/metrics';
import { PERSON_METRICS_DISABLED_MESSAGE, getTeamSettings } from '@/lib/team-settings';

/**
 * Métricas agregadas por persona: trabajo en curso (`wip`) y carga de tareas (`byPerson`),
 * ordenadas por carga para equilibrar, nunca como ranking. Si el equipo apagó el ajuste
 * «Mostrar métricas por persona», responde 403 sin consultar tareas (DECISIONES §22).
 */
export async function GET() {
  try {
    const session = await requireSession();
    const settings = await getTeamSettings();
    if (!settings.showPersonMetrics) return error(PERSON_METRICS_DISABLED_MESSAGE, 403);

    const allowedSpaceIds = await accessibleSpaceIds(session);
    if (allowedSpaceIds !== null && allowedSpaceIds.length === 0) return success({ wip: [], byPerson: [] });

    const rows = await db
      .select({
        id: tasks.id,
        status: tasks.status,
        dueDateOriginal: tasks.dueDateOriginal,
        responsibleId: tasks.responsibleId,
        responsibleName: persons.name,
      })
      .from(tasks)
      .innerJoin(persons, eq(tasks.responsibleId, persons.id))
      .where(and(eq(tasks.archived, false), allowedSpaceIds === null ? undefined : inArray(tasks.spaceId, allowedSpaceIds)));

    return success({ wip: workInProgress(rows), byPerson: personLoad(rows, todayRD()) });
  } catch (err) {
    return handleError(err);
  }
}

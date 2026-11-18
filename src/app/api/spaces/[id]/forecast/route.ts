import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { milestones, sprints, tasks } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { success, handleError } from '@/lib/api-utils';
import { and, eq } from 'drizzle-orm';
import { requireProjectAccess } from '@/lib/project-access';
import { todayRD } from '@/lib/date-utils';
import { buildProjectForecast } from '@/lib/forecast';

/**
 * Pronóstico Monte Carlo del sprint activo y de los hitos sin completar, con el acierto
 * de la validación hacia atrás. Sólo lectura: se calcula en el servidor en cada GET.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    await requireProjectAccess(session, id, 'read');

    // Las tareas archivadas no cuentan ni para el historial ni para el trabajo pendiente.
    const taskRows = await db
      .select({
        id: tasks.id,
        status: tasks.status,
        completedAt: tasks.completedAt,
        createdAt: tasks.createdAt,
        sprintId: tasks.sprintId,
        milestoneId: tasks.milestoneId,
      })
      .from(tasks)
      .where(and(eq(tasks.spaceId, id), eq(tasks.archived, false)));

    const sprintRows = await db.select().from(sprints).where(eq(sprints.spaceId, id));
    const milestoneRows = await db.select().from(milestones).where(eq(milestones.spaceId, id));

    return success(buildProjectForecast({
      tasks: taskRows,
      sprints: sprintRows,
      milestones: milestoneRows,
      today: todayRD(),
    }));
  } catch (err) {
    return handleError(err);
  }
}

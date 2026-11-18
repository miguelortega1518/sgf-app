import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { tasks } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { success, handleError } from '@/lib/api-utils';
import { and, eq, inArray } from 'drizzle-orm';
import { accessibleSpaceIds, requireProjectAccess } from '@/lib/project-access';
import { flowMetricsQuerySchema } from '@/lib/schemas/flow-metrics';
import { cumulativeFlow, cycleTimeHistogram, type FlowTask } from '@/lib/flow-metrics';
import { buildStatusHistory } from '@/lib/status-history';
import { loadStatusEvents } from '@/lib/status-history-query';

const HISTOGRAM_WINDOW_DAYS = 60;
const DAY = 86_400_000;

/** GET /api/metrics/flow?spaceId=&days=: CFD de los últimos `days` días e histograma del ciclo (60 días). */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const sp = req.nextUrl.searchParams;
    const { days, spaceId } = flowMetricsQuerySchema.parse({
      days: sp.get('days') ?? undefined,
      spaceId: sp.get('spaceId') ?? undefined,
    });

    let spaceIds: string[] | null;
    if (spaceId) {
      await requireProjectAccess(session, spaceId, 'read');
      spaceIds = [spaceId];
    } else {
      spaceIds = await accessibleSpaceIds(session);
    }

    const now = new Date();
    // inArray con una lista vacía no es válido: sin proyectos accesibles no se consulta.
    if (spaceIds !== null && spaceIds.length === 0) {
      return success({
        days,
        cfd: cumulativeFlow([], new Map(), days, now),
        cycleHistogram: cycleTimeHistogram([], new Map(), HISTOGRAM_WINDOW_DAYS, now),
      });
    }

    const rows: FlowTask[] = await db
      .select({
        id: tasks.id,
        status: tasks.status,
        createdAt: tasks.createdAt,
        completedAt: tasks.completedAt,
      })
      .from(tasks)
      .where(and(eq(tasks.archived, false), spaceIds === null ? undefined : inArray(tasks.spaceId, spaceIds)));

    // Sólo hace falta el historial de lo que está abierto o se cerró dentro de la
    // ventana más amplia (CFD o histograma). Las cerradas antes cuentan como Hecho.
    const since = now.getTime() - Math.max(days, HISTOGRAM_WINDOW_DAYS) * DAY;
    const relevant = rows.filter(t =>
      t.status !== 'completada' || (t.completedAt !== null && t.completedAt.getTime() >= since));
    const events = await loadStatusEvents(relevant.map(t => t.id));
    const histories = new Map(relevant.map(t => [t.id, buildStatusHistory(t, events.get(t.id) ?? [])]));

    return success({
      days,
      cfd: cumulativeFlow(rows, histories, days, now),
      cycleHistogram: cycleTimeHistogram(rows, histories, HISTOGRAM_WINDOW_DAYS, now),
    });
  } catch (err) {
    return handleError(err);
  }
}

import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { milestones, spaceShareLinks, spaces, sprints, tasks } from '@/lib/db/schema';
import { checkRateLimit, recordFailure } from '@/lib/rate-limit';
import { todayRD } from '@/lib/date-utils';
import { buildProjectForecast } from '@/lib/forecast';
import { hashShareToken, isWellFormedShareToken } from '@/lib/share-links';
import { buildSharedProjectView, type SharedProjectView } from '@/lib/share-view';

/** Visitas por IP a la vista pública en cada ventana de 15 minutos (src/lib/rate-limit-policy.ts). */
export const SHARE_VIEW_MAX_PER_WINDOW = 60;

export type SharedProjectResult =
  | { kind: 'rate_limited'; retryAfterMs: number }
  | { kind: 'not_found' }
  | { kind: 'ok'; view: SharedProjectView };

const NOT_FOUND = { kind: 'not_found' } as const;

/**
 * Carga la vista pública de /compartido/[token]. Inexistente, revocado y mal formado dan
 * exactamente el mismo resultado. Las consultas proyectan sólo las columnas que usa la vista
 * y el pronóstico; nunca se toca persons, comments ni space_updates.
 */
export async function loadSharedProject(token: string, ip: string): Promise<SharedProjectResult> {
  const rateKey = `share-view:ip:${ip}`;
  const rate = await checkRateLimit(rateKey, SHARE_VIEW_MAX_PER_WINDOW);
  if (!rate.allowed) return { kind: 'rate_limited', retryAfterMs: rate.retryAfterMs ?? 0 };
  // Como en import-csv, recordFailure sirve de contador de visitas.
  await recordFailure(rateKey);

  if (!isWellFormedShareToken(token)) return NOT_FOUND;

  const [link] = await db
    .select({ spaceId: spaceShareLinks.spaceId })
    .from(spaceShareLinks)
    .where(and(eq(spaceShareLinks.tokenHash, hashShareToken(token)), isNull(spaceShareLinks.revokedAt)))
    .limit(1);
  if (!link) return NOT_FOUND;
  const spaceId = link.spaceId;

  const [space] = await db
    .select({
      name: spaces.name,
      objective: spaces.objective,
      declaredHealth: spaces.declaredHealth,
      status: spaces.status,
    })
    .from(spaces)
    .where(eq(spaces.id, spaceId))
    .limit(1);
  if (!space) return NOT_FOUND;

  const [milestoneRows, taskRows, sprintRows] = await Promise.all([
    db
      .select({
        id: milestones.id,
        name: milestones.name,
        targetDate: milestones.targetDate,
        completed: milestones.completed,
        order: milestones.order,
        createdAt: milestones.createdAt,
      })
      .from(milestones)
      .where(eq(milestones.spaceId, spaceId)),
    // Las archivadas no cuentan ni para el avance ni para el pronóstico.
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        dueDate: tasks.dueDate,
        blockedByArea: tasks.blockedByArea,
        milestoneId: tasks.milestoneId,
        sprintId: tasks.sprintId,
        completedAt: tasks.completedAt,
        createdAt: tasks.createdAt,
        archived: tasks.archived,
      })
      .from(tasks)
      .where(and(eq(tasks.spaceId, spaceId), eq(tasks.archived, false))),
    db
      .select({
        id: sprints.id,
        status: sprints.status,
        startDate: sprints.startDate,
        endDate: sprints.endDate,
      })
      .from(sprints)
      .where(eq(sprints.spaceId, spaceId)),
  ]);

  // Igual que GET /api/spaces/[id]/forecast.
  const today = todayRD();
  const forecast = buildProjectForecast({
    tasks: taskRows,
    sprints: sprintRows,
    milestones: milestoneRows,
    today,
  });

  return {
    kind: 'ok',
    view: buildSharedProjectView({ space, milestones: milestoneRows, tasks: taskRows, forecast, today }),
  };
}

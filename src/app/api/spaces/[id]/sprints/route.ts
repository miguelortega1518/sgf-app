import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { sprints, tasks } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { success, error, handleError } from '@/lib/api-utils';
import { and, asc, count, eq, sql } from 'drizzle-orm';
import { requireProjectAccess } from '@/lib/project-access';
import { createSprintSchema } from '@/lib/schemas/sprint';
import { logAudit } from '@/lib/audit';

// En la interfaz, `proyecto` es «Iniciativa» y `continuo` es «Backlog» (SPACE_TYPE_LABEL).
const SPRINTS_ONLY_MESSAGE = 'Los sprints sólo están disponibles en proyectos de tipo iniciativa o backlog';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    await requireProjectAccess(session, id, 'read');

    const rows = await db
      .select()
      .from(sprints)
      .where(eq(sprints.spaceId, id))
      .orderBy(asc(sprints.startDate));

    // Las tareas archivadas no cuentan. La fila de sprintId null (backlog) se ignora.
    const totals = await db
      .select({
        sprintId: tasks.sprintId,
        taskCount: count(),
        estimateTotal: sql<string>`coalesce(sum(${tasks.estimate}), 0)`,
      })
      .from(tasks)
      .where(and(eq(tasks.spaceId, id), eq(tasks.archived, false)))
      .groupBy(tasks.sprintId);

    const totalsMap = new Map(
      totals
        .filter(t => t.sprintId != null)
        .map(t => [t.sprintId, { taskCount: Number(t.taskCount), estimateTotal: Number(t.estimateTotal) }]),
    );

    return success(rows.map(s => ({
      ...s,
      taskCount: totalsMap.get(s.id)?.taskCount ?? 0,
      estimateTotal: totalsMap.get(s.id)?.estimateTotal ?? 0,
    })));
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
    const space = await requireProjectAccess(session, id, 'write');
    if (space.type === 'recurrente') return error(SPRINTS_ONLY_MESSAGE, 400);

    const input = createSprintSchema.parse(await req.json());

    const sprint = await db.transaction(async tx => {
      const [created] = await tx.insert(sprints).values({
        spaceId: id,
        name: input.name,
        goal: input.goal ?? null,
        startDate: input.startDate,
        endDate: input.endDate,
        status: 'planificado',
      }).returning();

      await logAudit({
        actorId: session.id,
        action: 'sprint_created',
        spaceId: id,
        newValue: `${created.name}: ${created.startDate} → ${created.endDate}`,
      }, tx);

      return created;
    });

    return success(sprint, 201);
  } catch (err) {
    return handleError(err);
  }
}

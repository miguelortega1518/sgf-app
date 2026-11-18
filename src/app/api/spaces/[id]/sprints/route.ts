import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { persons, spaceMembers, sprintCapacity, sprints, tasks, type Sprint } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { success, error, handleError } from '@/lib/api-utils';
import { and, asc, count, eq, isNotNull, sql } from 'drizzle-orm';
import {
  buildCapacityRows, capacityFromLegacyTasks, capacityFromSummary, defaultCapacity,
  type CapacityRow, type ClosedSprintCapacity,
} from '@/lib/sprint-capacity';
import { requireProjectAccess } from '@/lib/project-access';
import { createSprintSchema } from '@/lib/schemas/sprint';
import { logAudit } from '@/lib/audit';

// En la interfaz, `proyecto` es «Iniciativa» y `continuo` es «Backlog» (SPACE_TYPE_LABEL).
const SPRINTS_ONLY_MESSAGE = 'Los sprints sólo están disponibles en proyectos de tipo iniciativa o backlog';

/**
 * Tabla de capacidad de cada sprint planificado o activo. Tres consultas en
 * bloque (miembros, capacidades guardadas y tareas con sprint), nunca una por
 * sprint o por persona. Sin sprints abiertos no se consulta nada.
 */
async function loadCapacity(spaceId: string, rows: Sprint[]): Promise<Map<string, CapacityRow[]>> {
  const result = new Map<string, CapacityRow[]>();
  const open = rows.filter(s => s.status !== 'cerrado');
  if (open.length === 0) return result;

  const members = await db
    .select({ personId: spaceMembers.personId, name: persons.name, spaceRole: spaceMembers.spaceRole })
    .from(spaceMembers)
    .innerJoin(persons, eq(spaceMembers.personId, persons.id))
    .where(eq(spaceMembers.spaceId, spaceId));

  const savedRows = await db
    .select({ sprintId: sprintCapacity.sprintId, personId: sprintCapacity.personId, points: sprintCapacity.points })
    .from(sprintCapacity)
    .innerJoin(sprints, eq(sprintCapacity.sprintId, sprints.id))
    .where(eq(sprints.spaceId, spaceId));

  const sprintTasks = await db
    .select({
      sprintId: tasks.sprintId,
      responsibleId: tasks.responsibleId,
      responsibleName: persons.name,
      status: tasks.status,
      estimate: tasks.estimate,
    })
    .from(tasks)
    .innerJoin(persons, eq(tasks.responsibleId, persons.id))
    .where(and(eq(tasks.spaceId, spaceId), eq(tasks.archived, false), isNotNull(tasks.sprintId)));

  const tasksBySprint = new Map<string, typeof sprintTasks>();
  for (const t of sprintTasks) {
    if (!t.sprintId) continue;
    const list = tasksBySprint.get(t.sprintId) ?? [];
    list.push(t);
    tasksBySprint.set(t.sprintId, list);
  }

  // Historial para la capacidad por defecto: summary.byPerson o, en los cerrados
  // antes de la retrospectiva automática, sus tareas actuales.
  const closed: ClosedSprintCapacity[] = rows
    .filter(s => s.status === 'cerrado')
    .map(s => ({
      endDate: s.endDate,
      byPerson: s.summary ? capacityFromSummary(s.summary) : capacityFromLegacyTasks(tasksBySprint.get(s.id) ?? []),
    }));

  for (const s of open) {
    const saved = new Map(savedRows.filter(r => r.sprintId === s.id).map(r => [r.personId, r.points]));
    const own = tasksBySprint.get(s.id) ?? [];
    const candidates = new Set([...members.map(m => m.personId), ...own.map(t => t.responsibleId)]);
    const defaults = new Map([...candidates].map(p => [p, defaultCapacity(p, closed)]));
    result.set(s.id, buildCapacityRows({ members, saved, defaults, sprintTasks: own }));
  }
  return result;
}

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

    const capacityBySprint = await loadCapacity(id, rows);

    return success(rows.map(s => ({
      ...s,
      taskCount: totalsMap.get(s.id)?.taskCount ?? 0,
      estimateTotal: totalsMap.get(s.id)?.estimateTotal ?? 0,
      ...(s.status === 'cerrado' ? {} : { capacity: capacityBySprint.get(s.id) ?? [] }),
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
        goal: input.goal?.trim() || null,
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

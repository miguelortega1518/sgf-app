import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { spaces, tasks, spaceMembers, persons, companies } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { updateSpaceSchema } from '@/lib/schemas/space';
import { success, error, handleError } from '@/lib/api-utils';
import { logAudit } from '@/lib/audit';
import { eq, and, ne, lt, isNotNull } from 'drizzle-orm';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id } = await params;

    const [space] = await db
      .select()
      .from(spaces)
      .where(eq(spaces.id, id))
      .limit(1);

    if (!space) return error('Espacio no encontrado', 404);

    const members = await db
      .select({
        personId: spaceMembers.personId,
        spaceRole: spaceMembers.spaceRole,
        name: persons.name,
        email: persons.email,
      })
      .from(spaceMembers)
      .innerJoin(persons, eq(spaceMembers.personId, persons.id))
      .where(eq(spaceMembers.spaceId, id));

    const [owner] = await db
      .select({ name: persons.name })
      .from(persons)
      .where(eq(persons.id, space.ownerId))
      .limit(1);

    const spaceTasks = await db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        dueDate: tasks.dueDate,
        dueDateOriginal: tasks.dueDateOriginal,
        priority: tasks.priority,
        companyId: tasks.companyId,
        companyName: companies.name,
        responsibleId: tasks.responsibleId,
        responsibleName: persons.name,
        blockedByArea: tasks.blockedByArea,
        requiresApproval: tasks.requiresApproval,
        requiresEvidence: tasks.requiresEvidence,
        completedAt: tasks.completedAt,
        templateId: tasks.templateId,
      })
      .from(tasks)
      .leftJoin(companies, eq(tasks.companyId, companies.id))
      .innerJoin(persons, eq(tasks.responsibleId, persons.id))
      .where(eq(tasks.spaceId, id));

    return success({
      space: { ...space, ownerName: owner?.name },
      members,
      tasks: spaceTasks,
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const body = await req.json();
    const input = updateSpaceSchema.parse(body);

    const [space] = await db
      .select()
      .from(spaces)
      .where(eq(spaces.id, id))
      .limit(1);

    if (!space) return error('Espacio no encontrado', 404);

    const isOwner = space.ownerId === session.id;
    if (session.role !== 'admin' && !isOwner) {
      return error('Sin permisos', 403);
    }

    if (input.status) {
      const validTransitions: Record<string, string[]> = {
        borrador: ['activo'],
        activo: ['cerrado'],
        cerrado: [],
      };
      const allowed = validTransitions[space.status] ?? [];
      if (!allowed.includes(input.status)) {
        return error(
          `No se puede cambiar de "${space.status}" a "${input.status}"`,
          400,
        );
      }

      if (input.status === 'cerrado') {
        const incomplete = await db
          .select({ id: tasks.id })
          .from(tasks)
          .where(
            and(
              eq(tasks.spaceId, id),
              ne(tasks.status, 'completada'),
              eq(tasks.archived, false),
            ),
          )
          .limit(1);

        if (incomplete.length > 0) {
          return error(
            'No se puede cerrar: hay tareas sin completar',
            400,
          );
        }
      }
    }

    const setValues: Record<string, unknown> = { ...input };
    let closeReport = null;

    if (input.status === 'cerrado') {
      const today = new Date().toISOString().slice(0, 10);
      setValues.closeDate = today;

      const allTasks = await db
        .select({
          dueDate: tasks.dueDate,
          completedAt: tasks.completedAt,
          createdAt: tasks.createdAt,
        })
        .from(tasks)
        .where(and(eq(tasks.spaceId, id), eq(tasks.archived, false)));

      const totalTasks = allTasks.length;
      let onTime = 0;
      let late = 0;
      let totalDays = 0;
      let withDueDate = 0;

      for (const t of allTasks) {
        if (t.completedAt && t.dueDate) {
          withDueDate++;
          const completed = new Date(t.completedAt).toISOString().slice(0, 10);
          if (completed <= t.dueDate) onTime++;
          else late++;
        }
        if (t.completedAt && t.createdAt) {
          totalDays += Math.ceil(
            (new Date(t.completedAt).getTime() - new Date(t.createdAt).getTime()) / 86400000
          );
        }
      }

      closeReport = {
        totalTasks,
        onTimeCount: onTime,
        lateCount: late,
        onTimeRate: withDueDate > 0 ? Math.round((onTime / withDueDate) * 100) : 100,
        avgDays: totalTasks > 0 ? Math.round(totalDays / totalTasks) : 0,
        closedAt: today,
      };

      const existing = (space.templateSnapshot as Record<string, unknown>) || {};
      setValues.templateSnapshot = { ...existing, closeReport };
    }

    const [updated] = await db
      .update(spaces)
      .set(setValues)
      .where(eq(spaces.id, id))
      .returning();

    await logAudit({
      actorId: session.id,
      action: 'space_updated',
      spaceId: id,
      previousValue: JSON.stringify({
        name: space.name,
        status: space.status,
      }),
      newValue: JSON.stringify(input),
    });

    return success({ ...updated, closeReport });
  } catch (err) {
    return handleError(err);
  }
}

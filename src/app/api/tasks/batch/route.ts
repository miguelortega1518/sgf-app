import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { tasks } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { success, error, handleError } from '@/lib/api-utils';
import { logAudit } from '@/lib/audit';
import { inArray, eq, and } from 'drizzle-orm';
import { z } from 'zod';

const batchSchema = z.object({
  taskIds: z.array(z.string().uuid()).min(1).max(50),
  status: z.enum(['en_proceso', 'completada']),
});

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const { taskIds, status } = batchSchema.parse(body);

    const userTasks = await db
      .select({ id: tasks.id, status: tasks.status, requiresApproval: tasks.requiresApproval })
      .from(tasks)
      .where(and(
        inArray(tasks.id, taskIds),
        eq(tasks.responsibleId, session.id),
        eq(tasks.archived, false),
      ));

    if (userTasks.length === 0) return error('No se encontraron tareas válidas', 404);

    const eligible = userTasks.filter(t => {
      if (status === 'completada' && t.requiresApproval) return false;
      if (status === 'completada' && t.status === 'completada') return false;
      return true;
    });

    if (eligible.length === 0) return error('Ninguna tarea es elegible para este cambio', 400);

    const eligibleIds = eligible.map(t => t.id);

    await db.transaction(async (tx) => {
      const updateData: Record<string, unknown> = { status };
      if (status === 'completada') updateData.completedAt = new Date();

      await tx.update(tasks).set(updateData).where(inArray(tasks.id, eligibleIds));

      for (const t of eligible) {
        await logAudit({
          actorId: session.id,
          action: 'status_changed',
          taskId: t.id,
          previousValue: t.status,
          newValue: status,
        });
      }
    });

    return success({ updated: eligible.length, skipped: userTasks.length - eligible.length });
  } catch (err) {
    return handleError(err);
  }
}

import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { tasks } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { success, error, handleError } from '@/lib/api-utils';
import { requireProjectAccess } from '@/lib/project-access';
import { applyStatusTransition, type NotificationIntent } from '@/lib/task-transitions';
import { notify } from '@/lib/notify';
import { inArray, asc } from 'drizzle-orm';
import { z } from 'zod';

const batchSchema = z.object({
  taskIds: z.array(z.string().uuid()).min(1).max(50),
  status: z.enum(['en_proceso', 'completada']),
});

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();
    if (session.role === 'observador') return error('Sin permisos', 403);
    const body = await req.json();
    const { taskIds, status } = batchSchema.parse(body);

    const ids = [...new Set(taskIds)];
    const result = await db.transaction(async tx => {
      const rows = await tx.select().from(tasks).where(inArray(tasks.id, ids)).orderBy(asc(tasks.id)).for('update');
      const notifications: NotificationIntent[] = [];
      let updated = 0;
      const skippedTasks: { taskId: string; reason: string }[] = [];
      const found = new Set(rows.map(task => task.id));
      for (const taskId of ids) {
        if (!found.has(taskId)) skippedTasks.push({ taskId, reason: 'Tarea no disponible' });
      }
      for (const task of rows) {
        if (task.archived) {
          skippedTasks.push({ taskId: task.id, reason: 'Tarea no disponible' });
          continue;
        }
        try {
          const space = await requireProjectAccess(session, task.spaceId, 'write', tx);
          const transition = await applyStatusTransition(tx, session, task, space, { status });
          if (!transition.isNoop) updated++;
          else skippedTasks.push({ taskId: task.id, reason: 'Ya estaba en ese estado' });
          notifications.push(...transition.notifications);
        } catch (err) {
          const httpStatus = typeof err === 'object' && err !== null && 'httpStatus' in err
            ? Number((err as { httpStatus: unknown }).httpStatus)
            : 0;
          if (![400, 403, 404, 409].includes(httpStatus)) throw err;
          skippedTasks.push({ taskId: task.id, reason: err instanceof Error ? err.message : 'No se pudo actualizar' });
        }
      }
      return { updated, skipped: skippedTasks.length, skippedTasks, notifications };
    });
    for (const intent of result.notifications) notify(intent).catch(() => {});
    return success({ updated: result.updated, skipped: result.skipped, skippedTasks: result.skippedTasks });
  } catch (err) {
    return handleError(err);
  }
}

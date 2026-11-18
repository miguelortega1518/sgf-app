// Carga en bloque los cambios de sprint de un proyecto (audit_log,
// action='task_sprint_changed'). Sólo lee la auditoría; la reconstrucción de la
// pertenencia a sprint está en src/lib/sprint-metrics.ts.

import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { auditLog } from '@/lib/db/schema';
import type { SprintEvent } from '@/lib/sprint-metrics';

/** Eventos de cambio de sprint del proyecto agrupados por tarea, en una sola consulta. */
export async function loadSprintEvents(spaceId: string): Promise<Map<string, SprintEvent[]>> {
  const rows = await db
    .select({
      taskId: auditLog.taskId,
      previousValue: auditLog.previousValue,
      newValue: auditLog.newValue,
      reason: auditLog.reason,
      at: auditLog.timestamp,
    })
    .from(auditLog)
    .where(and(eq(auditLog.action, 'task_sprint_changed'), eq(auditLog.spaceId, spaceId)))
    .orderBy(asc(auditLog.timestamp));

  const byTask = new Map<string, SprintEvent[]>();
  for (const r of rows) {
    if (!r.taskId) continue;
    const list = byTask.get(r.taskId) ?? [];
    list.push({ taskId: r.taskId, previousValue: r.previousValue, newValue: r.newValue, reason: r.reason, at: r.at });
    byTask.set(r.taskId, list);
  }
  return byTask;
}

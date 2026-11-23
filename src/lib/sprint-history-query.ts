// Carga en bloque los cambios de sprint (audit_log, action='task_sprint_changed').
// Sólo lee la auditoría; la interpretación está en src/lib/sprint-history.ts.

import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { auditLog } from '@/lib/db/schema';
import type { SprintChangeEvent } from '@/lib/sprint-history';
import type { QueryExecutor } from '@/lib/status-history-query';

/**
 * Eventos de cambio de sprint de las tareas dadas, agrupados por tarea, en una sola
 * consulta. Se filtran por el proyecto (`spaceId`) para que los eventos heredados
 * reconocidos por nombre no se mezclen con sprints homónimos de otros proyectos.
 */
export async function loadSprintChangeEvents(
  taskIds: string[],
  spaceId: string,
  executor: QueryExecutor = db,
): Promise<Map<string, SprintChangeEvent[]>> {
  const byTask = new Map<string, SprintChangeEvent[]>();
  // inArray con una lista vacía no es válido: no se consulta.
  if (taskIds.length === 0) return byTask;

  const rows = await executor
    .select({
      taskId: auditLog.taskId,
      previousValue: auditLog.previousValue,
      newValue: auditLog.newValue,
      reason: auditLog.reason,
      at: auditLog.timestamp,
    })
    .from(auditLog)
    .where(and(
      eq(auditLog.action, 'task_sprint_changed'),
      eq(auditLog.spaceId, spaceId),
      inArray(auditLog.taskId, taskIds),
    ))
    .orderBy(asc(auditLog.taskId), asc(auditLog.timestamp));

  for (const r of rows) {
    if (!r.taskId) continue;
    const list = byTask.get(r.taskId) ?? [];
    list.push({ taskId: r.taskId, previousValue: r.previousValue, newValue: r.newValue, reason: r.reason, at: r.at });
    byTask.set(r.taskId, list);
  }
  return byTask;
}

// Carga en bloque los cambios de estado (audit_log, action='status_changed').
// Sólo lee la auditoría; la lógica de tramos está en src/lib/status-history.ts.

import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { auditLog } from '@/lib/db/schema';
import type { StatusEvent } from '@/lib/status-history';

/** Eventos de cambio de estado agrupados por tarea, en una sola consulta. */
export async function loadStatusEvents(taskIds: string[]): Promise<Map<string, StatusEvent[]>> {
  const byTask = new Map<string, StatusEvent[]>();
  // inArray con una lista vacía no es válido: no se consulta.
  if (taskIds.length === 0) return byTask;

  const rows = await db
    .select({
      taskId: auditLog.taskId,
      previousValue: auditLog.previousValue,
      newValue: auditLog.newValue,
      at: auditLog.timestamp,
    })
    .from(auditLog)
    .where(and(eq(auditLog.action, 'status_changed'), inArray(auditLog.taskId, taskIds)))
    .orderBy(asc(auditLog.taskId), asc(auditLog.timestamp));

  for (const r of rows) {
    if (!r.taskId) continue;
    const list = byTask.get(r.taskId) ?? [];
    list.push({ taskId: r.taskId, previousValue: r.previousValue, newValue: r.newValue, at: r.at });
    byTask.set(r.taskId, list);
  }
  return byTask;
}

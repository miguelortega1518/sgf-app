import { db } from './db';
import { auditLog } from './db/schema';

export async function logAudit(params: {
  actorId: string;
  action: string;
  taskId?: string;
  spaceId?: string;
  previousValue?: string;
  newValue?: string;
  reason?: string;
}) {
  await db.insert(auditLog).values({
    actorId: params.actorId,
    action: params.action,
    taskId: params.taskId ?? null,
    spaceId: params.spaceId ?? null,
    previousValue: params.previousValue ?? null,
    newValue: params.newValue ?? null,
    reason: params.reason ?? null,
  });
}

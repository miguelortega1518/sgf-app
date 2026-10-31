import { db as globalDb } from './db';
import { auditLog } from './db/schema';

type DbLike = Pick<typeof globalDb, 'insert'>;

export async function logAudit(
  params: {
    actorId: string;
    action: string;
    taskId?: string;
    spaceId?: string;
    previousValue?: string;
    newValue?: string;
    reason?: string;
  },
  executor: DbLike = globalDb,
) {
  await executor.insert(auditLog).values({
    actorId: params.actorId,
    action: params.action,
    taskId: params.taskId ?? null,
    spaceId: params.spaceId ?? null,
    previousValue: params.previousValue ?? null,
    newValue: params.newValue ?? null,
    reason: params.reason ?? null,
  });
}

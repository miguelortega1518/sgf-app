import { db } from '@/lib/db';
import { auditLog, persons, tasks } from '@/lib/db/schema';
import { requireRole } from '@/lib/auth';
import { success, handleError } from '@/lib/api-utils';
import { eq, desc, and, gte, lte, ilike } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    await requireRole('admin');

    const params = req.nextUrl.searchParams;
    const page = Math.max(1, parseInt(params.get('page') || '1'));
    const limit = 50;
    const offset = (page - 1) * limit;

    const actors = alias(persons, 'actors');

    const rows = await db
      .select({
        id: auditLog.id,
        action: auditLog.action,
        previousValue: auditLog.previousValue,
        newValue: auditLog.newValue,
        reason: auditLog.reason,
        timestamp: auditLog.timestamp,
        actorName: actors.name,
        actorEmail: actors.email,
        taskId: auditLog.taskId,
        taskTitle: tasks.title,
      })
      .from(auditLog)
      .innerJoin(actors, eq(auditLog.actorId, actors.id))
      .leftJoin(tasks, eq(auditLog.taskId, tasks.id))
      .orderBy(desc(auditLog.timestamp))
      .limit(limit)
      .offset(offset);

    return success({ entries: rows, page, hasMore: rows.length === limit });
  } catch (err) {
    return handleError(err);
  }
}

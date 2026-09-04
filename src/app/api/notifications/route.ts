import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { notifications } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { success, handleError } from '@/lib/api-utils';
import { eq, and, desc, sql } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const countOnly = searchParams.get('countOnly') === 'true';

    if (countOnly) {
      const [result] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(notifications)
        .where(and(
          eq(notifications.recipientId, session.id),
          eq(notifications.read, false),
        ));
      return success({ unreadCount: result.count });
    }

    const offset = (page - 1) * limit;

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(eq(notifications.recipientId, session.id));

    const notifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.recipientId, session.id))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset);

    return success({
      data: notifs,
      total: countResult.count,
      page,
      totalPages: Math.ceil(countResult.count / limit),
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();
    const { ids } = await req.json();

    if (Array.isArray(ids)) {
      for (const id of ids) {
        await db
          .update(notifications)
          .set({ read: true })
          .where(
            and(
              eq(notifications.id, id),
              eq(notifications.recipientId, session.id),
            ),
          );
      }
    }

    return success({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}

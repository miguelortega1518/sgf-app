import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { notifications } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { success, handleError } from '@/lib/api-utils';
import { eq, and, desc } from 'drizzle-orm';

export async function GET() {
  try {
    const session = await requireSession();

    const notifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.recipientId, session.id))
      .orderBy(desc(notifications.createdAt))
      .limit(50);

    return success(notifs);
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

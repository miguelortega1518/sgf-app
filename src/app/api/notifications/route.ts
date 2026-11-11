import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { notifications } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { success, handleError } from '@/lib/api-utils';
import { eq, and, desc, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

const markReadSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
});

const MAX_PAGE = 10000;
const PAGE_MESSAGE = `El parámetro page debe ser un entero entre 1 y ${MAX_PAGE}`;
const LIMIT_MESSAGE = 'El parámetro limit debe ser un entero entre 1 y 50';

// page > MAX_PAGE y limit > 50 se rechazan con 400 (no se recortan).
const listQuerySchema = z.object({
  page: z.coerce
    .number({ error: PAGE_MESSAGE })
    .int(PAGE_MESSAGE)
    .min(1, PAGE_MESSAGE)
    .max(MAX_PAGE, PAGE_MESSAGE)
    .default(1),
  limit: z.coerce
    .number({ error: LIMIT_MESSAGE })
    .int(LIMIT_MESSAGE)
    .min(1, LIMIT_MESSAGE)
    .max(50, LIMIT_MESSAGE)
    .default(20),
});

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const { page, limit } = listQuerySchema.parse({
      page: searchParams.get('page') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
    });
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
    const { ids } = markReadSchema.parse(await req.json());
    const uniqueIds = [...new Set(ids)];

    await db
      .update(notifications)
      .set({ read: true })
      .where(
        and(
          inArray(notifications.id, uniqueIds),
          eq(notifications.recipientId, session.id),
        ),
      );

    return success({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}

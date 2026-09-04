import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { holidays } from '@/lib/db/schema';
import { requireRole, requireSession } from '@/lib/auth';
import { success, error, handleError } from '@/lib/api-utils';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';

export async function GET() {
  try {
    await requireSession();
    const rows = await db.select().from(holidays).orderBy(asc(holidays.date));
    return success(rows);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireRole('admin');
    const body = await req.json();
    const input = z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      description: z.string().min(1).max(200),
    }).parse(body);

    const [existing] = await db.select().from(holidays)
      .where(eq(holidays.date, input.date)).limit(1);
    if (existing) return error('Ya existe un feriado en esa fecha', 400);

    const [holiday] = await db.insert(holidays).values(input).returning();
    return success(holiday, 201);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireRole('admin');
    const body = await req.json();
    const { date } = z.object({ date: z.string() }).parse(body);
    await db.delete(holidays).where(eq(holidays.date, date));
    return success({ deleted: true });
  } catch (err) {
    return handleError(err);
  }
}

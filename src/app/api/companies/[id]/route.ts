import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { companies } from '@/lib/db/schema';
import { requireRole } from '@/lib/auth';
import { success, error, handleError } from '@/lib/api-utils';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const updateCompanySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  active: z.boolean().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    await requireRole('admin');
    const { id } = await ctx.params;
    const body = await req.json();
    const input = updateCompanySchema.parse(body);

    const [existing] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.id, id))
      .limit(1);

    if (!existing) return error('Empresa no encontrada', 404);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) updates.name = input.name;
    if (input.active !== undefined) updates.active = input.active;

    const [updated] = await db
      .update(companies)
      .set(updates)
      .where(eq(companies.id, id))
      .returning();

    return success(updated);
  } catch (err) {
    return handleError(err);
  }
}

import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { persons } from '@/lib/db/schema';
import { requireRole, hashPassword, invalidateActiveCache } from '@/lib/auth';
import { updateUserSchema } from '@/lib/schemas/user';
import { success, error, handleError } from '@/lib/api-utils';
import { eq } from 'drizzle-orm';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    await requireRole('admin');
    const { id } = await ctx.params;
    const body = await req.json();
    const input = updateUserSchema.parse(body);

    const [existing] = await db
      .select({ id: persons.id })
      .from(persons)
      .where(eq(persons.id, id))
      .limit(1);

    if (!existing) return error('Usuario no encontrado', 404);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) updates.name = input.name;
    if (input.email !== undefined) updates.email = input.email;
    if (input.role !== undefined) updates.role = input.role;
    if (input.active !== undefined) updates.active = input.active;
    if (input.password !== undefined) updates.passwordHash = await hashPassword(input.password);

    const [updated] = await db
      .update(persons)
      .set(updates)
      .where(eq(persons.id, id))
      .returning({
        id: persons.id,
        name: persons.name,
        email: persons.email,
        role: persons.role,
        active: persons.active,
        createdAt: persons.createdAt,
      });

    if (input.active !== undefined) {
      invalidateActiveCache(id);
    }

    return success(updated);
  } catch (err) {
    return handleError(err);
  }
}

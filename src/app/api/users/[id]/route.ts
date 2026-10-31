import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { persons } from '@/lib/db/schema';
import { requireRole, hashPassword } from '@/lib/auth';
import { updateUserSchema } from '@/lib/schemas/user';
import { success, error, handleError } from '@/lib/api-utils';
import { eq, and, asc } from 'drizzle-orm';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const actor = await requireRole('admin');
    const { id } = await ctx.params;
    const body = await req.json();
    const input = updateUserSchema.parse(body);

    if (id === actor.id && (input.active === false || input.role === 'miembro' || input.role === 'observador')) {
      return error('No puede desactivar ni degradar su propia cuenta', 409);
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) updates.name = input.name;
    if (input.email !== undefined) updates.email = input.email;
    if (input.role !== undefined) updates.role = input.role;
    if (input.active !== undefined) updates.active = input.active;
    if (input.password !== undefined) {
      updates.passwordHash = await hashPassword(input.password);
      // Una contraseña restablecida por un administrador es temporal.
      updates.mustChangePassword = true;
    }

    const updated = await db.transaction(async tx => {
      const removesAdmin = input.active === false || input.role === 'miembro' || input.role === 'observador';
      let activeAdminsCount: number | undefined;
      if (removesAdmin) {
        // Bloqueo ordenado para serializar dos intentos simultáneos de retirar admins.
        const activeAdmins = await tx.select({ id: persons.id }).from(persons)
          .where(and(eq(persons.role, 'admin'), eq(persons.active, true)))
          .orderBy(asc(persons.id)).for('update');
        activeAdminsCount = activeAdmins.length;
      }

      const [target] = await tx.select({ role: persons.role, active: persons.active }).from(persons)
        .where(eq(persons.id, id)).limit(1).for('update');
      if (!target) throw Object.assign(new Error('Usuario no encontrado'), { httpStatus: 404 });

      const willLoseAdmin = target.role === 'admin' && target.active && removesAdmin;
      if (willLoseAdmin) {
        if ((activeAdminsCount ?? 0) <= 1) throw Object.assign(new Error('No se puede retirar el último administrador activo'), { httpStatus: 409 });
      }

      const [row] = await tx.update(persons)
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
      return row;
    });

    return success(updated);
  } catch (err) {
    return handleError(err);
  }
}

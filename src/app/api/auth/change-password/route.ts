import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { persons } from '@/lib/db/schema';
import { requireSession, hashPassword, verifyPassword, invalidateActiveCache } from '@/lib/auth';
import { success, error, handleError } from '@/lib/api-utils';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'La nueva contraseña debe tener al menos 8 caracteres'),
});

export async function POST(req: NextRequest) {
  try {
    // Es la única acción permitida mientras la cuenta tiene una contraseña temporal pendiente de cambio.
    const session = await requireSession({ allowPasswordChange: true });
    const input = schema.parse(await req.json());

    if (input.newPassword === input.currentPassword) {
      return error('La nueva contraseña debe ser distinta de la actual', 400);
    }

    const [user] = await db
      .select({ passwordHash: persons.passwordHash })
      .from(persons)
      .where(eq(persons.id, session.id))
      .limit(1);

    if (!user) return error('Usuario no encontrado', 404);

    const valid = await verifyPassword(input.currentPassword, user.passwordHash);
    if (!valid) return error('Contraseña actual incorrecta', 400);

    const hash = await hashPassword(input.newPassword);
    await db
      .update(persons)
      .set({ passwordHash: hash, mustChangePassword: false, updatedAt: new Date() })
      .where(eq(persons.id, session.id));
    invalidateActiveCache(session.id);

    return success({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}

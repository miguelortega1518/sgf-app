import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { persons } from '@/lib/db/schema';
import { requireSession, hashPassword, verifyPassword, createSession } from '@/lib/auth';
import { success, error, handleError } from '@/lib/api-utils';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { newPasswordSchema, passwordProblem } from '@/lib/password-policy';

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: newPasswordSchema,
});

export async function POST(req: NextRequest) {
  try {
    // Es la única acción permitida mientras la cuenta tiene una contraseña temporal pendiente de cambio.
    const session = await requireSession({ allowPasswordChange: true });
    const input = schema.parse(await req.json());

    if (input.newPassword === input.currentPassword) {
      return error('La nueva contraseña debe ser distinta de la actual', 400);
    }
    const problem = passwordProblem(input.newPassword, { email: session.email });
    if (problem) return error(problem, 400);

    const [user] = await db
      .select({ passwordHash: persons.passwordHash })
      .from(persons)
      .where(eq(persons.id, session.id))
      .limit(1);

    if (!user) return error('Usuario no encontrado', 404);

    const valid = await verifyPassword(input.currentPassword, user.passwordHash);
    if (!valid) return error('Contraseña actual incorrecta', 400);

    // Cambiar la contraseña cierra todas las demás sesiones; esta se renueva con la versión nueva.
    const hash = await hashPassword(input.newPassword);
    const [updated] = await db
      .update(persons)
      .set({
        passwordHash: hash,
        mustChangePassword: false,
        sessionVersion: sql`${persons.sessionVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(persons.id, session.id))
      .returning({ sessionVersion: persons.sessionVersion });

    await createSession(session, updated.sessionVersion);
    return success({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}

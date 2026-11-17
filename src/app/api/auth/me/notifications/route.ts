import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { persons } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { updateEmailPreferencesSchema } from '@/lib/schemas/auth';
import { formatEmailPreferences, type EmailPreferences } from '@/lib/notification-email-policy';
import { success, error, handleError } from '@/lib/api-utils';

/** Cambia las preferencias de correo de la persona de la sesión (nunca de otra). */
export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();
    const input = updateEmailPreferencesSchema.parse(await req.json());

    const result = await db.transaction(async tx => {
      const [current] = await tx
        .select({ emailImmediate: persons.emailImmediate, emailDigest: persons.emailDigest })
        .from(persons)
        .where(eq(persons.id, session.id))
        .limit(1)
        .for('update');
      if (!current) return null;

      const next: EmailPreferences = {
        emailImmediate: input.emailImmediate ?? current.emailImmediate,
        emailDigest: input.emailDigest ?? current.emailDigest,
      };
      if (next.emailImmediate === current.emailImmediate && next.emailDigest === current.emailDigest) {
        return { emailImmediate: current.emailImmediate, emailDigest: current.emailDigest };
      }

      await tx
        .update(persons)
        .set({ emailImmediate: next.emailImmediate, emailDigest: next.emailDigest, updatedAt: new Date() })
        .where(eq(persons.id, session.id));

      await logAudit({
        actorId: session.id,
        action: 'email_preferences_changed',
        previousValue: formatEmailPreferences(current),
        newValue: formatEmailPreferences(next),
      }, tx);

      return next;
    });

    if (!result) return error('Usuario no encontrado', 404);

    return success(result);
  } catch (err) {
    return handleError(err);
  }
}

import { eq } from 'drizzle-orm';
import { getSession, getUserFlags } from '@/lib/auth';
import { db } from '@/lib/db';
import { persons } from '@/lib/db/schema';
import { success, error } from '@/lib/api-utils';
import { logger } from '@/lib/logger';
import { classifyError } from '@/lib/errors';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return error('No autorizado', 401);
  }

  try {
    const flags = await getUserFlags(session.id);
    if (!flags.active) return error('No autorizado', 401);
    // Consulta aparte para no cargar getUserFlags, que requireSession usa en cada petición.
    const [prefs] = await db
      .select({ emailImmediate: persons.emailImmediate, emailDigest: persons.emailDigest })
      .from(persons)
      .where(eq(persons.id, session.id))
      .limit(1);
    return success({
      user: {
        ...session,
        role: flags.role,
        mustChangePassword: flags.mustChangePassword,
        emailImmediate: prefs?.emailImmediate ?? true,
        emailDigest: prefs?.emailDigest ?? true,
      },
    });
  } catch (err) {
    // Si la base no responde, la sesión firmada sigue siendo válida: se muestra la app y las llamadas
    // a la API darán el error claro. Cerrar la sesión por una caída de la base sería peor.
    const info = classifyError(err);
    logger.warn('me_flags_unavailable', { code: info.code, detail: info.detail });
    return success({ user: { ...session, mustChangePassword: false }, degraded: true });
  }
}

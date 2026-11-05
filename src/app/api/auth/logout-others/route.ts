import { requireSession, bumpSessionVersion, createSession } from '@/lib/auth';
import { success, handleError } from '@/lib/api-utils';
import { logAudit } from '@/lib/audit';

/** Cierra todas las sesiones de la persona salvo la actual, que se renueva con la versión nueva. */
export async function POST() {
  try {
    const session = await requireSession();
    const version = await bumpSessionVersion(session.id);
    await createSession(session, version);
    await logAudit({ actorId: session.id, action: 'other_sessions_closed' });
    return success({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}

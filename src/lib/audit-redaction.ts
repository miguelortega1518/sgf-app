// Redacción de lectura de la auditoría de una tarea según el rol (issue #34, opción A).
// audit_log sigue guardando el texto de los comentarios borrados o moderados, pero
// sólo los admins pueden leerlo. Para el resto, esos registros llegan con
// previousValue/newValue a null y redacted: true. Cualquier rol distinto de 'admin'
// (incluido uno desconocido) se redacta: se falla en cerrado.
// No cambia lo que se escribe en audit_log ni la Bitácora (/api/audit-log, sólo admins).

import { COMMENT_MODERATED_REASON } from '@/lib/labels';

type AuditEntryValues = {
  action: string;
  previousValue: string | null;
  newValue: string | null;
  reason: string | null;
};

/** Registros cuyo texto sólo puede ver un admin: comentario borrado o edición moderada. */
function isRedactedForNonAdmin(entry: AuditEntryValues): boolean {
  return entry.action === 'comment_deleted'
    || (entry.action === 'comment_edited' && entry.reason === COMMENT_MODERATED_REASON);
}

/**
 * Devuelve copias de los registros con el campo `redacted`, sin mutar la entrada y
 * conservando el orden y el resto de campos (action, id, timestamp, actorName, reason…).
 */
export function redactTaskAuditForRole<T extends AuditEntryValues>(
  entries: readonly T[],
  role: string,
): Array<T & { redacted: boolean }> {
  const isAdmin = role === 'admin';
  return entries.map((entry) => {
    if (isAdmin || !isRedactedForNonAdmin(entry)) return { ...entry, redacted: false };
    return { ...entry, previousValue: null, newValue: null, redacted: true };
  });
}

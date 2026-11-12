// Redacción de lectura de la auditoría de una tarea según el rol (issue #34, opción A).
// audit_log sigue guardando el texto de los comentarios borrados o moderados, pero
// sólo los admins pueden leerlo. Para el resto, esos registros llegan con
// previousValue/newValue a null y redacted: true. Cualquier rol distinto de 'admin'
// (incluido uno desconocido) se redacta: se falla en cerrado.
// No cambia lo que se escribe en audit_log ni la Bitácora (/api/audit-log, sólo admins).
//
// Ediciones del autor encadenadas: el newValue de una edición del autor es el texto que
// después guarda como previousValue el borrado o la edición moderada de ese comentario.
// audit_log no guarda el id del comentario, así que la relación se reconstruye siguiendo
// la cadena de textos (newValue de la edición === previousValue del ancla) hacia atrás en
// el tiempo, de forma transitiva. Esto depende de que cada PATCH de comentario audite
// previousValue = contenido vigente y newValue = contenido nuevo (ambos tras stripHtml).
// Si dos comentarios comparten exactamente un texto, también se redactan las ediciones del
// que sigue vivo (sobre-redacción en cerrado). Los timestamps ausentes o inválidos y los
// empates también redactan. La función necesita el conjunto completo de registros de la
// tarea: si se pagina, el ancla puede quedar fuera y el texto volvería a filtrarse.

import { COMMENT_MODERATED_REASON } from '@/lib/labels';

type AuditEntryValues = {
  action: string;
  previousValue: string | null;
  newValue: string | null;
  reason: string | null;
  timestamp?: Date | string | null;
};

/** Registros cuyo texto sólo puede ver un admin: comentario borrado o edición moderada. */
function isRedactedForNonAdmin(entry: AuditEntryValues): boolean {
  return entry.action === 'comment_deleted'
    || (entry.action === 'comment_edited' && entry.reason === COMMENT_MODERATED_REASON);
}

/** Edición hecha por el autor del comentario (no moderada). */
function isAuthorEdit(entry: AuditEntryValues): boolean {
  return entry.action === 'comment_edited' && entry.reason !== COMMENT_MODERATED_REASON;
}

function toTime(ts: Date | string | null | undefined): number | null {
  if (ts === null || ts === undefined) return null;
  const time = new Date(ts).getTime();
  return Number.isNaN(time) ? null : time;
}

/** Anterior o igual; si falta algún tiempo, se considera anterior (falla en cerrado). */
function precedesOrEqual(candidate: number | null, anchor: number | null): boolean {
  return candidate === null || anchor === null || candidate <= anchor;
}

/** Índices de las ediciones del autor encadenadas por texto a un borrado o moderación. */
function collectLinkedAuthorEdits(entries: readonly AuditEntryValues[]): Set<number> {
  const editsByNewValue = new Map<string, number[]>();
  entries.forEach((entry, index) => {
    if (!isAuthorEdit(entry) || entry.newValue === null) return;
    const list = editsByNewValue.get(entry.newValue);
    if (list) list.push(index);
    else editsByNewValue.set(entry.newValue, [index]);
  });

  const worklist: Array<{ text: string; time: number | null }> = [];
  for (const entry of entries) {
    if (isRedactedForNonAdmin(entry) && entry.previousValue !== null) {
      worklist.push({ text: entry.previousValue, time: toTime(entry.timestamp) });
    }
  }

  const linked = new Set<number>();
  while (worklist.length > 0) {
    const { text, time } = worklist.pop()!;
    for (const index of editsByNewValue.get(text) ?? []) {
      if (linked.has(index)) continue;
      const edit = entries[index];
      const editTime = toTime(edit.timestamp);
      if (!precedesOrEqual(editTime, time)) continue;
      linked.add(index);
      if (edit.previousValue !== null) worklist.push({ text: edit.previousValue, time: editTime });
    }
  }
  return linked;
}

/**
 * Devuelve copias de los registros con el campo `redacted`, sin mutar la entrada y
 * conservando el orden y el resto de campos (action, id, timestamp, actorName, reason…).
 * No presupone ningún orden de la entrada.
 */
export function redactTaskAuditForRole<T extends AuditEntryValues>(
  entries: readonly T[],
  role: string,
): Array<T & { redacted: boolean }> {
  if (role === 'admin') return entries.map((entry) => ({ ...entry, redacted: false }));
  const linked = collectLinkedAuthorEdits(entries);
  return entries.map((entry, index) => {
    if (!isRedactedForNonAdmin(entry) && !linked.has(index)) return { ...entry, redacted: false };
    return { ...entry, previousValue: null, newValue: null, redacted: true };
  });
}

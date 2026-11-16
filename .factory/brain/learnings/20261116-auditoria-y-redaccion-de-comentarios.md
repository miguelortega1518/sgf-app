# Auditoría y redacción de comentarios

Las rutas de comentarios guardan el texto en audit_log: comment_edited lleva previousValue (texto vigente) y newValue (texto nuevo), y comment_deleted lleva el texto borrado en previousValue. Ambos se guardan tras stripHtml. Si quien actúa no es el autor, el registro lleva `reason: COMMENT_MODERATED_REASON` ('Moderado por admin', `src/lib/labels.ts`).

GET /api/tasks/[id] carga toda la auditoría de la tarea, sin paginar, y la pasa por `redactTaskAuditForRole(entries, session.role)` (`src/lib/audit-redaction.ts`). Para cualquier rol distinto de 'admin', incluido uno desconocido, salen con previousValue/newValue a null y `redacted: true`:
- comment_deleted;
- comment_edited con reason COMMENT_MODERATED_REASON;
- las ediciones del autor encadenadas a uno de los anteriores (collectLinkedAuthorEdits).

audit_log no guarda id de comentario. La cadena se reconstruye hacia atrás desde cada ancla comparando el texto exacto (newValue de la edición === previousValue del ancla), de forma transitiva. Falla en cerrado: los timestamps ausentes o inválidos y los empates también redactan, y dos comentarios con el mismo texto se redactan a la vez. Con esto quedó resuelto el caso de las ediciones del autor previas a un borrado o una moderación, que antes dejaban ver el texto. En la Actividad de la tarea, los registros redactados se rotulan con `redactedCommentLabel(entry.action, entry.reason)`.

Lectura del comentario antes de auditar:
- `src/app/api/tasks/[id]/comments/route.ts` lee la fila con `tx.select()...limit(1).for('update')` dentro de db.transaction en PATCH y DELETE, y lanza 404/403 con `Object.assign(new Error(msg), { httpStatus })`.
- `src/app/api/spaces/[id]/comments/route.ts` todavía lee con `db.select` fuera de la transacción y sin bloqueo (PATCH y DELETE). Con un PATCH y un DELETE concurrentes, comment_deleted puede guardar un previousValue obsoleto y romper la cadena. Sus registros llevan spaceId sin taskId, así que hoy sólo los ve un admin en GET /api/audit-log.

_Origen: retrospectiva de «Registrar en la auditoría la edición y el borrado de comentarios de tarea» (20261111-024103-f22a20cc23); retrospectiva de «Ocultar a quien no es admin el texto de los comentarios borrados o moderados» (20261112-162720-93ef4c87a7); retrospectiva de «Cerrar la fuga de texto de comentarios borrados vía ediciones previas del autor» (20261112-164030-68da03b07a)_

# Comentarios auditados: bloqueo y redacción

- En rutas de comentarios que auditan previousValue, lee la fila con `tx.select()...limit(1).for('update')` dentro de db.transaction y lanza 404/403 con `Object.assign(new Error(msg), { httpStatus })`. No leas con db.select fuera de la transacción. `src/app/api/tasks/[id]/comments/route.ts` ya cumple; `src/app/api/spaces/[id]/comments/route.ts` todavía no.
- No normalices el texto auditado más allá de stripHtml: la redacción encadenada compara textos exactos, y si cambia lo que se guarda vuelve a filtrarse el texto.
- Cualquier ruta que exponga audit_log a no admins (también una futura actividad por proyecto con registros de spaceId) reutiliza redactTaskAuditForRole con el conjunto completo de registros, sin paginar.
- Cambiar el texto de COMMENT_MODERATED_REASON exige migrar la regla: las filas antiguas dejarían de redactarse.
- En TaskAuditDetail, `if (redacted) return null` sigue siendo la primera rama.
- Antes de guardar en audit_log texto sensible de usuario, considera quién lo lee: GET /api/tasks/[id] lo devuelve a cualquier lector de la tarea, aunque la UI no lo pinte.

_Origen: retrospectiva de «Evitar carrera de lectura en PATCH/DELETE de comentarios (leer con bloqueo dentro de la transacción)» (20261114-023249-d8ff46cfae); retrospectiva de «Registrar en la auditoría la edición y el borrado de comentarios de tarea» (20261111-024103-f22a20cc23); retrospectiva de «Ocultar a quien no es admin el texto de los comentarios borrados o moderados» (20261112-162720-93ef4c87a7); retrospectiva de «Cerrar la fuga de texto de comentarios borrados vía ediciones previas del autor» (20261112-164030-68da03b07a); retrospectiva de «Auditar alta, baja y cambios de name/completed/order de hitos» (20261112-160302-c57a704f2f)_

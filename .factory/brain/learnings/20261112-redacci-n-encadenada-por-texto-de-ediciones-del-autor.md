# Redacción encadenada por texto de ediciones del autor

audit_log no guarda id de comentario. redactTaskAuditForRole reconstruye la relación siguiendo previousValue↔newValue hacia atrás desde cada ancla (comment_deleted o edición moderada). Depende de que cada PATCH/DELETE de comments/route.ts audite el texto tras stripHtml sin más normalización. Si cambia lo que se guarda, vuelve la fuga. Cualquier ruta que exponga auditoría a no admins debe pasar el conjunto completo de la tarea, sin paginar.

_Origen: retrospectiva de «Cerrar la fuga de texto de comentarios borrados vía ediciones previas del autor» (20261112-164030-68da03b07a)_

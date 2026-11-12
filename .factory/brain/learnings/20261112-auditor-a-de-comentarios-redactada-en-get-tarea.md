# Auditoría de comentarios redactada en GET tarea

GET /api/tasks/[id] pasa la auditoría por redactTaskAuditForRole(entries, session.role) (src/lib/audit-redaction.ts). Para no admins, comment_deleted y comment_edited con reason COMMENT_MODERATED_REASON salen con previousValue/newValue null y redacted:true. Cualquier ruta nueva que exponga audit_log a no admins debe reutilizarla. Si se cambia el texto de COMMENT_MODERATED_REASON, hay que migrar la regla porque las filas antiguas dejarían de redactarse.

_Origen: retrospectiva de «Ocultar a quien no es admin el texto de los comentarios borrados o moderados» (20261112-162720-93ef4c87a7)_

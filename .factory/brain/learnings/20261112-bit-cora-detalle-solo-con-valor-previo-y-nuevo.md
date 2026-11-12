# Bitácora: detalle con uno o dos valores

AuditLogDetail y TaskAuditDetail (src/components/audit/audit-entry-detail.tsx) construyen el texto del cambio con el helper `formatAuditChange`: «previous → new» si hay ambos valores, el único valor (sin flecha) si solo hay uno, y nada si no hay ninguno (una cadena vacía cuenta como ausente). Así, las altas (solo newValue: milestone_created, evidence_added, dependency_added, task_created) y las bajas (solo previousValue: milestone_deleted, evidence_removed, dependency_removed, comment_deleted) muestran su dato en la Bitácora y en la Actividad de la tarea.

Consecuencias a tener en cuenta al añadir acciones de auditoría:
- Lo que se guarde en previousValue/newValue se verá en la UI. En la Actividad de la tarea lo ve cualquiera que pueda leer la tarea (p. ej. el texto de un comentario borrado en comment_deleted).
- `task_created` guarda un JSON en newValue y se muestra en bruto; formatearlo sería una mejora aparte.

_Origen: retrospectiva de «Auditar alta, baja y cambios de name/completed/order de hitos» (20261112-160302-c57a704f2f); actualizada al mostrar valores únicos (20261112-161538-99283ef137)._

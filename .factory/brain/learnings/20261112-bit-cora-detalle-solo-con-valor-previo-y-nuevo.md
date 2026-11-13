# Bitácora: detalle con uno o dos valores

AuditLogDetail y TaskAuditDetail (src/components/audit/audit-entry-detail.tsx) muestran «antes → después» si hay previousValue y newValue, y el único valor (sin flecha) si solo hay uno: altas como milestone_created (solo newValue) o bajas como milestone_deleted (solo previousValue). La cadena vacía cuenta como ausente. Sin valores ni reason, la Bitácora muestra «—» y Actividad no muestra nada.

Los valores se pintan tal cual: los que se guardan como JSON (task_created, space_created) o UUID se ven crudos. Al añadir acciones nuevas, guardar en previousValue/newValue un texto legible. En TaskAuditDetail, `if (redacted) return null` debe seguir siendo la primera rama: comment_deleted guarda el texto del comentario en previousValue.

_Origen: retrospectiva de «Auditar alta, baja y cambios de name/completed/order de hitos» (20261112-160302-c57a704f2f); actualizado al mostrar los registros con un solo valor._

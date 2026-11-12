# Bitácora: detalle solo con valor previo y nuevo

AuditLogDetail y TaskAuditDetail (src/components/audit/audit-entry-detail.tsx) muestran el valor solo si hay previousValue y newValue a la vez. Una acción de alta (solo newValue) o de baja (solo previousValue) aparece con «—» en la Bitácora. Al añadir acciones de este tipo, revisar ese componente o comprobar cómo se ven en la UI.

_Origen: retrospectiva de «Auditar alta, baja y cambios de name/completed/order de hitos» (20261112-160302-c57a704f2f)_

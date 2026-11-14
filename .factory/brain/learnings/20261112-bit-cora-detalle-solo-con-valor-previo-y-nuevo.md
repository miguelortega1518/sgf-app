# Bitácora: detalle con uno o dos valores

AuditLogDetail y TaskAuditDetail (src/components/audit/audit-entry-detail.tsx) muestran «antes → después» si hay previousValue y newValue, y el único valor (sin flecha) si solo hay uno: altas como milestone_created (solo newValue) o bajas como milestone_deleted (solo previousValue). La cadena vacía cuenta como ausente. Sin valores ni reason, la Bitácora muestra «—» y Actividad no muestra nada.

Los valores se pintan tal cual, salvo los JSON heredados de task_created (`{ title, responsible }`) y space_created (`{ name, type }`): con el prop `action`, ambos componentes los formatean en presentación (el título, o «nombre (etiqueta de SPACE_TYPE_LABEL)»; el UUID del responsable se omite). Si el JSON es inválido o no tiene la forma esperada, se muestra crudo. Los datos de audit_log no cambian. Al añadir acciones nuevas, guardar en previousValue/newValue un texto legible en vez de JSON o UUID. En TaskAuditDetail, `if (redacted) return null` debe seguir siendo la primera rama: comment_deleted guarda el texto del comentario en previousValue.

_Origen: retrospectiva de «Auditar alta, baja y cambios de name/completed/order de hitos» (20261112-160302-c57a704f2f); actualizado al mostrar los registros con un solo valor._

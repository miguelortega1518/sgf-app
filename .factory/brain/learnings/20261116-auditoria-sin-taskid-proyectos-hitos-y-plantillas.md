# Auditoría sin taskId: proyectos, hitos y plantillas

Hay registros de audit_log que no llevan taskId y por eso no salen en GET /api/tasks/[id]:
- Comentarios de proyecto (`src/app/api/spaces/[id]/comments/route.ts`) y todos los milestone_* (`src/app/api/spaces/[id]/milestones/route.ts`): llevan spaceId sin taskId.
- template_*: no llevan ni taskId ni spaceId, porque plantillas y tareas de plantilla no tienen fila en spaces ni tasks, y ambas columnas son FK.

Hitos: el PATCH lee el hito con `.for('update')` filtrando por id y spaceId dentro de db.transaction y escribe un registro por campo que cambia. `milestone_date_changed` sólo se registra si targetDate viene y difiere de la actual, con `Nombre: YYYY-MM-DD` y el nombre previo en ambos valores. `order` no se audita.

Plantillas: `src/lib/template-audit.ts` identifica la tarea como '<plantilla> › <tarea>' (templateTaskLabel) y muestra las referencias a personas y repositorios como 'asignado'/'sin asignar', sin UUID. Un cambio de una persona a otra se ve igual antes y después.

Todos estos registros sólo aparecen en GET /api/audit-log (requireRole('admin')), que proyecta taskId pero no spaceId.

_Origen: retrospectiva de «Registrar en la auditoría la edición y el borrado de comentarios de proyecto» (20261112-110947-3c7a38c389); retrospectiva de «Auditar las mutaciones de plantillas con logAudit dentro de db.transaction» (20261114-161710-4eb214fb21); retrospectiva de «Registrar en la auditoría los cambios de fecha meta de los hitos» (20261112-110938-f7363a405c)_

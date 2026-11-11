# Mutaciones: escritura y logAudit en db.transaction

En rutas de mutación, hacer la escritura y logAudit({...}, tx) dentro de la misma db.transaction, y no llamar a ninguno en las respuestas 400/401/403/404. Si la acción la hace un admin sobre contenido ajeno, añadir `reason`. Las etiquetas de acciones nuevas van en los ACTION_LABELS de tareas/[id]/page.tsx y admin/bitacora/page.tsx.

_Origen: retrospectiva de «Registrar en la auditoría la edición y el borrado de comentarios de tarea» (20261111-024103-f22a20cc23)_

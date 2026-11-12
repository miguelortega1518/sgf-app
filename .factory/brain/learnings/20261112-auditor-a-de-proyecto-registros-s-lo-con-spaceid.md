# Auditoría de proyecto: registros sólo con spaceId

Los registros de audit_log de comentarios de proyecto llevan spaceId y no taskId, así que no salen en GET /api/tasks/[id] y sólo los ve GET /api/audit-log (admin). Si se añade una vista de actividad por proyecto para no admins, hay que filtrar previousValue de los comentarios. GET /api/audit-log aún no proyecta spaceId.

_Origen: retrospectiva de «Registrar en la auditoría la edición y el borrado de comentarios de proyecto» (20261112-110947-3c7a38c389)_

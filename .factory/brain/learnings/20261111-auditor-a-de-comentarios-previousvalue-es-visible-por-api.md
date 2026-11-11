# Auditoría de comentarios: previousValue es visible por API

Guardar texto de usuario en audit_log.previousValue lo expone en GET /api/tasks/[id] a cualquier lector de la tarea, aunque la UI no lo pinte. Antes de auditar contenido sensible (comentarios borrados), considerar este alcance de lectura.

_Origen: retrospectiva de «Registrar en la auditoría la edición y el borrado de comentarios de tarea» (20261111-024103-f22a20cc23)_

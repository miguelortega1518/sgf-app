# Auditoría de plantillas: sin taskId ni spaceId

Las plantillas y sus tareas no tienen fila en spaces ni tasks, y audit_log.taskId y spaceId son FK. Los logAudit de plantillas (template_*) van sin ambos campos, y la plantilla se identifica por nombre en previousValue/newValue ('<plantilla> › <tarea>'). Solo aparecen en la Bitácora de admin. Los textos nunca llevan UUID; las referencias se muestran como 'asignado'/'sin asignar', y un cambio de persona a persona se ve igual antes y después.

_Origen: retrospectiva de «Auditar las mutaciones de plantillas con logAudit dentro de db.transaction» (20261114-161710-4eb214fb21)_

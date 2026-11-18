# Reason de auditoría como referencia interna oculta

task_sprint_changed guarda en `reason` el JSON {from,to} con ids de sprint. La Bitácora y la Actividad lo ocultan en audit-entry-detail.tsx, pero /api/audit-log y /api/tasks/[id] lo devuelven en bruto. Cualquier superficie nueva que lea audit_log.reason (exportes, integraciones) debe ignorarlo para esa acción.

_Origen: retrospectiva de «Fase 2 (5/8): burndown y velocidad con tendencia por sprint» (20261118-163811-7641e66676-452fcc)_

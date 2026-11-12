# Etiquetas de nuevas acciones de auditoría

Al añadir una acción nueva a logAudit, añade su etiqueta en español a AUDIT_ACTION_LABEL y su chip a AUDIT_ACTION_CHIP en src/lib/labels.ts, y añade la acción a KNOWN_ACTIONS de tests/audit-action-labels.test.ts. Escribe el literal de `action:` en línea, sin variables, para que lo detecte el extractor del test. No crees mapas locales en las páginas.

_Origen: retrospectiva de «Registrar en la auditoría el alta y la baja de dependencias entre tareas» (20261112-110955-62bcd7e74c)_

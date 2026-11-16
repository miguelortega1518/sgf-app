# Etiquetas y valores de auditoría

- Todo texto visible de una acción de audit_log sale de AUDIT_ACTION_LABEL/auditActionLabel() y AUDIT_ACTION_CHIP/auditActionChip() en `src/lib/labels.ts`. No definas mapas locales en las páginas ni uses `|| entry.action`.
- Al emitir una acción nueva con logAudit, añade su etiqueta en español a AUDIT_ACTION_LABEL, su chip a AUDIT_ACTION_CHIP y la acción a KNOWN_ACTIONS de `tests/audit-action-labels.test.ts`.
- Escribe el valor de `action:` como literal de string en línea, sin variables, para que lo detecte el extractor del test.
- Guarda en previousValue/newValue texto legible, nunca JSON ni UUID: el nombre del objeto (`Nombre: valor`) y, para referencias, 'asignado'/'sin asignar' como en `src/lib/template-audit.ts`.

tests/audit-action-labels.test.ts falla si falta una etiqueta, si `action:` no es literal o si una página de src/app define ACTION_LABELS o ACTION_COLORS.

_Origen: retrospectiva de «Centralizar en labels.ts las etiquetas de las acciones de auditoría y cubrir con un test todas las acciones que se registran» (20261111-024748-639a56d50a); retrospectiva de «Registrar en la auditoría el alta y la baja de dependencias entre tareas» (20261112-110955-62bcd7e74c); retrospectiva de «Auditar alta, baja y cambios de name/completed/order de hitos» (20261112-160302-c57a704f2f); retrospectiva de «Auditar las mutaciones de plantillas con logAudit dentro de db.transaction» (20261114-161710-4eb214fb21)_

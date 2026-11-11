# Etiquetas de auditoría: usar auditActionLabel

Todo texto visible de una acción de audit_log sale de AUDIT_ACTION_LABEL/auditActionLabel() y AUDIT_ACTION_CHIP/auditActionChip() en src/lib/labels.ts. No definas mapas locales ni uses `|| entry.action`. Al emitir una acción nueva con logAudit({ action: '...' }), añade su etiqueta en labels.ts; tests/audit-action-labels.test.ts falla si falta, y exige literales en `action:`.

_Origen: retrospectiva de «Centralizar en labels.ts las etiquetas de las acciones de auditoría y cubrir con un test todas las acciones que se registran» (20261111-024748-639a56d50a)_

# Importador CSV: decisiones y trampas

El importador CSV (`/api/spaces/[id]/import-csv`) separa `analyzeCsvImport` (puro) de `resolveCsvImport` (con Map), carga el contexto en bloque en tres consultas y audita con `insert(auditLog)` directo, porque `logAudit` es de una fila y es núcleo. Por eso el extractor de `tests/audit-action-labels.test.ts` reconoce también `insert(auditLog)`. El rate limit usa `recordFailure` como contador (3 por ventana de 15 min). Los importadores de Jira, Linear y GitHub deben reutilizar este motor.

_Origen: retrospectiva de «Fase 1: importar tareas desde CSV (vista previa, todo o nada, 200 tareas en menos de un minuto)» (20261117-032014-1c72893841)_

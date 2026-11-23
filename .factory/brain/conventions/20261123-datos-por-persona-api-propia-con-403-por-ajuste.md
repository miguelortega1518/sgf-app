# Datos por persona: API propia con 403 por ajuste

Los datos por persona van en endpoints separados de los totales del equipo (/api/metrics/people, /api/reports/persona). Estos comprueban `getTeamSettings()` justo tras `requireSession` y responden 403 con `PERSON_METRICS_DISABLED_MESSAGE` (error con `httpStatus`, que `handleError` respeta). Las listas por persona se ordenan por carga abierta y luego por nombre, sin posiciones ni medallas. Todo dato por persona nuevo debe respetar este ajuste (DECISIONES §22).

_Origen: retrospectiva de «Fase 2 (8/8): métricas por persona opcionales y sin rankings» (20261123-030401-179b7039a0-416fd7)_

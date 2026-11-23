# Ajustes globales: fila única sin sembrar

Los ajustes globales del equipo viven en `team_settings` (una fila, id=1). No se siembra: `getTeamSettings()` devuelve los valores por defecto si no hay fila y el primer PATCH hace upsert. Si se necesita auditar el valor previo con exactitud bajo concurrencia, `FOR UPDATE` no basta sin fila: sembrar la fila en la migración o usar `INSERT ... ON CONFLICT DO NOTHING` antes de leer.

_Origen: retrospectiva de «Fase 2 (8/8): métricas por persona opcionales y sin rankings» (20261123-030401-179b7039a0-416fd7)_

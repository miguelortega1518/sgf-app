# El seed usa UTC y se desfasa de 20:00 a 24:00 RD

`scripts/seed.ts` calcula las fechas con `toISOString().slice(0, 10)` (UTC). Entre las 20:00 y las 24:00 RD las fechas del seed quedan un día adelantadas, así que criterios como 'Mañana'/'en 2 días' parecen fallar en QA aunque el código sea correcto. Corregir `iso()` con `addDaysRD` antes de depender del seed en criterios de fecha relativa.

_Origen: retrospectiva de «Mostrar cuánto falta para la fecha límite en las tarjetas de tarea» (20261112-024304-799d64c509)_

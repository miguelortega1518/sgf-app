# Seed ya usa addDaysRD, no UTC

`iso()` en scripts/seed.ts delega en `addDaysRD(offsetDays)` (import relativo '../src/lib/date-utils'). Un test en tests/today-rd-usage.test.ts prohíbe `toISOString().slice(0, 10)` en el seed. Los `Date.now()` de `completedAt` y `createdAt` son instantes, no fechas de calendario, y se dejan como están. Esto sustituye la nota que decía que el seed usaba UTC.

_Origen: retrospectiva de «Corregir el seed para calcular fechas en hora RD» (20261112-031304-f0b7c8fb09)_

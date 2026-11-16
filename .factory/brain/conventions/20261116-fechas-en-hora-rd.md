# Fechas en hora RD

Usa los helpers de `@/lib/date-utils` (zona America/Santo_Domingo):
- Para «hoy» o para saber si una tarea está vencida, usa todayRD() e isOverdue(dueDate, status). isOverdue ya excluye 'completada': no dupliques esa condición ni definas un isOverdue local.
- Para la fecha de calendario de un instante (completedAt, blockedSince…), usa toDateRD.
- Para ventanas de días, usa addDaysRD, y valida antes la entrada (entero acotado con zod): con NaN devuelve 'NaN-NaN-NaN'.
- Para formatear un Date en fecha local, usa toLocalDateString. Para el ancla por defecto de los ciclos de plantillas, usa lastDayOfPreviousMonth.

Nunca uses `toISOString().slice(0, 10)` fuera de `UTC_ALLOWED`: da la fecha UTC, que entre las 20:00 y las 24:00 RD ya es el día siguiente, y en zonas con UTC positivo, como Asia/Tokyo, el día anterior. tests/today-rd-usage.test.ts lo comprueba.

En los tests:
- Fija la hora con vi.useFakeTimers() + vi.setSystemTime() en una hora UTC cercana a medianoche (p. ej. 01:00Z = 21:00 RD), para cubrir el caso en que UTC y RD caen en días distintos.
- Si cambias process.env.TZ en caliente, guarda el valor original y restáuralo en afterEach (con delete si era undefined), porque el cambio afecta a todo el worker de vitest. Añade un caso de control que reproduzca el bug (p. ej. con TZ Asia/Tokyo) para confirmar que el cambio de zona surte efecto.

_Origen: Las tareas aparecen vencidas antes de tiempo por usar la fecha UTC (20261105-034116-cf6ee663d7); Fechas en UTC en las páginas de administración (feriados y plantillas) (20261105-035823-07da2bc696)_

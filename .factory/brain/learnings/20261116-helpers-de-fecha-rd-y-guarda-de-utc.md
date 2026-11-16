# Helpers de fecha RD y guarda de UTC

`src/lib/date-utils.ts` (zona America/Santo_Domingo) ofrece estos helpers:
- `todayRD()`: hoy en RD (YYYY-MM-DD).
- `toDateRD(date: Date | string)`: fecha de calendario RD de un instante (p. ej. completedAt). Se monta con Intl.formatToParts y no depende de process.env.TZ.
- `addDaysRD(days)`: todayRD() + N días con aritmética Date.UTC + getUTC*. Admite negativos.
- `relativeDueRD(dueDate, today?)`: «Hoy», «Mañana», «en N días», «Ayer» o «hace N días», con la misma aritmética de calendario.
- `toLocalDateString(date)`: YYYY-MM-DD según la fecha local del proceso.
- `lastDayOfPreviousMonth(ref)`: `new Date(y, m, 0)` con formato local; es el ancla por defecto de los ciclos de plantillas.
- `formatDateRD(dateStr)`: DD/MM/YYYY.
- `isOverdue(dueDate, status)`: ya devuelve false para 'completada' y para dueDate nulo.

addDaysRD no valida su entrada: con NaN devuelve 'NaN-NaN-NaN'. Su único uso con entrada de usuario, `/api/reports/vencimientos/route.ts`, valida `days` con zod (entero de 0 a 365, DAYS_MESSAGE) antes de llamarlo.

`tests/today-rd-usage.test.ts` falla si encuentra `toISOString().slice(0, 10)` en:
- src/app/(app) y src/app/api, recorridos de forma recursiva;
- src/lib, salvo la lista `UTC_ALLOWED`: validation.ts (comprueba en UTC a propósito que una fecha ISO no desborda) y metrics.ts (semanas desde el lunes 00:00 UTC);
- scripts/seed.ts, que además tiene que importar addDaysRD desde '../src/lib/date-utils'.
También exige que una lista de vistas (kanban-board, espacios/[id], mi-equipo, calendario, admin/feriados, admin/plantillas/[id]) importe de '@/lib/date-utils', y que kanban-board llame a `isOverdue(task.dueDate, task.status)` sin definir un isOverdue local.

En `scripts/seed.ts`, `iso(offsetDays)` delega en `addDaysRD(offsetDays)`. Los `Date.now()` de `completedAt` y `createdAt` son instantes, no fechas de calendario.

_Origen: Fechas en UTC en las páginas de administración (feriados y plantillas) (20261105-035823-07da2bc696); ampliado a src/app/api y src/lib (20261109-232519-da7b397dea); Las tareas aparecen vencidas antes de tiempo por usar la fecha UTC (20261105-034116-cf6ee663d7); retrospectiva de «Calcular en hora RD las fechas que guarda y muestra el servidor (blockedSince, cierre de proyecto, reportes y exportes)» (20261109-232519-da7b397dea); retrospectiva de «Corregir el seed para calcular fechas en hora RD» (20261112-031304-f0b7c8fb09)_

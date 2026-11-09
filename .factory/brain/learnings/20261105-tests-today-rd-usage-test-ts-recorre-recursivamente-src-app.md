# tests/today-rd-usage.test.ts recorre recursivamente src/app/

tests/today-rd-usage.test.ts recorre recursivamente src/app/(app) y src/app/api, y falla si algún .ts/.tsx contiene 'toISOString().slice(0, 10)'. También recorre src/lib con una lista de excepciones explícita (`UTC_ALLOWED`): validation.ts (valida que la fecha ISO no desborda, en UTC a propósito) y metrics.ts (semanas desde el lunes 00:00 UTC). Cualquier página, ruta de API o módulo de src/lib nuevo debe usar los helpers de date-utils, o el test fallará.

Helpers disponibles en src/lib/date-utils.ts para el servidor:
- `todayRD()`: hoy en RD (YYYY-MM-DD).
- `toDateRD(date: Date | string)`: fecha de calendario RD de un instante (p. ej. completedAt). Usa Intl.formatToParts, no depende de process.env.TZ.
- `addDaysRD(days)`: todayRD() + N días con aritmética de fecha pura (Date.UTC + getUTC*), para ventanas como la de reports/vencimientos.

_Origen: Fechas en UTC en las páginas de administración (feriados y plantillas) (20261105-035823-07da2bc696); ampliado a src/app/api y src/lib (20261109-232519-da7b397dea)_

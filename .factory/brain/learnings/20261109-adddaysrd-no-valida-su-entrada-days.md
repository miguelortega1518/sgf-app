# addDaysRD no valida su entrada: days

En /api/reports/vencimientos, `days` sale de parseInt sin validar y addDaysRD devuelve 'NaN-NaN-NaN' si no es un entero finito, lo que acaba en un 500 de Postgres. Al usar addDaysRD con entrada de usuario, validar antes `days` (p. ej. con zod, entero acotado) o hacer que el helper falle pronto.

_Origen: retrospectiva de «Calcular en hora RD las fechas que guarda y muestra el servidor (blockedSince, cierre de proyecto, reportes y exportes)» (20261109-232519-da7b397dea)_

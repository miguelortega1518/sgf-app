# Zod en query: acotar siempre enteros

Al validar parámetros numéricos de query con z.coerce.number(), pon siempre .int() y un .max() razonable, también en page/offset, no solo en limit. Un entero enorme pasa .int().min(1) y puede producir un offset o una consulta que Postgres rechaza con 500. Usa `searchParams.get(x) ?? undefined` para que .default() solo actúe cuando falta el parámetro, porque z.coerce convierte '' en 0.

_Origen: retrospectiva de «Validar con zod los parámetros numéricos de query en /api/reports/vencimientos (days) y GET /api/notifications (page, limit)» (20261111-024100-467261aa0a)_

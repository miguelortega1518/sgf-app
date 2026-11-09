# Tests de rutas API: usar handleError real

En tests de rutas API no simular '@/lib/api-utils': el mock de users-route devuelve 500 para ZodError y UNAUTHORIZED, ocultando el contrato 400/401. Usar el handleError real (no toca la BD) y espiar logger.error para comprobar que los 400 y 401 no registran errores no controlados.

_Origen: retrospectiva de «Validar con zod el PATCH de /api/notifications y marcar como leídas en una sola consulta» (20261109-230638-0cd61e2103)_

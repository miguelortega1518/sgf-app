# Contrato de handleError() en src/lib/api-utils.ts: SyntaxErr

Contrato de handleError() en src/lib/api-utils.ts: SyntaxError→400 'JSON inválido'; pg 23505 (directo o en err.cause, envoltorio de Drizzle)→409; ZodError→400 con mensajes unidos por ', '; err.httpStatus 4xx/5xx se respeta (otros valores se ignoran → 500); mensajes UNAUTHORIZED/FORBIDDEN/PASSWORD_CHANGE_REQUIRED→401/403/403 con code. Los errores no controlados devuelven 500 con errorId hex de 8 caracteres y 'Error interno (ref. id)', sin filtrar el mensaje interno; ECONNREFUSED/ENOTFOUND→503 (log 'db_unavailable') y 42703→500 'La base de datos no está al día' (log 'schema_mismatch'). Solo los no controlados llaman a logger.error.

_Origen: Añadir tests a handleError() (src/lib/api-utils.ts) (20261105-042059-ae95a0d0b0)_

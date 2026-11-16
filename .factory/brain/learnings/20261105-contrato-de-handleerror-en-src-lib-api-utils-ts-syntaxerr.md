# Contrato de handleError() en src/lib/api-utils.ts

handleError() responde así, en este orden:
- SyntaxError → 400 'JSON inválido'.
- pg 23505, directo o en err.cause (envoltorio de Drizzle) → 409.
- ZodError → 400 con los mensajes unidos por ', '.
- err.httpStatus entre 400 y 599 → ese estado con err.message; otros valores se ignoran.
- Mensajes UNAUTHORIZED / FORBIDDEN / PASSWORD_CHANGE_REQUIRED → 401 / 403 / 403 (este último con `code`).

Lo demás son errores no controlados: llaman a logger.error y responden con un errorId de 8 caracteres hex (`randomUUID().slice(0, 8)`, newErrorId en `src/lib/errors.ts`), sin filtrar el mensaje interno. classifyError recorre err.cause (hasta 6 niveles y el primer error de un AggregateError) y decide:
- db_unavailable → 503 'No hay conexión con la base de datos… (ref. id)'. Códigos: ECONNREFUSED, ENOTFOUND, ETIMEDOUT, ECONNRESET, EAI_AGAIN, CONNECT_TIMEOUT, CONNECTION_CLOSED/ENDED/DESTROYED, 57P01-03, 08000-08006, 28000, 28P01, 3D000 y 53300, o mensajes como getaddrinfo y 'password authentication failed'.
- schema_mismatch → 500 'La base de datos no está al día… (ref. id)'. Códigos: 42P01 (tabla inexistente), 42703 (columna inexistente) y 22P02 si el mensaje habla de enum.
- unknown → 500 'Error interno (ref. id)', registrado como 'unhandled_api_error'.

El evento del log es la clase (db_unavailable, schema_mismatch o unhandled_api_error). Los detalles pasan por redact(), que quita los params de la consulta y recorta a 300 caracteres.

_Origen: Añadir tests a handleError() (src/lib/api-utils.ts) (20261105-042059-ae95a0d0b0)_

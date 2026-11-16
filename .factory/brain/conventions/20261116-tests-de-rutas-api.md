# Tests de rutas API

- No simules '@/lib/api-utils': usa el handleError real, que no toca la BD. Un mock que devuelve 500 para ZodError y UNAUTHORIZED oculta el contrato 400/401. `tests/users-route.test.ts` y `tests/auth-me.test.ts` todavía lo simulan; no los copies en ese punto.
- Espía el logging con `vi.spyOn(logger, 'error').mockImplementation(() => {})` en beforeEach y llama a `vi.restoreAllMocks()` en afterEach. Comprueba que los 400 y 401 no registran errores no controlados.
- Simula los errores de Postgres/Drizzle con `Object.assign(new Error(msg), { code })` o `{ cause }`.
- Para ids, usa `crypto.randomUUID()`: `z.string().uuid()` de zod 4 valida versión y variante y rechaza literales como '00000000-0000-0000-0000-000000000001'. Los ids de la BD (gen_random_uuid) son v4.
- Para módulos que tocan la BD fuera de una ruta (p. ej. email.ts), mockea '@/lib/db', '@/lib/db/schema' y 'drizzle-orm' con vi.hoisted, como en `tests/email.test.ts`. Sustituye fetch con `vi.stubGlobal('fetch', …)` y restaura process.env.RESEND_API_KEY en afterEach.
- En mutaciones idempotentes, mockea la cadena insert→values→onConflictDoNothing→returning y comprueba que logAudit recibe el `tx`.

_Origen: retrospectiva de «Validar con zod el PATCH de /api/notifications y marcar como leídas en una sola consulta» (20261109-230638-0cd61e2103); Añadir tests a handleError() (src/lib/api-utils.ts) (20261105-042059-ae95a0d0b0); retrospectiva de «Escapar el HTML de título y cuerpo en los correos de notificación (src/lib/email.ts) y cubrirlo con tests» (20261109-225457-80b408fe35); retrospectiva de «Registrar en la auditoría el alta y la baja de dependencias entre tareas» (20261112-110955-62bcd7e74c)_

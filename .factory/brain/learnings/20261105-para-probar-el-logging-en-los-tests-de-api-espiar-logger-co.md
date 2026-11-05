# Para probar el logging en los tests de API, espiar logger co

Para probar el logging en los tests de API, espiar logger con vi.spyOn(logger, 'error').mockImplementation(() => {}) en beforeEach y llamar a vi.restoreAllMocks() en afterEach; los errores Postgres/Drizzle se simulan con Object.assign(new Error(msg), { code }) o { cause }.

_Origen: Añadir tests a handleError() (src/lib/api-utils.ts) (20261105-042059-ae95a0d0b0)_

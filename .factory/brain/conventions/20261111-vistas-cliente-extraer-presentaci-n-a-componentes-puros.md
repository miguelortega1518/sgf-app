# Vistas cliente: extraer presentación a componentes puros

Las páginas de `src/app/(app)` son client components con fetch en useEffect y no se pueden probar con renderToStaticMarkup. La lógica de render condicional (p. ej. el detalle de auditoría) va en componentes puros en `src/components/<área>/`, sin hooks ni fetch, y se prueba con `renderToStaticMarkup` + `createElement` como en `tests/new-task-form.test.tsx`.

_Origen: retrospectiva de «Mostrar el motivo (reason) de la auditoría en bitácora e historial de tarea» (20261111-080037-f5b4af9b8f)_

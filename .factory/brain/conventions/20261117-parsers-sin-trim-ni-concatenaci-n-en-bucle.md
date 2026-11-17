# Parsers: sin trim ni concatenación en bucle

En analizadores carácter a carácter no llames a `trim()` ni a otras operaciones O(n) sobre una cadena construida con `+=` dentro del bucle: las cadenas cons de V8 se aplanan y el coste se vuelve cuadrático. Lleva un booleano de estado (p. ej. `fieldBlank`). Añade siempre un test de rendimiento con entrada patológica (`'a' + '"'.repeat(1_000_000)`) y `performance.now() < 1000`.

_Origen: retrospectiva de «Fase 1: importar tareas desde CSV (vista previa, todo o nada, 200 tareas en menos de un minuto)» (20261117-032014-1c72893841)_

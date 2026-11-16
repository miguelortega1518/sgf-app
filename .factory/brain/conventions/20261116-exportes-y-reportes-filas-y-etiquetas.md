# Exportes y reportes: filas y etiquetas

- Construye toda fila de XLSX/PDF con las funciones de `src/lib/export-rows.ts` (taskExportRow, personaReportRow, repoReportRow, dueReportRow). Ese módulo toma STATUS_LABEL, PRIORITY_LABEL, SPACE_TYPE_LABEL, AREA_LABEL y delayReasonLabel de labels.ts; la marca sale de APP_NAME (`src/app/api/export/route.ts`).
- Las columnas se llaman 'Proyecto' y 'Repositorio', nunca 'Espacio' ni 'Empresa'. No definas mapas de etiquetas locales en src/app/api/export ni en src/app/api/reports: tests/export-vocabulary.test.ts lo prohíbe, y también las cadenas 'Empresa', 'Espacio' y 'SGF'.
- labelOr de export-rows.ts hace `map[v] ?? v`, que devuelve una propiedad del prototipo si v es 'constructor' o '__proto__'. Solo es seguro con enums de BD. Con entrada de usuario, usa Object.hasOwn(map, v) o un Map, como auditActionLabel y delayReasonLabel.

_Origen: retrospectiva de «Usar el vocabulario de labels.ts en los exportes y reportes (XLSX/PDF)» (20261109-233118-ca6961fb43)_

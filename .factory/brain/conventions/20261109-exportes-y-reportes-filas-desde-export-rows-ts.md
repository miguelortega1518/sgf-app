# Exportes y reportes: filas desde export-rows.ts

Toda fila de XLSX/PDF se construye con las funciones de src/lib/export-rows.ts (taskExportRow, personaReportRow, repoReportRow, dueReportRow). Ese módulo usa STATUS_LABEL, PRIORITY_LABEL, SPACE_TYPE_LABEL, AREA_LABEL y APP_NAME de labels.ts. Las columnas se llaman 'Proyecto' y 'Repositorio', nunca 'Espacio' ni 'Empresa'. No definas mapas de etiquetas locales en src/app/api/export ni en src/app/api/reports: tests/export-vocabulary.test.ts lo prohíbe, y también las cadenas 'Empresa', 'Espacio' y 'SGF'.

_Origen: retrospectiva de «Usar el vocabulario de labels.ts en los exportes y reportes (XLSX/PDF)» (20261109-233118-ca6961fb43)_

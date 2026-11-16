# Plantillas e import-excel: límites y validación

`src/lib/schemas/template.ts` define los límites: TEMPLATE_NAME_MAX (200) para nombres de plantilla y de tarea de plantilla, TEMPLATE_TEXT_MAX (5000) para instructions, doneDefinition y notApplicableReason, e IMPORT_EXCEL_MAX_BYTES (5 MiB), IMPORT_EXCEL_MAX_SHEETS (50) e IMPORT_EXCEL_MAX_ROWS (2000 filas sumando todas las hojas).

POST /api/templates/import-excel (`src/app/api/templates/import-excel/route.ts`) valida en este orden: requireRole('admin'), Content-Length, formData (con try/catch), presencia y tamaño de file, tipos de templateName y targetCycleDays, XLSX.read con sheetRows, número de hojas y de filas. Por último escribe todo en una db.transaction. Esta ruta no pasa por Zod: los nombres se recortan con clampTemplateName (trim y slice a TEMPLATE_NAME_MAX).

Pendientes en el código actual:
- `textTooLong('Las instrucciones')` todavía produce «Las instrucciones no puede superar…», un error de concordancia.
- En import-excel, los mensajes de hojas y filas se montan con las constantes, pero FILE_TOO_LARGE sigue siendo un literal («…5 MB»).

_Origen: retrospectiva de «Validar y acotar la subida de import-excel (tamaño, filas y campos del formData)» (20261114-173934-79e38e2f17); retrospectiva de «Acotar la longitud máxima de los textos de plantillas en Zod» (20261114-171159-ad47f28bc1)_

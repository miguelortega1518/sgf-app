# import-excel: límites y orden de validación

POST /api/templates/import-excel valida en este orden: requireRole, Content-Length, formData (try/catch), tipos de campos, tamaño de file, XLSX.read con sheetRows, hojas y filas, y por último escribe todo en una db.transaction. Las constantes IMPORT_EXCEL_* viven en src/lib/schemas/template.ts. Los mensajes de límite deben construirse desde esas constantes, no con literales.

_Origen: retrospectiva de «Validar y acotar la subida de import-excel (tamaño, filas y campos del formData)» (20261114-173934-79e38e2f17)_

# Mensajes y límites de validación

- Al construir mensajes de error con helpers parametrizados por etiqueta, no asumas singular ni masculino: 'Las instrucciones no puede superar…' salió mal. Pasa el mensaje completo por campo o incluye el verbo ya conjugado. Los mensajes se devuelven tal cual en el 400.
- Construye los mensajes de límite desde las constantes (TEMPLATE_NAME_MAX, TEMPLATE_TEXT_MAX, IMPORT_EXCEL_*), no con literales.
- Acota la longitud de todo campo de texto que se copie a audit_log, también en las rutas que no pasan por Zod (p. ej. clampTemplateName en import-excel).

_Origen: retrospectiva de «Acotar la longitud máxima de los textos de plantillas en Zod» (20261114-171159-ad47f28bc1); retrospectiva de «Validar y acotar la subida de import-excel (tamaño, filas y campos del formData)» (20261114-173934-79e38e2f17)_

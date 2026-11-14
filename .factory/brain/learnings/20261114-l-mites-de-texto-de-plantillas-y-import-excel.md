# Límites de texto de plantillas y import-excel

Los textos de plantillas se acotan con TEMPLATE_NAME_MAX (200) y TEMPLATE_TEXT_MAX (5000) en src/lib/schemas/template.ts. import-excel no pasa por Zod: recorta con clampTemplateName. Cualquier campo nuevo de plantilla que se copie a audit_log debe acotarse también.

_Origen: retrospectiva de «Acotar la longitud máxima de los textos de plantillas en Zod» (20261114-171159-ad47f28bc1)_

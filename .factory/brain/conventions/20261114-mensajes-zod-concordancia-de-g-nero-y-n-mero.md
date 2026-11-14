# Mensajes Zod: concordancia de género y número

Al construir mensajes de error con helpers parametrizados por etiqueta, no asumas singular/masculino: 'Las instrucciones no puede superar…' salió mal. Pasa el mensaje completo por campo o incluye el verbo ya conjugado; los mensajes se devuelven tal cual en el 400.

_Origen: retrospectiva de «Acotar la longitud máxima de los textos de plantillas en Zod» (20261114-171159-ad47f28bc1)_

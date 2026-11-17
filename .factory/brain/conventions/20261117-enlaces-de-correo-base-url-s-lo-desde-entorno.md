# Enlaces de correo: base URL sólo desde entorno

En correos enviados por lotes (resumen diario, avisos) construye los enlaces con NEXT_PUBLIC_APP_URL y no caigas a req.nextUrl.origin ni a cabeceras de la petición (host header injection). Si falta la variable, falla o usa una constante conocida.

_Origen: retrospectiva de «Fase 1 (2/2): resumen diario por correo a las 7:30 RD» (20261117-201746-dc4c37afb2-a71d6f)_

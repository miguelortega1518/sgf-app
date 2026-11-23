# Carga inicial en cliente: no tragar errores del GET

En contenedores cliente que cargan estado con fetch (p. ej. ShareLinkSection), un fallo del GET inicial debe mostrar un error o estado «desconocido» y no el estado por defecto (como «sin enlace»). Ante un 404 de una mutación (recurso ya cambiado por otro usuario) refresca el estado local. Usa colores con variante dark: en paneles nuevos.

_Origen: retrospectiva de «Fase 2 (7/8): enlace de sólo lectura para no técnicos» (20261123-023743-566ad62dc2-57e46d)_

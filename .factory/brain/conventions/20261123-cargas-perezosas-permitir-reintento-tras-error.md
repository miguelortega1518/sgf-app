# Cargas perezosas: permitir reintento tras error

Si un contenedor cliente guarda un id en un set de peticiones hechas (p. ej. requestedClosed) para no repetir fetch, debe quitarlo cuando la petición falla, para que reabrir el panel reintente. Además, descarta respuestas que lleguen cuando el estado del recurso ya cambió (sprint cerrado en vuelo).

_Origen: retrospectiva de «Fase 2 (5/8): burndown y velocidad con tendencia por sprint» (20261123-023732-7641e66676-e71915)_

# UI condicional por permiso: usar el rol del proyecto

Para mostrar u ocultar acciones que el servidor protege con `requireProjectAccess(..., 'write')`, no basta el rol global (`user?.role !== 'observador'`). Si la página ya conoce el rol del usuario en el proyecto, úsalo, y trata `user` indefinido (sesión cargando) como sin permiso para no mostrar el control un instante.

_Origen: retrospectiva de «Fase 2 (4/8): flujo acumulado, distribución del tiempo de ciclo y límites WIP» (20261118-060406-8fced6850f-d4a29c)_

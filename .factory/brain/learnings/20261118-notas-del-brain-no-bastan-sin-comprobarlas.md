# Notas del Brain no bastan sin comprobarlas

La convención «UI condicional por permiso: usar el rol del proyecto» ya existía y el builder la ignoró: `canEditWipLimits` quedó con el rol global. Antes de dar por cerrada una pantalla con acciones protegidas por `requireProjectAccess(..., 'write')`, comprueba que la condición de visibilidad usa el rol del proyecto y trata `user` indefinido como sin permiso.

_Origen: retrospectiva de «Fase 2 (4/8): flujo acumulado, distribución del tiempo de ciclo y límites WIP» (20261118-060406-8fced6850f-d4a29c)_

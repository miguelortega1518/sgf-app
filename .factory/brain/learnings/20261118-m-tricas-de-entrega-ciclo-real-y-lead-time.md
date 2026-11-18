# Métricas de entrega: ciclo real y lead time

`cycleTime` mide de `startedAt` (primer paso a en_proceso/en_revision, vía `buildStatusHistory` sobre `audit_log` 'status_changed') a `completedAt`; `leadTime` mide de creación a cierre. Las tareas sin inicio usan `createdAt` y cuentan en `withoutStart`. Los eventos se cargan en bloque con una sola llamada a `loadStatusEvents(ids)`; nunca una consulta por tarea.

_Origen: retrospectiva de «Fase 2 (1/8): historial de estados, tiempo de ciclo real y antigüedad del trabajo en curso» (20261117-213503-5407b53a1c-eef9cb)_

# Vistas públicas: DTO con lista blanca y 404 uniforme

En páginas sin sesión, construye el DTO campo a campo (nunca copies objetos de entrada) y proyecta sólo las columnas necesarias en la consulta, sin joins con persons ni comments. Token inexistente, revocado y mal formado deben dar el mismo notFound(). Usa vocabulario PUBLIC_* de labels.ts, no STATUS_LABEL, que tiene jerga («En code review»).

_Origen: retrospectiva de «Fase 2 (7/8): enlace de sólo lectura para no técnicos» (20261123-023743-566ad62dc2-57e46d)_

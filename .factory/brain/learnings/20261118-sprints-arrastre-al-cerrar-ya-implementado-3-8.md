# Sprints: arrastre al cerrar ya implementado (3/8)

Desde la 3/8, al cerrar un sprint (PATCH /api/sprints/[id], `carryOverTo`) las tareas no completadas pasan al siguiente sprint planificado o al backlog en la misma transacción, con un `task_sprint_changed` por tarea. La nota «tareas de sprint cerrado quedan invisibles» sólo sigue valiendo para sprints cerrados antes de esa tarea: no hay backfill.

_Origen: retrospectiva de «Fase 2 (3/8): capacidad por persona, cierre con arrastre y retrospectiva automática» (20261118-163813-b270830a9f-ecd994)_

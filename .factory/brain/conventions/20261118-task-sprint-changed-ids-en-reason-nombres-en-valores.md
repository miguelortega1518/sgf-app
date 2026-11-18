# task_sprint_changed: ids en reason, nombres en valores

`task_sprint_changed` guarda nombres legibles en previousValue/newValue y los ids en `reason` como JSON `{from,to}` (`sprintChangeReason` / `parseSprintChangeReason` en sprint-history.ts). Para reconstruir qué tareas entraron en un sprint, usa `reason.to`; en eventos antiguos sin JSON, compara por nombre dentro del mismo spaceId. La UI de Bitácora oculta ese JSON, así que cualquier lectura nueva de `reason` debe aplicar la misma regla.

_Origen: retrospectiva de «Fase 2 (3/8): capacidad por persona, cierre con arrastre y retrospectiva automática» (20261118-163813-b270830a9f-ecd994)_

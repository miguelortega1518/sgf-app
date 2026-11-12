# Auditar cambios de fecha meta de hitos

El PATCH de hitos registra `milestone_date_changed` solo si targetDate viene y difiere de la actual. Lee el hito con `.for('update')` filtrando por id y spaceId dentro de `db.transaction`. previousValue y newValue usan el nombre previo del hito (`Nombre: YYYY-MM-DD`). El registro lleva spaceId, no taskId, así que solo se ve en la Bitácora.

_Origen: retrospectiva de «Registrar en la auditoría los cambios de fecha meta de los hitos» (20261112-110938-f7363a405c)_

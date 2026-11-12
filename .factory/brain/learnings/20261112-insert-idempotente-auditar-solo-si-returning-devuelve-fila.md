# Insert idempotente: auditar solo si returning devuelve fila

Cuando una mutación es idempotente (insert con onConflictDoNothing, delete), usa `.returning()` y llama a logAudit solo si devolvió filas, dentro de la misma db.transaction. En un DELETE sin filas, responde 404 y no audites. En los tests, mockea la cadena insert→values→onConflictDoNothing→returning y comprueba que logAudit recibe el `tx`.

_Origen: retrospectiva de «Registrar en la auditoría el alta y la baja de dependencias entre tareas» (20261112-110955-62bcd7e74c)_

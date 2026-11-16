# Mutaciones: transacción, logAudit e idempotencia

- En rutas de mutación, haz la escritura y `logAudit({...}, tx)` dentro de la misma db.transaction. No llames a ninguno de los dos en las respuestas 400/401/403/404.
- Si la acción la hace un admin sobre contenido ajeno, añade `reason`.
- Si la mutación es idempotente (insert con onConflictDoNothing, delete), usa `.returning()` y llama a logAudit solo si devolvió filas. En un DELETE sin filas, responde 404 y no audites. Ejemplo: `src/app/api/tasks/[id]/dependencies/route.ts`.
- Las etiquetas de las acciones nuevas siguen la convención de etiquetas y valores de auditoría (`20261116-etiquetas-y-valores-de-auditoria.md`).

_Origen: retrospectiva de «Registrar en la auditoría la edición y el borrado de comentarios de tarea» (20261111-024103-f22a20cc23); retrospectiva de «Registrar en la auditoría el alta y la baja de dependencias entre tareas» (20261112-110955-62bcd7e74c)_

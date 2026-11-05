# Cambios en la base de datos (regla que evita perder datos)

Fuente: `docs/OPERACIONES.md` §2. Todo cambio aquí es núcleo y requiere un humano.

1. Editar `src/lib/db/schema.ts`.
2. `npm run db:generate` crea `src/lib/db/migrations/NNNN_nombre.sql`. Revisar el SQL.
3. `npm run db:check` bloquea cambios destructivos y diarios incoherentes.
4. Las migraciones y los tests van en el mismo cambio.

Reglas:
- **Sólo cambios aditivos**: tabla nueva, columna nueva con valor por defecto, índice o valor de enum
  nuevos. La versión anterior de la app sigue corriendo mientras se compila la nueva.
- **Quitar, renombrar o endurecer algo se hace en dos despliegues.** Si de verdad hace falta en uno,
  el archivo lleva `-- allow-destructive: <motivo y respaldo tomado>`.
- **NUNCA `drizzle-kit push`** contra una base con datos (el 27-oct-2026 vació la tabla de tareas).
- La numeración y el diario de migraciones los lleva `drizzle-kit`; no se editan a mano.
- Si `schema.ts` cambia sin migración, el CI falla.
- Triggers de inmutabilidad: `due_date_original` (tareas) y `target_date_original` (hitos) no se
  pueden modificar. `audit_log` sólo admite inserciones.
- La fábrica NO tiene base de datos: los tests no deben depender de una conexión real.

# Decisiones de diseño

El registro completo está en `DECISIONES.md`, en la raíz del repo. Léelo con `read_file` cuando la
tarea toque una de estas áreas. Resumen de lo que más condiciona el trabajo diario:

- §1 Drizzle, no Prisma: constraints y triggers definidos junto al esquema.
- §2 Auth propia (JWT + bcrypt), sin Auth.js. Sin OAuth ni auto-registro.
- §3 UUID v4 generados por la base como claves primarias.
- §5 Las tareas copian los campos de la plantilla: cambiar una plantilla NO cambia tareas ya generadas.
- §9 `blocked_by_area` es un enum cerrado; `otro` + texto libre para excepciones.
- §13 Los nombres internos de la base NO cambian; sólo cambian las etiquetas (`labels.ts`).
- §14 Campos de tarea para desarrollo: `number` (FOR-142), `kind`, `estimate`, `branch`, `pr_url`, `labels`.
- §15 Kanban como vista principal, con actualización optimista y reversión.
- §16 Cualquier tarea puede pasar a code review; aprobar exige ser el revisor asignado o admin.
- §17 Los miembros ven todo el tablero del proyecto.
- §18 Métricas: velocidad, tiempo de ciclo (mediana y p85), trabajo en curso, bloqueos por área.

Las decisiones nuevas se añaden a `DECISIONES.md` y aquí. Cambiar una decisión es núcleo.

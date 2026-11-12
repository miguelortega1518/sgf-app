# Arquitectura de Forja (sgf-app)

Forja es un gestor de trabajo para equipos de desarrollo. Nació como SGF, un gestor financiero, y
conserva su motor (ver `DECISIONES.md` §12). La usa un equipo interno pequeño (unas 5 personas).

## Stack
- **Next.js 16** (App Router) como monolito: páginas y API en el mismo servicio. OJO: esta versión
  tiene cambios incompatibles con lo que conoces; ver `conventions/nextjs-16.md`.
- **React 19**, **Tailwind 4** (colores en variables de `src/app/globals.css`), iconos `lucide-react`.
- **PostgreSQL 18** con **Drizzle ORM** (`src/lib/db/schema.ts`). Triggers y funciones en
  `src/lib/db/custom-migrations.sql`.
- **Auth propia**: JWT (`jose`) en cookie HTTP-only `sgf-session` + `bcryptjs`. Sesión deslizante y
  control CSRF por `Origin` en `src/middleware.ts`.
- Validación con **zod 4** (`src/lib/schemas/*`). Exportes con `xlsx` y `pdfkit`.
- Tests con **Vitest** en `tests/` (entorno node; `tests/setup.ts` pone variables falsas: los tests
  NO usan una base real).
- Despliegue en **Render** (`render.yaml`, `docs/OPERACIONES.md`). `autoDeploy: false`.

## Mapa del código
- `src/app/(app)/…` — páginas autenticadas: `espacios` (proyectos), `tareas/[id]`, `mi-trabajo`,
  `mi-equipo`, `panorama` (métricas), `calendario`, `reportes`, `notificaciones`, `perfil`, `admin/*`.
- `src/app/(auth)/…` — login y cambio de contraseña.
- `src/app/api/<recurso>/route.ts` — API REST. Patrón: `success()` / `error()` / `handleError()` de
  `src/lib/api-utils.ts`; validar el cuerpo con el esquema zod; comprobar permisos con
  `src/lib/permissions.ts` y `src/lib/project-access.ts`; registrar en auditoría con `src/lib/audit.ts`.
- `src/lib/` — lógica de dominio pura y testeable: `task-transitions.ts` (máquina de estados),
  `metrics.ts`, `business-days.ts`, `date-utils.ts`, `labels.ts` (vocabulario visible), `notify.ts`.
- `src/components/{tasks,dashboard,layout,ui,providers}` — componentes de React.
- `scripts/` — migraciones, respaldos, restauración y semillas. Tocan datos reales: son núcleo.

## Modelo de datos (tablas)
`companies` (= Repositorio), `persons`, `holidays`, `space_templates`, `task_templates`,
`template_dependencies`, `spaces` (= Proyecto: Sprint/Iniciativa/Backlog), `space_members`,
`milestones`, `tasks`, `subtasks`, `task_dependencies`, `space_updates`, `comments`, `evidence`,
`audit_log` (sólo se añade, nunca se modifica), `notifications`, `rate_limits`.

Los nombres internos NO cambian aunque cambie la etiqueta visible (`DECISIONES.md` §13). Ejemplos:
`en_revision` → "En code review", `completada` → "Hecho".

## Núcleo (siempre con aprobación humana)
Autenticación y sesión, permisos y acceso a proyectos, rate limiting, el **mecanismo** de auditoría,
esquema y migraciones, scripts de datos, despliegue y dependencias. La lista exacta está en
`core_paths` de `factory.toml`: es la fuente de verdad sobre qué es núcleo.

Qué NO es núcleo, aunque lo parezca:
- **Usar la auditoría** no es tocar su núcleo. Añadir una llamada a `logAudit` en una ruta que muta
  datos, dentro de su `db.transaction`, con su etiqueta en `labels.ts`, es exactamente lo que pide
  la convención ("deja rastro en la auditoría en toda mutación") y se trata como cualquier otro
  cambio. Es núcleo sólo si cambia el mecanismo: `src/lib/audit.ts`, la tabla `audit_log` o su
  esquema, o la ruta de la Bitácora `src/app/api/audit-log/**`.
- Lo mismo con los permisos: llamar a `requireSession`, `requireRole` o a las comprobaciones de
  `src/lib/permissions.ts` desde una ruta no es núcleo; cambiar esos módulos sí.

# Decisiones de diseño

## 1. Drizzle sobre Prisma
**Decisión:** Usar Drizzle ORM en vez de Prisma.
**Razón:** Este proyecto requiere constraints a nivel de BD que Prisma no expresa nativamente: columnas inmutables vía triggers, tabla append-only vía revocación de permisos, CHECK constraints en comentarios. Drizzle permite definirlas junto al esquema y sus queries complejas (carga cruzada, propagación de dependencias) se expresan en SQL-like más naturalmente. La inferencia de tipos es más granular.

## 2. Auth propia (JWT + bcrypt) sobre Auth.js
**Decisión:** Implementar autenticación propia con JWT en cookie HTTP-only y bcrypt para passwords.
**Razón:** 5 usuarios internos, sin OAuth, sin auto-registro, sin magic links. Auth.js arrastra tablas (Account, Session, VerificationToken) que no se usan, su Credentials Provider está semi-deprecado, y la superficie de debugging es desproporcionada para un sistema de 5 personas. JWT + bcrypt es menos código, más predecible, y un solo mantenedor lo entiende completo.

## 3. UUIDs como primary keys
**Decisión:** Usar UUIDs v4 generados por la BD (`gen_random_uuid()`).
**Razón:** Permite generación client-side para optimistic updates, evita colisiones en seed scripts, y facilita merge de datos si algún día se necesita.

## 4. Estado `borrador` en espacios
**Decisión:** Agregar `borrador` al enum `space_status`.
**Razón:** La especificación dice que los ciclos recurrentes se generan "en estado borrador" para que el admin los revise antes de activar. Sin este estado, habría que usar un flag booleano separado, lo cual es menos expresivo.

## 5. Campos copiados de plantilla a tarea
**Decisión:** `requiresApproval`, `requiresEvidence`, `doneDefinition` e `instructions` se copian a cada tarea al generar el ciclo.
**Razón:** La tarea debe ser auto-contenida y no depender del estado actual de la plantilla. Si la plantilla cambia después, las tareas generadas previamente no deben mutar — eso es lo que garantiza el snapshot.

## 6. `delayReasonText` como campo separado
**Decisión:** Campo separado de `delayReason` para el texto libre.
**Razón:** `delayReason` es un enum validado a nivel de BD. El texto libre solo se exige cuando el motivo es `otro`. Mezclarlos en un solo campo rompe la validación del enum.

## 7. `target_date_original` en hitos protegido por trigger
**Decisión:** Mismo trigger de inmutabilidad que `due_date_original` en tareas.
**Razón:** La especificación dice que las fechas de hito "funcionan como las del cierre" — conservar original y registrar cambios. Si se protege una y no la otra, se crea una inconsistencia que produce datos poco fiables en las métricas de corrimientos.

## 8. Notificaciones in-app + correo
**Decisión:** Tabla `notifications` para campana in-app, además de correo. La campana es inmediata y recibe todos los avisos. El correo inmediato sale sólo para asignación, revisión y bloqueo (`task_assigned`, `review_assigned`, `task_review`, `task_blocked`; ver `src/lib/notification-email-policy.ts`). Lo demás (p. ej. `task_completed`) queda con `email_sent=false` y va en un resumen diario por correo que sale a las 7:30 RD los días laborables (sin fines de semana ni feriados). El disparador es un workflow programado de GitHub Actions que llama a `POST /api/cron/daily-digest` con `CRON_SECRET`; no se usa un cron job de Render por su coste (ver `docs/OPERACIONES.md` §12). Cada persona tiene sus preferencias en `persons`: `email_immediate` (avisos inmediatos) y `email_digest` (resumen diario), ambas activadas por defecto y editables en Mi perfil.
**Razón:** Lo importante no debe esperar: una asignación, una revisión pendiente o un bloqueo frenan el trabajo de otra persona si el aviso llega tarde. El resto no debe llenar la bandeja: un correo por cada tarea completada hace que se ignoren también los importantes. La campana da retroalimentación inmediata dentro del sistema; los dos canales son complementarios, no redundantes. Las preferencias por persona permiten apagar el correo sin perder la campana.

## 9. `blocked_by_area` como enum
**Decisión:** Lista cerrada (Compras, Operaciones, Tesorería, Contabilidad, Administración, Presupuesto, Otro).
**Razón:** Permite reportes limpios de días de bloqueo por área. Texto libre produce variantes ("banco", "Banco", "el banco Popular") que ensucian las métricas. `otro` + texto libre cubre los casos excepcionales.

## 10. Deploy en Render
**Decisión:** Un solo servicio Next.js + PostgreSQL managed en Render.
**Razón:** El equipo ya opera ERP CORVUS en Render y conoce el flujo (push → auto-deploy). Next.js como monolito simplifica a un solo servicio en vez de dos.

## 11. Directorio separado del ERP
**Decisión:** Proyecto en `sgf-app`, no dentro de ERP-Finca.
**Razón:** Son sistemas completamente distintos: diferente stack (FastAPI+React vs Next.js), diferente dominio, diferente base de datos. Compartir directorio solo crea confusión.


---

# Forja: conversión a herramienta para equipos de desarrollo

Rama: `forja-dev`. Este bloque documenta qué cambió respecto a la versión de finanzas (SGF) y por qué.

## 12. Producto: de gestor financiero a gestor de trabajo de desarrollo
**Decisión:** el producto pasa a llamarse **Forja**. Se conserva todo el motor (tareas, subtareas, dependencias, comentarios, evidencia, revisión, hitos, plantillas, notificaciones, auditoría) y cambia el vocabulario y los campos.
**Razón:** el 80 % del modelo ya servía para un equipo técnico. Reescribir habría costado semanas y perdido la auditoría y los permisos que ya funcionan.

## 13. Los nombres de la base de datos no cambian
**Decisión:** las tablas y valores internos siguen siendo `spaces`, `companies`, `en_revision`, etc. Solo cambian las etiquetas visibles (`src/lib/labels.ts`).
**Razón:** renombrar tablas exige una migración destructiva sobre datos en producción y no aporta nada al usuario. Mapa: espacio → Proyecto (recurrente = Sprint, proyecto = Iniciativa, continuo = Backlog); empresa → Repositorio; `en_revision` → En code review; `completada` → Hecho.

## 14. Campos nuevos en la tarea
`number` (serial, clave legible FOR-142), `kind` (feature, bug, mejora, deuda, chore), `estimate` (puntos de historia), `branch`, `pr_url`, `labels`.
**Razón:** son lo mínimo que un equipo usa a diario. La clave correlativa permite citar tareas en commits y chats. Aditivos y con valores por defecto: no rompen datos existentes.

## 15. Tablero Kanban como vista principal del proyecto
Arrastrar y soltar cambia el estado (con actualización optimista y reversión si el servidor rechaza). Lista queda como vista alternativa, y la preferencia se guarda por navegador. Mover a "Bloqueada" pide el motivo. Hay un selector "Mover a…" accesible por teclado y táctil.
**Razón:** es la forma en que los equipos técnicos esperan ver el trabajo, y es lo que más cambia la sensación de uso.

## 16. Code review sin obligación de aprobación
Se quitó la regla que impedía pasar a "En code review" si la tarea no requería aprobación. Aprobar sigue exigiendo ser el revisor asignado o admin.
**Razón:** en desarrollo cualquier tarea puede pedir revisión; obligar a marcarla antes era fricción.

## 17. Los miembros ven todo el tablero del proyecto
Antes un miembro solo veía sus propias tareas dentro de un proyecto.
**Razón:** un equipo técnico necesita ver qué hace el resto para no pisarse ni duplicar trabajo.

## 18. Métricas de entrega (Panorama del equipo)
Velocidad semanal en puntos, tiempo de ciclo (mediana y percentil 85), trabajo en curso por persona y bloqueos por área. Cálculo en `src/lib/metrics.ts` con pruebas.
**Razón:** mediana y percentil 85 en lugar de promedio, porque un par de tareas eternas distorsionan el promedio. Los bloqueos por área muestran dónde se atasca el equipo.
_Nota:_ el trabajo en curso por persona ya no es fijo: depende del ajuste «Mostrar métricas por persona» (§22) y se sirve en `/api/metrics/people`.

## 19. Identidad visual
Neutros grafito fríos y un único acento ámbar ("brasa"). Azul cielo para "En progreso" y "Feature" (distinto del acento y del rojo de Bug). Tipografía Geist. Los colores salen de variables en `globals.css`, que reasigna las paletas de Tailwind: el modo claro, el oscuro y el del sistema salen de un único sitio. Contraste comprobado en claro y oscuro.

## 20. Capacidad, cierre con arrastre y retrospectiva de sprint
- **Capacidad** (`sprint_capacity`): puntos por persona y sprint. Sin valor guardado se usa la **media** de puntos completados en los 3 últimos sprints cerrados en los que la persona participó (`src/lib/sprint-capacity.ts`); sin historial queda «Sin datos». La planificación avisa si lo asignado supera la capacidad.
- **Cierre con arrastre**: al cerrar, las tareas no completadas pasan al siguiente sprint planificado (o al que se elija) o al backlog, en la misma transacción que el cierre y con un `task_sprint_changed` por tarea. Las tareas de sprints cerrados antes de este cambio no se recuperan solas.
- **Retrospectiva** (`sprints.summary`, versión 1, `src/lib/sprint-summary.ts`): comprometido, completado, arrastrado, añadido a mitad de sprint (entradas posteriores a `started_at`), bloqueos por área al cierre y tiempo de ciclo con mediana y p85.
- **Ids en `reason`**: `task_sprint_changed` guarda `{"from","to"}` en `reason` para distinguir sprints homónimos. `previousValue`/`newValue` siguen siendo nombres legibles y la Bitácora oculta ese JSON.
- **Días hábiles** (`spaces.business_days_only`, activo por defecto): un sprint nuevo dura 10 días hábiles RD (sin fines de semana ni feriados) en lugar de 14 naturales, y el ciclo de la retrospectiva se cuenta en días hábiles.

**Razón:** la capacidad por defecto usa la media porque es un valor inicial editable, no una métrica (las métricas siguen en mediana y p85, §18). Arrastrar dentro del cierre evita que las tareas pendientes queden invisibles en un sprint cerrado.

## 21. Burndown y velocidad de sprint
- **Burndown** (`src/lib/sprint-burndown.ts`, `GET /api/sprints/[id]/burndown`): para el sprint activo y los cerrados. Se reconstruye con la auditoría, sin tablas nuevas. La pertenencia de cada tarea al sprint sale de `task_sprint_changed` (`sprintMembership` en `src/lib/sprint-history.ts`, con los ids de `reason` y, en los eventos antiguos, los nombres), reconciliada con el `sprint_id` actual. El estado de cada día sale de `status_changed` (`statusAt` / `reconcileHistory`). Una tarea cuenta en el alcance si pertenece al sprint en el corte y ya existía; si no está completada, cuenta también en lo que queda. Añadir, quitar o reabrir tareas a mitad de sprint mueve la línea. El corte de cada día es su final en hora RD (en el activo, como mucho ahora; los días futuros quedan sin dato). Con «Contar sólo días hábiles» se omiten fines de semana y feriados. La unidad es puntos si alguna tarea está estimada y, si no, tareas.
- **Congelación al cierre**: no hay `closed_at`, así que se usa `sprints.updated_at` de los cerrados, que no cambia porque el PATCH responde 409 a los sprints cerrados. La pertenencia se evalúa hasta 60 s antes de ese instante, porque la auditoría del arrastre usa la hora de la transacción. Así, las salidas del arrastre y las posteriores no bajan la línea, y el último día muestra lo que quedó pendiente. La estimación usada es la actual: no hay historial de cambios de `estimate`.
- **Velocidad** (`src/lib/sprint-velocity.ts`): lo completado en los últimos 6 sprints cerrados (de `summary.completed` o, en los cerrados antes de la retrospectiva, de sus tareas completadas actuales) con una **media móvil de 3 sprints**, calculada sobre todo el historial y desde el 2.º sprint. Con menos de 2 cerrados se muestra «Aún no hay datos suficientes».

**Razón:** la media móvil es una excepción explícita a «mediana y p85, no promedios» (§18). Aquí suaviza totales por sprint, que son pocos y comparables. No se aplica a duraciones de tareas, donde unas pocas tareas eternas sí distorsionan el promedio. Reconstruir el burndown con la auditoría reutiliza el historial que ya existe (fases 1/8 a 4/8) y evita guardar instantáneas diarias.

## 22. Ética de las métricas por persona
Mostrar métricas agregadas por persona es una **decisión explícita del equipo** (PLAN-PRODUCTO §5, «Ética de las métricas»), no un valor fijo del producto.
- **Ajuste global** «Mostrar métricas por persona» en `team_settings` (una sola fila, `id = 1`), **activado por defecto**: sin fila vale `true` (`getTeamSettings`, `src/lib/team-settings.ts`), así nada desaparece tras el despliegue. Se cambia en `/admin/ajustes`.
- **Sólo un admin** lo cambia (`PATCH /api/settings/team`, `requireRole('admin')`); cualquier rol lo lee. Cada cambio se **audita** como `person_metrics_setting_changed` («Métricas por persona: activadas/desactivadas»), en la misma transacción que el upsert; si el valor no cambia, no se audita.
- **Con el ajuste apagado** desaparecen de la interfaz el «Reporte por persona» de `/reportes` y las tarjetas por persona de `/panorama` («Trabajo en curso por persona» y «Por persona»). Sus APIs (`/api/reports/persona` y `/api/metrics/people`) responden **403** con un mensaje que explica la decisión, sin consultar personas ni tareas. Los **totales del equipo siguen visibles**: `/api/metrics` y `/api/dashboard` ya no llevan datos por persona.
- **Sin rankings**: las listas por persona se ordenan por **carga abierta** (`workInProgress`: en progreso + code review + bloqueadas; `personLoad`: no completadas), con desempate por nombre, nunca por lo completado. Sin números de posición, listas numeradas, medallas ni podios.
- Fuera de alcance: datos con nombre que no son métricas agregadas (responsable de cada tarea, Kanban, exportes, vencimientos, «Mi equipo», capacidad del sprint §20 y retrospectiva).

**Razón:** las métricas por persona sirven para equilibrar la carga, no para comparar personas. Que el equipo pueda apagarlas, y que quede auditado quién lo hizo, evita que se usen como ranking. Los totales del equipo viajan en APIs separadas para que apagar lo personal no oculte cómo va el equipo.

## Pendiente (no incluido en esta rama)
- Integración con GitHub: la fase 1 usa un webhook de repositorio firmado (`/api/integrations/github/webhook`, ver `docs/OPERACIONES.md` §10) que enlaza el PR y mueve el estado. La GitHub App con permisos mínimos queda para la fase 5; GitLab sigue sin definir.
- Las plantillas de sprint siguen usando "días hábiles" y feriados de RD.
- Los reportes exportados (PDF/Excel) conservan columnas y textos de la versión anterior.
- Los 33 errores de ESLint y las pruebas antiguas que importan `vitest` (no instalado) ya existían antes de esta rama.

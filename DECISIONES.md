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
**Decisión:** Tabla `notifications` para campana in-app, además de correo.
**Razón:** El correo agrupa máximo uno por hora. La campana da retroalimentación inmediata dentro del sistema. Los dos canales son complementarios, no redundantes.

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

## 19. Identidad visual
Neutros grafito fríos y un único acento ámbar ("brasa"). Azul cielo para "En progreso" y "Feature" (distinto del acento y del rojo de Bug). Tipografía Geist. Los colores salen de variables en `globals.css`, que reasigna las paletas de Tailwind: el modo claro, el oscuro y el del sistema salen de un único sitio. Contraste comprobado en claro y oscuro.

## Pendiente (no incluido en esta rama)
- Integración real con GitHub/GitLab (hoy la rama y el PR se escriben a mano). Requiere definir el proveedor y un webhook.
- Las plantillas de sprint siguen usando "días hábiles" y feriados de RD.
- Los reportes exportados (PDF/Excel) conservan columnas y textos de la versión anterior.
- Los 33 errores de ESLint y las pruebas antiguas que importan `vitest` (no instalado) ya existían antes de esta rama.

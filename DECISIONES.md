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

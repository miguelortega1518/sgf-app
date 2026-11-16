# Webhook GitHub

POST /api/integrations/github/webhook (`src/app/api/integrations/github/webhook/route.ts`) es una ruta pública. Su lógica pura está en `src/lib/github-webhook.ts`.

- Firma: lee GITHUB_WEBHOOK_SECRET de process.env en cada POST y comprueba X-Hub-Signature-256 con verifyGithubSignature (HMAC-SHA256 del cuerpo crudo, timingSafeEqual; ante cualquier entrada inválida devuelve false). Una firma inválida da 401 antes de tocar la BD.
- Persona de sistema: los cambios se auditan con GITHUB_ACTOR_EMAIL (`github@forja.system`), creada en la migración 0002 con rol `miembro`, inactiva y un password_hash que no es bcrypt. Las transiciones se aplican con rol miembro, así que el webhook no puede aprobar.
- Idempotencia: la primera operación de la transacción es el insert en githubDeliveries con onConflictDoNothing + returning. Si no devuelve filas, la entrega es un duplicado y no se toca nada.
- Enlace PR↔tarea: la clave FOR-<n> con prioridad rama > título > cuerpo (`extractTaskNumber(pr.head.ref, pr.title, pr.body)`). Los push a la rama por defecto cierran las claves precedidas por Closes/Fixes/Resolves.
- Estados (targetStatusFor): una tarea `completada` no cambia. Un PR listo pasa a `en_revision` y un borrador sólo enlaza. Un merge, o un push con Closes/Fixes/Resolves, completa la tarea, salvo que tenga requiresApproval o requiresEvidence; entonces queda en `en_revision`. Un PR cerrado sin fusionar devuelve a `en_proceso` sólo desde `en_revision`. En un proyecto cerrado no se toca nada.
- Avisos: los NotificationIntent se envían con notify() fuera de la transacción, cuando ya no hay filas bloqueadas con FOR UPDATE.

_Origen: retrospectiva de «Fase 1: GitHub mueve las tareas (webhook de PRs y commits)» (20261114-224951-def077dfa8)_

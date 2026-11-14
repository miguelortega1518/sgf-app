# Webhook GitHub: persona de sistema y firma

Los cambios del webhook de GitHub se auditan con la persona `github@forja.system` (inactiva, password_hash no bcrypt) y rol `miembro`, así que nunca puede aprobar. Cualquier ruta pública con firma debe responder 401 antes de tocar la base y leer el secreto de process.env en cada petición. La idempotencia usa `github_deliveries` con el insert `onConflictDoNothing` como primera operación de la transacción.

_Origen: retrospectiva de «Fase 1: GitHub mueve las tareas (webhook de PRs y commits)» (20261114-224951-def077dfa8)_

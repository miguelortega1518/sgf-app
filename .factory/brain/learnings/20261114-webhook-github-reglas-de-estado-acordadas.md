# Webhook GitHub: reglas de estado acordadas

El webhook nunca mueve una tarea `completada`. Un PR en borrador sólo enlaza. Un PR cerrado sin fusionar sólo devuelve a `en_proceso` desde `en_revision`. Un merge con requiresApproval o requiresEvidence deja la tarea en `en_revision`. El enlace PR↔tarea es la clave `FOR-<n>` con prioridad rama > título > cuerpo.

_Origen: retrospectiva de «Fase 1: GitHub mueve las tareas (webhook de PRs y commits)» (20261114-224951-def077dfa8)_

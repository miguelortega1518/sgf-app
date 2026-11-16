# Webhook GitHub: panel del PR sin API

Los eventos pull_request, pull_request_review, check_suite y check_run alimentan la tabla `github_pull_requests` (migración 0003) sin llamar a la API de GitHub. En un proyecto cerrado se actualiza el panel, pero no se enlaza ni se cambia el estado ni se audita; esto corrige la nota anterior. Review y checks sin fila del PR se ignoran antes de insertar en `github_deliveries`. El orden de bloqueo es tarea y luego PR. Las actualizaciones del panel no llaman a logAudit: el rastro queda en `github_deliveries.outcome`.

_Origen: retrospectiva de «Fase 1: panel del PR en la tarea (estado, revisores, checks y tiempo hasta la primera revisión)» (20261116-023459-ccf1a63069)_

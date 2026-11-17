# Resumen diario: ventana de novedades y digest_runs

El resumen diario no marca notifications.email_sent: deduplica con digest_runs.created_at (ventana desde el último resumen, 7 días si nunca). Se reclama (insert onConflictDoNothing) antes de enviar y se borra la fila si el envío falla. El workflow programado lo añade una persona, porque la fábrica no puede escribir en .github/workflows/.

_Origen: retrospectiva de «Fase 1 (2/2): resumen diario por correo a las 7:30 RD» (20261117-201746-dc4c37afb2-a71d6f)_

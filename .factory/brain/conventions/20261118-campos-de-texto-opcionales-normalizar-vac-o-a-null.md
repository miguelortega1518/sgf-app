# Campos de texto opcionales: normalizar vacío a null

En PATCH con campos opcionales y nullables como `goal`, convierte la cadena vacía en null en el esquema zod (transform) antes de comparar con el valor actual. Si no, `'' !== null` provoca auditorías espurias de «sin cambio». Comprueba que un valor igual no se audita.

_Origen: retrospectiva de «Fase 2 (2/8): sprints, backlog y asignar tareas a un sprint» (20261117-213427-b18229676c-ecb069)_

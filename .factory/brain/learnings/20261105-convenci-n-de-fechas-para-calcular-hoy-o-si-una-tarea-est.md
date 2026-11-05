# Convención de fechas: para calcular 'hoy' o si una tarea est

Convención de fechas: para calcular 'hoy' o si una tarea está vencida, usar siempre todayRD()/isOverdue(dueDate, status) de @/lib/date-utils (zona America/Santo_Domingo). Nunca usar new Date().toISOString().slice(0, 10): da la fecha UTC, que entre las 20:00 y las 24:00 hora RD ya es el día siguiente. tests/today-rd-usage.test.ts lo comprueba en las vistas de tareas.

_Origen: Las tareas aparecen vencidas antes de tiempo por usar la fecha UTC (20261105-034116-cf6ee663d7)_

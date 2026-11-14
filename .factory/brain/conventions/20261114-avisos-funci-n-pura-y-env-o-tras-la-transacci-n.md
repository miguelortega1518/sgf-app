# Avisos: función pura y envío tras la transacción

Las notificaciones derivadas de una mutación se calculan con una función pura que devuelve NotificationIntent[] (ver assignment-notifications.ts). Se envían con `notify(intent).catch(() => {})` después de que db.transaction se resuelva, nunca dentro, para no alargar el FOR UPDATE ni romper la operación. notify() no avisa a personas inactivas.

_Origen: retrospectiva de «Notificar cuando te asignan una tarea o una revisión» (20261114-181322-9e4521bc24)_

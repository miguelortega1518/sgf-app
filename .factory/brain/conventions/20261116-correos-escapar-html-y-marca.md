# Correos: escapar HTML y marca

- Todo texto de usuario (títulos de tarea, cuerpos) que se interpole en el HTML de un correo pasa por escapeHtml() de `src/lib/email.ts`. Los títulos no pasan por stripHtml: no asumas que estén limpios. El asunto es texto plano y va sin escapar.
- El nombre de marca sale de APP_NAME en labels.ts. El valor por defecto de EMAIL_FROM es configuración de despliegue: no lo cambies.

_Origen: retrospectiva de «Escapar el HTML de título y cuerpo en los correos de notificación (src/lib/email.ts) y cubrirlo con tests» (20261109-225457-80b408fe35)_

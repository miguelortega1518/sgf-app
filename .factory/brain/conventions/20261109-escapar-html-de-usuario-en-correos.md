# Escapar HTML de usuario en correos

Todo texto de usuario (títulos de tarea, cuerpos) que se interpole en HTML de correo debe pasar por escapeHtml() de src/lib/email.ts. El asunto es texto plano y va sin escapar. Los títulos no pasan por stripHtml, así que no se puede asumir que estén limpios.

_Origen: retrospectiva de «Escapar el HTML de título y cuerpo en los correos de notificación (src/lib/email.ts) y cubrirlo con tests» (20261109-225457-80b408fe35)_

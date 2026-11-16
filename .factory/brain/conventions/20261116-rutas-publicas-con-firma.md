# Rutas públicas con firma

En rutas públicas protegidas por firma (como el webhook de GitHub):
- Responde 401 antes de tocar la BD o de parsear el cuerpo.
- Lee el secreto de process.env en cada petición, no al cargar el módulo, para que rotarlo no exija reiniciar.
- Compara la firma en tiempo constante (timingSafeEqual sobre buffers de igual longitud) y devuelve false ante cualquier entrada inválida, sin lanzar. Ver verifyGithubSignature en `src/lib/github-webhook.ts`.

_Origen: retrospectiva de «Fase 1: GitHub mueve las tareas (webhook de PRs y commits)» (20261114-224951-def077dfa8)_

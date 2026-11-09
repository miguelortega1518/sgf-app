# Probar email.ts: mocks de db, fetch y env

En tests de email.ts, mockear '@/lib/db', '@/lib/db/schema' y 'drizzle-orm' con vi.hoisted (patrón de users-route.test.ts). Usar vi.stubGlobal('fetch', ...) y restaurar process.env.RESEND_API_KEY en afterEach. El nombre de marca sale de APP_NAME en labels.ts; EMAIL_FROM por defecto sigue siendo configuración de despliegue y no se cambia.

_Origen: retrospectiva de «Escapar el HTML de título y cuerpo en los correos de notificación (src/lib/email.ts) y cubrirlo con tests» (20261109-225457-80b408fe35)_

# Operaciones de Forja

Guía corta para desplegar, cambiar la base de datos, respaldar y recuperar. Cada comando de aquí se probó
el 27-oct-2026 contra una copia de los datos reales de producción.

## 1. Qué pasa en cada deploy

El comando de build (ver `render.yaml`) hace, en este orden:

1. `npm install --include=dev`
2. `EXPECT_DB_NAME=sgf npm run db:migrate` — aplica las migraciones pendientes **en una sola transacción**. Si una falla,
   no queda nada a medias y el deploy se detiene antes de compilar. Se niega a correr si `DATABASE_URL` no apunta a la base `sgf`.
3. `npm run db:custom` — triggers y funciones (idempotente). Falla si una sentencia falla.
4. `npm run build` y copia de los recursos estáticos.

Render comprueba `/api/health` antes de dar tráfico a la versión nueva. Esa ruta responde **503** si no hay base de datos
o si a la base le falta alguna tabla, columna o valor de enum que el código usa.

> Mientras `healthCheckPath` no esté configurado en el servicio, esta compuerta no actúa. Está en `render.yaml`,
> pero el servicio actual hay que actualizarlo (se hace al desplegar la fase 0).

## 2. Cambiar el esquema de la base (la regla que evita perder datos)

```
editar src/lib/db/schema.ts
npm run db:generate          # crea src/lib/db/migrations/NNNN_nombre.sql
                             # REVISAR el SQL generado antes de seguir
npm run db:check             # bloquea cambios destructivos y diarios incoherentes
npm run db:plan              # (con DATABASE_URL de desarrollo) muestra qué se aplicaría, sin cambiar nada
npm run db:migrate           # aplica en desarrollo
npm test
```

Reglas:

- **Solo cambios aditivos** (tabla nueva, columna nueva con valor por defecto, índice nuevo, valor nuevo de enum). La versión
  anterior de la app sigue corriendo mientras se compila la nueva, así que no puede encontrarse con un esquema que no entiende.
- **Quitar, renombrar o endurecer algo se hace en dos despliegues**: primero se deja de usar en el código y se despliega;
  después, otra migración lo elimina. Si de verdad hace falta en una sola, el archivo debe llevar
  `-- allow-destructive: <motivo y respaldo tomado>` y alguien lo revisa.
- **Nunca ejecutar `drizzle-kit push` contra una base con datos.** El 27-oct-2026 un `push --force` vació la tabla de tareas.
  El script `db:push` ya no existe a propósito.
- Un cambio de datos (por ejemplo `UPDATE`) va en la misma migración, después del cambio de estructura.
- La numeración y las fechas del diario las lleva `drizzle-kit`; no se editan a mano.

El CI ejecuta todo esto en cada push sobre una base vacía de la misma versión que producción, y falla si `schema.ts`
tiene cambios que no están en una migración.

## 3. Respaldos

```
BACKUP_DIR=C:/Users/migue/backups/forja DATABASE_URL=... npm run db:backup
```

Genera `forja-<base>-<fecha>.json.gz` con una instantánea consistente (solo lectura), verifica lo que escribió y borra
respaldos de más de 30 días (`BACKUP_KEEP_DAYS`). No incluye `rate_limits` a propósito.

**Respaldo diario automático (en el equipo de Miguel):** tarea de Windows `Forja-Respaldo-Diario`, todos los días a las 02:00
(o al volver a estar disponible el equipo). Toma la URL de la base desde la API de Render con `RENDER_API_KEY`, así que no
guarda ninguna contraseña. Resultado y errores en `C:\Users\migue\backups\forja\respaldo.log`.
Limitación: solo corre si el equipo está encendido y con sesión iniciada. La red de seguridad principal es la recuperación a un punto en el tiempo de Render (sección 4).

## 4. Recuperar datos

**a) Recuperación a un punto en el tiempo de Render** (la instancia `erp` la tiene activa: la API informa `AVAILABLE`, desde el 15-oct-2026).
Se pide desde el panel de Render, sobre la instancia, y crea una base nueva con el estado de ese instante; no pisa la actual.
La ventana de retención depende del plan del espacio de trabajo: confirmarla en la documentación de Render antes de depender de ella.

**b) Desde un respaldo propio:**

```
# 1. base vacía (en la instancia, usuario con permiso para crear bases) y esquema al día
DATABASE_URL=<base nueva> npm run db:migrate
# 2. ensayo: valida archivo y destino sin escribir
DATABASE_URL=<base nueva> npm run db:restore -- ruta/forja-sgf-XXXX.json.gz --dry-run
# 3. restaurar (todo o nada; verifica conteos al final)
DATABASE_URL=<base nueva> npm run db:restore -- ruta/forja-sgf-XXXX.json.gz
```

Para reemplazar los datos de una base que ya los tiene hay que escribir su nombre: `--wipe --confirm-db=<nombre exacto>`.
El vaciado ocurre dentro de la misma transacción: si el respaldo está dañado, la base queda como estaba.

## 5. Ensayar un deploy con datos reales

Hacerlo antes de cualquier cambio de esquema importante:

```
npm run db:backup                                   # con DATABASE_URL de producción (solo lee)
tsx scripts/scratch-db.ts create sgf_scratch_ensayo # base desechable en la misma instancia (necesita ADMIN_DATABASE_URL)
# restaurar el respaldo en ella, y luego, con DATABASE_URL apuntando a ella:
npm run db:plan && npm run db:migrate && npm run db:verify
tsx scripts/scratch-db.ts drop sgf_scratch_ensayo   # al terminar: la copia tiene hashes de contraseñas
```

`scratch-db.ts` solo acepta nombres que empiezan por `sgf_scratch`: no puede tocar producción ni desarrollo.

## 6. Cuando algo falla

Los errores del servidor llevan una referencia, por ejemplo `(ref. 1c4fca70)`. Esa referencia está en el registro de Render junto
con la causa real. Dos casos tienen mensaje propio:

| Lo que ve la persona | Qué significa | Qué hacer |
|---|---|---|
| «No hay conexión con la base de datos… (ref. …)» (503) | La base no responde, no existe o rechaza la clave | Ver el estado de la instancia en Render; el registro trae el código (`3D000` base inexistente, `28P01` clave, `ECONNREFUSED`) |
| «La base de datos no está al día con esta versión… (ref. …)» (500) | El código espera una columna o tabla que la base no tiene | Ejecutar `db:migrate` contra esa base; `db:verify` dice exactamente qué falta |

## 7. Contraseñas

- Toda cuenta existente debe cambiar su contraseña en el próximo ingreso (migración 0001).
- Las contraseñas puestas por un administrador (crear usuario o restablecer) son temporales: la persona debe cambiarlas.
- `npx tsx scripts/reset-admin.ts [correo]` genera una contraseña temporal aleatoria, la muestra una vez y obliga a cambiarla.
- `npx tsx scripts/rotate-passwords.ts --out <archivo>` anula **todas** las contraseñas actuales con temporales aleatorias. No las imprime: solo las escribe en el archivo indicado, que hay que borrar después de entregarlas por un canal privado. Acepta `--emails=a@x.com,b@x.com` para limitarlo y respeta `EXPECT_DB_NAME`.
- Ninguna contraseña debe escribirse en el código ni en los scripts. Las pruebas leen `SGF_TEST_PASSWORD`.
- El repositorio es público: lo que se haya escrito en él alguna vez se considera conocido, aunque se borre después.

## 8. Pendiente de decisión (presupuesto)

- **Base de datos propia para Forja.** Hoy comparte instancia con el ERP (1 GB de disco, sin autoescalado).
- **Rol de base de datos separado para desarrollo.** Hoy desarrollo y producción usan el mismo usuario y contraseña, así que
  la copia local de `.env.local` abre también producción.

## 9. Despliegue de la fase 0 (ejecutado el 27-oct-2026)

1. **Respaldo fresco** de producción: `npm run db:backup` (solo lee).
2. Fusionar `fase-0-cimientos` en `master` y subirlo (sección de Git de más abajo).
3. En Render, actualizar el servicio: comando de build (el de `render.yaml`) y `healthCheckPath = /api/health`.
4. Desplegar ese commit y leer el registro del build. Debe decir «Línea base marcada como aplicada» y «Migraciones aplicadas en una sola transacción».
5. Verificar: `/api/health` responde 200 con `"schema":"ok"`; un login incorrecto da 401; `npm run db:verify` contra producción da «Esquema correcto».
6. **De inmediato**, anular la contraseña pública: `EXPECT_DB_NAME=sgf npx tsx scripts/rotate-passwords.ts --out C:/Users/migue/backups/credenciales-temporales.txt`, entregar cada una en privado y borrar el archivo. Sin este paso, cualquiera que conozca la contraseña publicada podría entrar primero y fijar la suya.
7. Si algo sale mal: *Rollback* al deploy anterior en Render (el cambio de esquema es compatible hacia atrás). Si hubiera daño en los datos, restaurar el respaldo del paso 1 (sección 4b).

**Git en este equipo:** el Git que trae Hermes usa un selector de credenciales que abre una ventana y se queda esperando. Para subir cambios:
`GCM_INTERACTIVE=never GIT_TERMINAL_PROMPT=0 "C:/Program Files/Git/cmd/git.exe" push`

**Cómo salió (27-oct-2026, commit `e544677`):** el build adoptó la línea base y aplicó la migración 0001 en 728 ms; el deploy pasó la compuerta de
`/api/health`; los conteos y el contenido de todas las tablas quedaron iguales al respaldo previo, salvo `persons.updated_at` (el trigger de
actualización se disparó con el `UPDATE` de la migración; las contraseñas no cambiaron). Después se rotaron las 5 contraseñas y se comprobó que la
pública ya no funciona.

**Para el próximo ensayo:** instalar los triggers (`db:custom`) en la copia *antes* de migrar, como en producción; si no, el ensayo no muestra el cambio de `updated_at`.

**Sesiones abiertas:** el login emite un JWT de hasta 7 días que no se puede revocar desde el servidor. El cambio obligatorio de contraseña bloquea la API mientras esté pendiente,
pero una sesión emitida antes de rotar volvería a servir cuando su dueño cambie la contraseña. Para cerrarlas todas, cambiar `JWT_SECRET` en Render (desconecta a todos). Pendiente
como mejora de código: que cambiar la contraseña invalide las sesiones anteriores.

## 10. Webhook de GitHub

Abrir, fusionar o cerrar un PR (y un push a la rama por defecto con `Closes FOR-<n>`) mueve la tarea sin tocar Forja. Los cambios
quedan en la auditoría con la persona de sistema «GitHub» (`github@forja.system`, inactiva, creada por la migración 0002).

1. Generar el secreto: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` y ponerlo en Render como
   `GITHUB_WEBHOOK_SECRET`. Si la variable falta o está vacía, el webhook responde 401 a todo.
2. En el repositorio de GitHub: *Settings → Webhooks → Add webhook*.
   - **Payload URL:** `https://<forja>/api/integrations/github/webhook`
   - **Content type:** `application/json`
   - **Secret:** el mismo valor de `GITHUB_WEBHOOK_SECRET`
   - **Eventos:** *Let me select individual events* → `Pull requests`, `Pushes`, `Pull request reviews`, `Check suites` y
     `Check runs`.
3. GitHub manda un `ping` al guardar: debe responder 200 `{"ignored":true}`. Si responde 401, el secreto no coincide.

La tarea se reconoce por la clave `FOR-<n>` en la rama, el título o la descripción del PR (en ese orden). Cada entrega se
procesa una sola vez (tabla `github_deliveries`); si falla con 500, GitHub permite reenviarla desde *Recent Deliveries*.

**Panel «Pull request» del detalle de la tarea** (migración 0003, tabla `github_pull_requests`). Muestra el estado del PR,
sus revisores, los checks de CI y el tiempo hasta la primera revisión. Todo sale de los payloads del webhook: Forja no tiene
token de GitHub ni llama a su API.

- Sólo abrir, reabrir, marcar como listo y cerrar o fusionar un PR enlazan y mueven la tarea. El resto de acciones del PR
  (nuevos commits, edición, cambio a borrador, revisores pedidos), las revisiones y los checks sólo actualizan el panel y no
  quedan en la Actividad de la tarea; su rastro está en `github_deliveries.outcome`.
- En un proyecto cerrado el panel se sigue actualizando, pero la tarea no se enlaza ni cambia de estado.
- Las revisiones y los checks de PRs que no están en el panel de ninguna tarea se descartan sin guardar la entrega.
- **Compatibilidad:** un webhook ya creado sólo con `Pull requests` y `Pushes` sigue funcionando igual que antes, y el panel
  muestra el estado del PR y los revisores pedidos, pero no sus veredictos, ni los checks, ni el tiempo hasta la primera
  revisión. Para tenerlos, editar el webhook (*Settings → Webhooks → Edit*) y marcar también `Pull request reviews`,
  `Check suites` y `Check runs`.
- Los checks se reinician con cada commit nuevo del PR. GitHub no garantiza el orden de las entregas: un check que llegue
  antes que el aviso del commit nuevo no se ve hasta su siguiente evento.

## 11. Importar tareas desde CSV

En el detalle de un proyecto **activo**, el botón **Importar CSV** (junto a «Nueva tarea») abre el importador. Lo pueden usar
las personas con permiso de escritura en el proyecto (no los observadores). El flujo es: elegir el archivo → **Vista previa**
→ **Importar**. La vista previa muestra las primeras 50 filas ya resueltas, la lista de errores («Línea X · columna:
mensaje») y los avisos. **Importar** sólo se activa si no hay errores. La ruta es `POST /api/spaces/<id>/import-csv`
(`dryRun: true` para la vista previa).

**Formato del archivo**

- Codificación **UTF-8** (con o sin BOM). Desde Excel: *Guardar como → CSV UTF-8*. Si el archivo trae caracteres que no son
  UTF-8 (un CSV «normal» de Excel en Windows), la vista previa avisa: las tildes y eñes llegarían rotas.
- Separador `,` o `;`: se detecta en la cabecera (en empate gana `,`). Fin de línea CRLF o LF.
- Comillas según RFC 4180: un campo entre comillas puede llevar el separador y saltos de línea; `""` es una comilla.
- La primera fila no vacía es la cabecera. Las filas en blanco se ignoran. Las líneas que dan los errores son las físicas
  del archivo (la cabecera es la 1).
- El diálogo ofrece una plantilla, `plantilla-tareas.csv`, con la cabecera y dos filas de ejemplo.

**Columnas.** Los nombres no distinguen mayúsculas ni tildes; los espacios y guiones valen como `_` («Fecha límite» =
`fecha_limite`). Sólo `titulo` es obligatoria.

| Columna | Alias | Valores |
|---|---|---|
| `titulo` | `title`, `summary`, `name`, `nombre` | 1–500 caracteres, obligatorio |
| `descripcion` | `description`, `desc`, `body` | hasta 5000 caracteres; vacía = sin descripción |
| `responsable` | `assignee`, `owner`, `asignado`, `responsible`, `assigned_to` | correo de la persona; vacío = responsable por defecto |
| `revisor` | `reviewer` | correo; vacío = líder del proyecto |
| `fecha_limite` | `fecha`, `vencimiento`, `due`, `due_date`, `duedate`, `deadline` | `AAAA-MM-DD` o `DD/MM/AAAA` (día y mes de 1 o 2 dígitos); vacía = sin fecha |
| `prioridad` | `priority` | `critica`, `alta`, `normal`, `baja` o `critical`, `high`, `medium`, `low`; vacía = `normal` |
| `tipo` | `type`, `kind`, `issue_type` | `feature`, `bug`, `mejora`, `deuda`, `chore`; también `story`/`task`/`historia`/`tarea` (= feature), `improvement`/`enhancement` (= mejora), `debt`/`tech_debt` (= deuda); vacío = `feature` |
| `estimacion` | `estimate`, `estimation`, `points`, `story_points`, `puntos` | entero de 0 a 100; vacía = sin estimar |
| `etiquetas` | `labels`, `tags` | separadas por `;`, `\|` o `,`; hasta 8, de hasta 30 caracteres cada una |
| `hito` | `milestone` | nombre exacto de un hito del proyecto (distingue mayúsculas) |

- Una columna desconocida se ignora con un aviso. `estado`/`status` también se ignora: todas las tareas empiezan en «Por
  hacer».
- El responsable y el revisor deben ser personas **activas con permiso de escritura en el proyecto** (miembros no
  observadores, el dueño o un admin). El correo no distingue mayúsculas.
- Si el CSV no trae la columna `responsable`, hay que elegir un **responsable por defecto** en el diálogo.

**Límites**

- 1 MB de CSV (medido en UTF-8) y 1000 filas de datos por archivo. Un archivo mayor se rechaza entero, sin analizarlo fila a
  fila.
- 3 importaciones por persona cada 15 minutos (la ventana del rate limit, unas 12 por hora). La vista previa no cuenta. Al
  superarlo, la respuesta es 429 con el tiempo de espera.

**Todo o nada.** Si hay un solo error, no se importa ninguna tarea y la respuesta es 400 con la lista completa. Si no hay
errores, todas las tareas se crean en una sola transacción, en «Por hacer», con el importador como creador. La auditoría
registra un `task_created` por tarea (con su título) y un `tasks_imported` («N tareas importadas desde CSV») en el proyecto.

**Sin avisos.** La importación no envía notificaciones ni correos de asignación a los responsables ni a los revisores.

## 12. Resumen diario por correo

Cada día laborable, a las 7:30 RD, cada persona activa con «Resumen diario» activado en Mi perfil (`persons.email_digest`)
recibe un correo con lo que le toca: **Vence hoy**, **Vencidas**, **Esperando tu revisión**, **Bloqueadas** y
**Novedades** (los avisos de la campana que no salieron por correo inmediato desde su último resumen, como mucho 20; o los
de los últimos 7 días si nunca recibió uno). Si las cinco secciones están vacías, no se envía nada.

Lo dispara un workflow de GitHub Actions que llama a `POST /api/cron/daily-digest`. No se usa un cron job de Render porque
cuesta (DECISIONES §8). Los fines de semana y los feriados de la tabla `holidays` el endpoint responde
`{"skipped":"no_laborable"}` sin enviar nada.

**1. Configurar `CRON_SECRET`** (el mismo valor en los dos sitios):

1. Generarlo: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
2. Render: *Environment* del servicio → añadir `CRON_SECRET`. Si falta o está vacío, el endpoint responde 401 a todo.
3. GitHub: *Settings → Secrets and variables → Actions → New repository secret* → `CRON_SECRET`.

`RESEND_API_KEY` también debe estar configurado en Render. Sin ella, el endpoint calcula el resumen, no envía ni marca
nada y responde `"emailDisabled": true`.

**2. Añadir el workflow** (a mano, tras fusionar: la fábrica no puede escribir en `.github/workflows/`). Crear
`.github/workflows/daily-digest.yml`:

```yaml
name: Resumen diario

on:
  schedule:
    # 11:30 UTC = 7:30 RD (UTC-4 todo el año, sin horario de verano)
    - cron: '30 11 * * *'
  workflow_dispatch:

jobs:
  digest:
    runs-on: ubuntu-latest
    steps:
      - name: Llamar al endpoint del resumen diario
        env:
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
        run: |
          curl -fsS -X POST \
            --max-time 120 --retry 3 --retry-delay 30 --retry-all-errors \
            -H "Authorization: Bearer $CRON_SECRET" \
            https://sgf-app.onrender.com/api/cron/daily-digest
```

El workflow corre todos los días; el endpoint decide si es laborable.

**Render free duerme el servicio.** La primera llamada puede tardar casi un minuto en despertarlo o fallar por timeout:
por eso el curl lleva un `--max-time` amplio y reintentos. Reintentar es seguro: cada persona tiene como mucho una fila por
día en `digest_runs` (clave primaria `person_id, day`), y quien ya recibió el resumen de hoy no lo vuelve a recibir.
Además, GitHub puede retrasar los `schedule` varios minutos en horas de carga.

**3. Lanzarlo a mano.** *Actions → Resumen diario → Run workflow* (`workflow_dispatch`). O desde una terminal:

```bash
curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://sgf-app.onrender.com/api/cron/daily-digest
```

(Si el servicio está dormido, añadir `--max-time 120 --retry 3` como en el workflow.)

**4. Probar sin enviar.** Con `?dryRun=1` se calcula todo, pero no se envía ningún correo ni se escribe en `digest_runs`:

```bash
curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" "https://sgf-app.onrender.com/api/cron/daily-digest?dryRun=1"
# {"sent":0,"skipped":3,"day":"2026-11-17","dryRun":true,"wouldSend":2}
```

**Respuestas**

| Respuesta | Significado |
|---|---|
| `{"sent":2,"skipped":3,"failed":0,"day":"…"}` | `sent`: correos enviados. `skipped`: personas con el resumen vacío o que ya lo recibieron hoy. `failed`: envíos que Resend rechazó |
| `{"skipped":"no_laborable","day":"…"}` | Fin de semana o feriado: no se envía nada |
| `401 {"error":"No autorizado"}` | Falta `CRON_SECRET` en Render o no coincide con el del workflow |
| `400` | `dryRun` distinto de `0` o `1` |

Si un envío falla, se borra la fila de esa persona en `digest_runs` y basta con volver a lanzar el workflow ese mismo día
para reintentarlo. El endpoint no marca `notifications.email_sent`: las novedades de cada resumen son las creadas después
del anterior (`digest_runs.created_at`).

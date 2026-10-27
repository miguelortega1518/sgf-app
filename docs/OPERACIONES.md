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

## 9. Día del despliegue de la fase 0 (pendiente de autorización)

1. **Respaldo fresco** de producción: `npm run db:backup` (solo lee).
2. Fusionar `fase-0-cimientos` en `master` y subirlo (sección de Git de más abajo).
3. En Render, actualizar el servicio: comando de build (el de `render.yaml`) y `healthCheckPath = /api/health`.
4. Desplegar ese commit y leer el registro del build. Debe decir «Línea base marcada como aplicada» y «Migraciones aplicadas en una sola transacción».
5. Verificar: `/api/health` responde 200 con `"schema":"ok"`; un login incorrecto da 401; `npm run db:verify` contra producción da «Esquema correcto».
6. **De inmediato**, anular la contraseña pública: `EXPECT_DB_NAME=sgf npx tsx scripts/rotate-passwords.ts --out C:/Users/migue/backups/credenciales-temporales.txt`, entregar cada una en privado y borrar el archivo. Sin este paso, cualquiera que conozca la contraseña publicada podría entrar primero y fijar la suya.
7. Si algo sale mal: *Rollback* al deploy anterior en Render (el cambio de esquema es compatible hacia atrás). Si hubiera daño en los datos, restaurar el respaldo del paso 1 (sección 4b).

**Git en este equipo:** el Git que trae Hermes usa un selector de credenciales que abre una ventana y se queda esperando. Para subir cambios:
`GCM_INTERACTIVE=never GIT_TERMINAL_PROMPT=0 "C:/Program Files/Git/cmd/git.exe" push`

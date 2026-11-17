# Aprobar e integrar desde Forja

Las tareas con etiqueta `ai-factory` que estén en revisión pasan por GitHub antes de
marcarse como hechas. El botón existente ahora dice **Aprobar e integrar**. También
se aplica la validación a las peticiones individuales hechas desde el tablero/API.
Las aprobaciones masivas omiten estas tareas y explican que deben abrirse individualmente.

## Activación

Configurar en el servidor de Forja (Render), nunca en variables `NEXT_PUBLIC_*`:

```text
FORJA_GITHUB_TOKEN=<token de servicio>
FORJA_GITHUB_APPROVAL_REPOS={"miguelortega1518/sgf-app":{"base":"master","checks":["verify"]}}
```

El token debe tener acceso únicamente a los repositorios autorizados: Contents write,
Pull requests read, Checks read y Commit statuses read. No debe poder saltarse las
protecciones de rama. No se reutilizan ni se exponen las credenciales de Claude.

La configuración es un mapa por repositorio: `base` es la rama de integración y
`checks` contiene los nombres exactos de los checks obligatorios. El job de CI de
sgf-app se llama `verify` e incluye lint, tipos, pruebas, migraciones y compilación.
Si la fábrica trabaja en otro repositorio, añadir su rama y sus checks reales.
Configurar también esos checks como obligatorios en GitHub, exigir que la rama esté
actualizada y excluir al token de cualquier bypass: GitHub aplica estas reglas de
forma atómica al integrar, incluso si la base o un check cambian justo después de la
última consulta de Forja. El repositorio debe permitir squash merge.

Después de configurar, desplegar esta versión. `render.yaml` es solo documentación;
el servicio actual se gestiona manualmente. Sin configuración, la aprobación falla
con un mensaje explícito y la tarea sigue en revisión.

## Comportamiento

1. Valida acceso al proyecto, rol de administrador/revisor, estado en revisión y evidencia.
   También exige el rol de aprobador para tareas antiguas sin `requiresApproval`.
2. Lee el PR en vivo. Exige URL de GitHub, repositorio autorizado, rama `factory/` del
   mismo repositorio, destino configurado, PR abierto, no borrador y fusionable.
3. Consulta checks y estados del SHA actual, con paginación. Todos deben ser exitosos;
   los checks omitidos/neutrales tampoco se aceptan. Exige los checks configurados;
   ausencia de pruebas nunca equivale a aprobación.
4. Verifica que la rama incluye la base y vuelve a consultar el PR para detectar
   cambios de SHA/base. Pide squash merge con el SHA exacto verificado.
5. Solo tras la confirmación de GitHub guarda `completada`, la fecha y la auditoría
   con usuario, URL y SHA. El commit identifica al aprobador de Forja por su ID.

La aprobación humana queda en Forja y en el mensaje del commit. No se crea una review
`APPROVE` en nombre del usuario en GitHub; si las reglas exigen reviews de GitHub,
deben existir antes de integrar. No se saltan reglas ni se aprueban otros PRs.
Esta ruta integra el PR directamente; no llama a `factory approve` ni modifica los
archivos históricos de una ejecución de AI Factory. El despliegue de la aplicación
destino depende de la configuración existente de ese repositorio.

## Fallos y concurrencia

La fila de la tarea permanece bloqueada durante la operación para serializar dos
clics simultáneos. Las peticiones a GitHub comparten un límite de 20 segundos.
No se modifica el estado cuando fallan permisos, pruebas, configuración o GitHub.

GitHub y PostgreSQL no comparten una transacción: si GitHub fusiona pero la respuesta
se pierde o falla la escritura local, el usuario puede volver a aprobar. Se consulta
el PR ya fusionado y se concilia la tarea sin otro merge. Los checks no se repiten
para un PR que GitHub ya confirma como fusionado; la auditoría indica `alreadyMerged`.
La confirmación del merge no equivale a confirmar que el despliegue terminó.

Las tareas normales y las finalizaciones directas de la fábrica mediante enlace a
commit conservan su comportamiento. No se aprueba ninguna tarea existente durante
la instalación de esta funcionalidad.

## Validación

`npm run lint`, `npm run typecheck`, `npm test`, `npm run build` y el CI del PR.
Las pruebas simulan GitHub; no fusionan tareas reales. Cubren SHA/base cambiantes,
permisos, pruebas ausentes/fallidas/pendientes/omitidas, paginación, errores de red,
reintentos, repositorios no autorizados y PRs no aptos para integrar.

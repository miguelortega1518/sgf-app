# Plan de producto: Forja

Estado: propuesta para aprobación. Base: `docs/investigacion-competencia.md`.
Las estimaciones suponen una persona desarrolladora asistida por IA, con dedicación parcial. Son orientativas y se revisan al cerrar cada fase.

## 1. Posicionamiento

**Forja es el tablero de un equipo de desarrollo que se mueve solo y le dice con datos cuándo va a llegar.**

- **Para quién:** equipos de 3 a 15 desarrolladores, empezando por el equipo propio en República Dominicana. Español primero.
- **Por qué ganar:** Linear es rápido pero tiene reportes limitados y sube de precio; Jira es potente pero pesado; GitHub Projects no mide; ClickUp abruma. Nadie ofrece a la vez *cero configuración + integración con GitHub desde el primer día + métricas de entrega reales + precio plano + español*.
- **Qué no es:** un CRM de ventas ni un ERP. Si se quiere gestión de clientes, es un módulo aparte y se decide en la sección 9.

## 2. Principios de producto

1. **Se actualiza solo.** Si una persona tiene que mover una tarjeta que el código ya demuestra, falló el producto.
2. **Cero configuración.** Funciona útil el primer día con valores por defecto sensatos. Nada de administrador dedicado.
3. **Números honestos.** Mediana y percentil 85, no promedios. Mostrar la incertidumbre de los pronósticos.
4. **Silencioso por defecto.** Pocas notificaciones, agrupadas y configurables. Es la queja principal de ClickUp.
5. **Rápido.** Respuesta inmediata en la interfaz (actualización optimista, atajos de teclado, paleta de comandos).
6. **La IA propone, una persona decide.** Todo lo que la IA escriba queda auditado y se confirma.
7. **Menos captura de datos antes que más IA.** La causa mejor documentada de abandono en herramientas de este tipo es el trabajo de entrada sin retorno. Crear una tarea debe requerir un solo campo; el resto se deduce o se completa después.
8. **Sin ataduras.** Importar y exportar fácil. Height cerró en 2025 y sus clientes tuvieron que migrar: ese riesgo es una razón de compra.

## 3. Fase 0: cimientos (1 semana) — antes de cualquier función nueva

Salen de los incidentes reales de este proyecto, no de la teoría.

| Entrega | Por qué |
|---|---|
| Migraciones versionadas (`drizzle-kit generate` + `migrate`) y prohibir `push --force` en producción | `push --force` vació la tabla de tareas el 27-oct-2026 |
| Respaldo automático diario de la base y prueba de restauración | La base gratuita anterior caducó y se perdió |
| Base propia para Forja (no compartida con el ERP) y plan de pago | Hoy comparte instancia y disco de 1 GB con el ERP |
| Visibilidad de errores: registrar la causa real en `unhandled_api_error` y mostrar un identificador de error al usuario | El «Error interno» del login ocultó una caída de la base |
| Verificación del esquema tras cada deploy (health que compruebe columnas clave) | El deploy salió «bien» sin las columnas nuevas |
| Reparar pruebas (`vitest`), bajar los 33 errores de ESLint a 0 y CI en GitHub Actions | Calidad mínima antes de crecer |
| Sincronizar `render.yaml` con la realidad; rotar contraseñas iniciales y forzar el cambio al primer ingreso | Seguridad |
| Límite de intentos de login con mensaje que diga cuánto esperar | Hoy el usuario no sabe cuándo reintentar |

**Criterio de aceptación:** un deploy de prueba con un cambio de esquema sobre datos reales sin pérdida, respaldo restaurado en un entorno limpio, y CI en verde.

### Estado de la fase 0 (27-oct-2026, desplegada en producción: commit `e544677`)

| Entrega | Estado | Evidencia |
|---|---|---|
| Migraciones versionadas; `db:push` eliminado | Hecho | Línea base 0000 + migración 0001; guarda contra cambios destructivos; ver `docs/OPERACIONES.md` |
| Deploy de prueba con cambio de esquema sobre datos reales | Hecho | Copia de producción (57 filas): adopción de la línea base + migración 0001 en ~1 s; datos idénticos al original; repetir no hace nada |
| Una migración rota no deja nada a medias | Hecho | Probado: la primera sentencia válida se revirtió junto con la que falló |
| Respaldo y restauración verificables | Hecho | Respaldo de producción restaurado en una base limpia con conteos iguales; un respaldo dañado con `--wipe` falla sin tocar los datos |
| Respaldo automático diario | Hecho, con límite | Tarea de Windows a las 02:00; solo corre con el equipo encendido. La recuperación a un punto en el tiempo de Render es la red principal |
| Errores visibles | Hecho | Referencia en el mensaje y en el registro; distingue base caída (503) de esquema desfasado (500); reproducido el incidente del 27-oct |
| Verificación del esquema tras cada deploy | Hecho y activo | `/api/health` responde 503 si no hay base o falta una columna; Render lo usa como compuerta (`healthCheckPath`) |
| Pruebas y lint | Hecho | 106 pruebas, 0 errores de lint y de TypeScript |
| CI en GitHub Actions | Hecho, en verde | `.github/workflows/ci.yml`: migra una base vacía y falla si `schema.ts` tiene cambios sin migración |
| `render.yaml` sincronizado | Hecho | Refleja el servicio real; sin la base gratuita que caducó |
| Contraseñas iniciales rotadas | **Hecho en producción** | Las 5 cuentas se pasaron a contraseñas temporales aleatorias con cambio obligatorio; la pública ya no funciona (comprobado en la base y en el login real) |
| Base propia para Forja | **Pendiente de presupuesto** | Ver abajo |
| Límite de intentos de login con tiempo de espera | Hecho | Solo cuentan los fallos; mensaje con minutos y cabecera `Retry-After` |

**Hallazgo de seguridad (27-oct-2026):** el repositorio es público y `scripts/reset-admin.ts` (commit `638b666`) tenía escrita la contraseña por defecto
del administrador. Se comprobó, sin tocar el login, que **las 5 cuentas de producción siguen usando esa contraseña**. Quitarla del código no basta,
porque el historial de Git es público: la única corrección real es que cada persona cambie la suya, y eso es lo que fuerza la migración 0001 al desplegar.
Ya está corregido en producción (ver arriba). También se detectó que desarrollo y producción comparten usuario y contraseña de base de datos.

## 4. Fase 1: GitHub como fuente de verdad (2–3 semanas)

Es la función más valorada de GitHub Projects y la que más trabajo ahorra.

- **Conexión:** GitHub App con permisos mínimos (lectura de PR/issues, webhooks). Alternativa para GitLab después.
- **Reglas automáticas por defecto:** rama o PR con `FOR-123` enlaza la tarea; PR abierto → *En code review*; PR fusionado → *Hecho*; PR cerrado sin fusionar → vuelve a *En progreso*; commit con `Closes FOR-123` cierra.
- **Qué se muestra:** estado del PR, revisores, checks de CI y tiempo hasta primera revisión, dentro de la tarea.
- **Importadores:** CSV, Jira, Linear y GitHub Issues, para bajar el costo de probar Forja.
- **Notificaciones:** resumen diario por defecto y avisos inmediatos solo si te asignan algo, te piden revisión o algo se bloquea.

**Criterio:** en un repositorio real, abrir y fusionar un PR mueve la tarea sin tocar Forja; importar 200 tareas desde un CSV en menos de un minuto.
**Riesgo:** límites de la API y eventos duplicados → procesar webhooks con idempotencia y reintentos.

## 5. Fase 2: planificación y pronóstico (2–3 semanas)

Aquí se explota la debilidad de Linear y GitHub Projects.

- **Sprints/ciclos reales:** backlog, planificación con capacidad por persona, arrastre de tareas no terminadas, cierre con retrospectiva automática. Se quita la dependencia de días hábiles y feriados de RD (opcional por equipo).
- **Reportes de entrega:** burndown, flujo acumulado, velocidad con tendencia, distribución del tiempo de ciclo, antigüedad de tareas en curso, límites de trabajo en curso (WIP).
- **Pronóstico sin IA:** simulación a partir del historial de tiempo de ciclo («probabilidad de llegar al release 2.4: 70 %; fecha al 85 %: 12 nov»). Se muestra el rango, no una fecha falsa.
- **Vista para no técnicos:** enlace de solo lectura con estado, riesgos y fechas, sin jerga de desarrollo.
- **Ética de las métricas:** los reportes por persona son opcionales y se usan para equilibrar carga, no para ranking. Decisión explícita del equipo.

**Criterio:** con 4 semanas de datos reales, el pronóstico acierta dentro de su rango en al menos 8 de 10 sprints (medido hacia atrás).
**Riesgo:** con pocos datos el pronóstico engaña → no mostrarlo hasta tener un mínimo de tareas cerradas.

## 6. Fase 3: abierto a asistentes y automatización (2 semanas)

Es la «IA» más barata: cada desarrollador usa su propio asistente y Forja no paga inferencia.

- **Servidor MCP** (lectura por defecto; escritura solo con confirmación y alcance limitado): consultar el tablero, crear tareas, comentar y mover estados desde Claude, Cursor o Copilot.
- **API pública y tokens personales** con permisos por alcance; **webhooks de salida**.
- **Paleta de comandos (Ctrl+K) y atajos de teclado** en todas las acciones; presupuesto de rendimiento (interacciones bajo 100 ms).
- **Movimiento y creación masivos** desde el teclado.
- **Vista «Mi día»** y sprints flexibles para el trabajo no planificado, y color por tipo y estado para leer el tablero de un vistazo.
- **(Opcional, después)** asignar una tarea a un agente de código que abre rama y PR con el estado sincronizado, como cola de trabajo y no como relleno.

**Criterio:** crear y mover una tarea desde un asistente externo con registro en la bitácora; ningún token con más permisos de los pedidos.
**Riesgo:** inyección de instrucciones desde texto de tareas o PR → tratarlo como contenido no confiable y no combinar herramientas de lectura con envíos al exterior.

## 7. Fase 4: IA integrada con control (3 semanas)

Solo funciones de valor comprobado para un equipo pequeño. Modelo pequeño por defecto, con tope de gasto.

1. **Crear tareas desde una frase** (tipo, puntos y etiquetas sugeridos; se confirma antes de guardar).
2. **Resumen semanal y de standup** a partir de PR, estados y comentarios.
3. **Detección de duplicados** con embeddings y un umbral conservador.
4. **Triage sugerido** (etiquetas y prioridad) con la razón a la vista y aceptar o rechazar. No se activa de forma automática hasta medir una tasa de aceptación cercana al 90 % en el propio registro.
5. **Estimación por similitud sin IA generativa:** mediana de puntos de tareas parecidas, mostrando cuáles son. Solo se ofrece cuando hay historial suficiente.

Controles obligatorios: conjunto de 50–100 casos reales para evaluar antes de cambiar de modelo o de instrucciones; registro de cada acción (entrada, salida, modelo, usuario); eliminar secretos y datos personales antes de enviar texto; topes diarios de gasto por función; apagado por función; medir la tasa de aceptación y retirar lo que se rechace.
**Costo esperado:** del orden de $2 a $30 al mes para 5 personas según el modelo; multiplicar por 3 como margen.
**No se hará:** estimaciones o pronósticos generados por un modelo de lenguaje (alto riesgo de falsa precisión), ni agentes autónomos que modifiquen datos sin confirmación.
**Privacidad:** IA opcional por equipo, con interruptor global y la app completa funcionando sin ella; enviar solo los campos mínimos (sin adjuntos ni datos personales); indicar en pantalla qué se envía y a quién. Como alternativa de máxima privacidad para clasificar o resumir, evaluar un modelo local (por ejemplo vía Ollama), contrastando antes su calidad en español.

## 8. Fase 5: producto comercial (solo si se decide vender)

Workspaces múltiples con aislamiento de datos, inicio de sesión con Google/GitHub y SSO, facturación, roles, exportación completa, interfaz en español e inglés, página de precios y un onboarding de 5 minutos. Hasta entonces Forja puede seguir siendo una herramienta interna.

**Hipótesis de precio (a validar con usuarios):** gratis hasta 5 personas; $6 por persona al mes con todo incluido, IA con tope visible y sin cobro por uso. Referencias: GitHub Team $4, Plane $6, Shortcut $8,50, Linear $10/$16, Jira ~$9,70 y con cobros por uso.

## 9. Decisión sobre «CRM»

Si además se necesita relación con clientes (cuentas, contactos, oportunidades), conviene un **módulo separado** al terminar la fase 2, no mezclado con el tablero. Lecciones de la investigación para ese módulo: precio plano, reportes buenos de base, captura automática de correo y calendario, importadores desde HubSpot y Salesforce, y plantillas con criterio en lugar de tableros en blanco. No se recomienda construirlo antes de que el tablero de desarrollo tenga uso real.

## 9 bis. Contraste con la investigación paralela (`docs/research/`)

Otra herramienta investigó el mismo tema en paralelo (6 informes, sin confirmar quién los escribió; no son míos y están sin versionar). Coincide con este plan en: integración PR→estado como prioridad uno, métricas de entrega incluidas en todos los planes, velocidad y teclado como contrato, cero configuración, precio plano, IA como sugerencia reversible, y no usar agentes autónomos al inicio. Ajustes que se tomaron de ella: el principio 7, el triage con razón visible, la estimación por similitud sin IA generativa, la opción de modelo local, la vista «Mi día» y los agentes como cola de trabajo.

Dos puntos de desacuerdo, resueltos así:
- **Estimaciones:** mi informe las daba por bajo valor por falta de datos; el otro las propone con estadística simple. Se acepta la versión sin IA y condicionada a tener historial.
- **Cifras de abandono (63 %, 47 %...):** circulan sin fuente primaria; no se usan como argumento.

## 10. Métricas de éxito

| Métrica | Meta | Cómo se mide |
|---|---|---|
| Tareas movidas a mano que la integración debió mover | < 10 % | Bitácora (cambios manuales de estado con PR enlazado) |
| Tiempo para empezar a usar Forja desde cero | < 15 min | Prueba con un equipo nuevo |
| Interacciones del tablero | < 100 ms | Mediciones en el navegador |
| Notificaciones por persona y día | ≤ 5 | Conteo en base |
| Aceptación de sugerencias de IA | > 60 % | Registro de acciones de IA |
| Pronóstico dentro de rango | ≥ 80 % | Retroprueba por sprint |
| Incidentes con pérdida de datos | 0 | Respaldos y revisión posterior |

## 11. Riesgos principales

| Riesgo | Mitigación |
|---|---|
| Pérdida de datos en cambios de esquema | Fase 0: migraciones versionadas, ensayo previo y respaldo |
| Capacidad limitada (una persona) | Fases cortas con entrega usable; recortar el alcance antes que la calidad |
| Linear y otros copian las funciones | Competir en lo que no hacen: métricas, GitHub sin configurar, precio plano y español |
| Costos de IA que se disparan | Modelo pequeño por defecto, topes y apagado por función |
| Privacidad al enviar texto a un proveedor de IA | Redacción previa, contrato sin entrenamiento con datos y opción de desactivar |
| Proveedor único de alojamiento | Exportación completa y despliegue reproducible |

## 12. Qué NO se hará

Gestión de portafolio y cumplimiento empresarial, marketplace de integraciones, agentes de código propios, wiki completa, gestión para otros departamentos, y IA para estimar o pronosticar sin historial.

## 13. Decisiones tomadas (27-oct-2026)

| # | Pregunta | Respuesta | Efecto en el plan |
|---|---|---|---|
| 1 | ¿Solo para el equipo u otros? | Para el equipo, y **en algún momento se ofrecerá a otros** | La fase 5 (multi-equipo) entra, pero después de las fases 0 a 3. Desde ya se diseña sin suposiciones de «un solo equipo» en lo nuevo |
| 2 | ¿GitHub o GitLab? | **GitHub** | La fase 1 se hace solo con GitHub App; GitLab queda fuera |
| 3 | ¿Enviar texto de tareas a un proveedor de IA? | **Sí** | La fase 4 puede usar una API externa. Se mantienen la redacción previa, el interruptor por equipo y el registro |
| 4 | ¿Módulo de clientes? | **Sí** | Se planifica como módulo propio (sección 14) |
| 5 | Presupuesto de base de datos e IA | **Sin discutir con el equipo** | Se avanza solo con lo que no cuesta. Ver «Pendiente de presupuesto» abajo |

### Pendiente de presupuesto

Precios de Render consultados el 27-oct-2026 en la página oficial (https://render.com/pricing). Los precios cambian: confirmar antes de decidir.

| Opción | Costo extra al mes | Qué da | Cuándo conviene |
|---|---|---|---|
| A. Seguir compartiendo la instancia `erp` (hoy) | $0 | La instancia ya se paga para el ERP (plan basic-256mb, 1 GB de disco, recuperación a un punto en el tiempo) | Uso interno del equipo, mientras haya pocos datos |
| B. Instancia propia basic-256mb | $6 | Aislamiento total del ERP, sus propios respaldos y conexiones | Antes de abrir Forja a otros equipos |
| C. Instancia propia basic-1gb | $19 | Lo anterior con 4 veces más memoria | Cuando haya varios equipos o datos que crezcan |

Disco adicional: $0.30 por GB al mes. La instancia compartida tiene el autoescalado de disco apagado y 1 GB: conviene vigilar el uso.
**IA:** para 5 personas se estimó de $2 a $30 al mes según el modelo (cálculo propio, sin verificar con facturas reales); se lleva al equipo como una cifra con tope.
**Recomendación:** A por ahora; pasar a B antes de ofrecerlo a otros. Además, crear un usuario de base de datos distinto para desarrollo (sin costo).

## 14. Módulo de clientes (planificación)

Se construye **después de la fase 2**, como un módulo separado que comparte usuarios, notificaciones, auditoría y búsqueda con el tablero. Alcance inicial:
- Cuentas, contactos y oportunidades con un tablero de etapas.
- Captura de correo y calendario sin teclear datos (lo más valorado en Attio, Folk y Copper).
- Reportes útiles desde el primer día (la queja más repetida en Pipedrive, Zoho y Freshsales).
- Importación desde HubSpot, Salesforce y CSV.
- Vínculo con el trabajo de desarrollo: una oportunidad o cuenta puede tener solicitudes de cliente que se convierten en tareas del tablero, que es lo que ningún CRM de ventas hace bien.
Primero hay que acordar con el equipo qué necesita realmente del módulo: qué datos de clientes manejan hoy y dónde (hoja de cálculo, correo, otro sistema).

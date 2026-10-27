# Competencia directa de Forja: Linear, Jira, GitHub Projects, ClickUp, Shortcut

Investigado el 2026-10-27. **HECHO** = dato de página oficial o doc. **OPINIÓN** = lo que dicen usuarios (se indica dónde). Lo que no se encontró se marca "no encontrado". Los precios son de lista en USD y pueden variar según región o impuestos.

---

## Linear

### Funciones destacadas
**HECHO**
- Núcleo en todos los planes: issues, proyectos, cycles, initiatives, triaje, API/webhooks, importación y exportación (https://linear.app/pricing).
- Integración con GitHub (https://linear.app/integrations/github):
  - Los PR y commits se enlazan con el issue por ID en la rama o el título del PR. También se pueden usar "magic words" (`fixes ID`).
  - Las automatizaciones por equipo mueven el estado del issue según el estado del PR.
  - Hay ajustes personales para autoasignarse el issue y pasarlo a *In Progress*.
  - Los enlaces son bidireccionales.
  - Revisión de PR dentro de Linear con "Diffs" y "guided reviews".
  - Sincroniza GitHub Issues de repos open source.
- Agentes de IA:
  - Plataforma de agentes, Linear Agent y MCP.
  - "Coding sessions" con Claude Code o Codex, que delegan issues entrantes a un agente.
  - "Code Intelligence", que responde preguntas sobre el código.
  - "Triage Intelligence" y "Loops", tareas recurrentes del agente por horario o evento.
  - Fuentes: https://linear.app/integrations/github y https://linear.app/changelog/timeline.
- Changelog reciente (https://linear.app/changelog/timeline):
  - 2026-10-22: triggers de Slack y GitHub para Loops.
  - 2026-10-08: "Stacked pull requests" y control de gasto de créditos de IA.
  - 2026-04-30: Releases, con seguimiento de despliegue por issue.
  - 2026-05-28: Diffs.
- Triaje (Free/Basic en adelante) más reglas, responsabilidad e SLAs de issues; ver tabla de planes en https://linear.app/pricing. Linear Asks para intake por Slack, correo y formularios web (Business).
- Insights (Business/Enterprise): analítica en tiempo real y gráficos burn-up/cumulative flow (https://linear.app/docs/insights). Esa página no menciona cycle time ni throughput explícitos. Un tercero (reely.io) sí describe métricas de ciclo y percentiles (https://reely.io/p/linear/linear-insights); no lo verifiqué en doc oficial.
- Velocidad y atajos de teclado: lo afirman reseñas de terceros, no el vendor (ver Quejas/opinión).

### Precio (https://linear.app/pricing, anual)
| Plan | Precio | Notas |
|---|---|---|
| Free | $0 | Miembros ilimitados, 2 equipos, 250 issues, archivos 10MB |
| Basic | $10/usuario/mes | 5 equipos, issues ilimitados, Loops |
| Business | $16/usuario/mes | Equipos ilimitados, Insights, Triage/Code Intelligence, Asks |
| Enterprise | Personalizado | SAML/SCIM, audit log |

Coding sessions y Loops requieren créditos de IA, un coste adicional (https://linear.app/pricing).

### Quejas recurrentes
**OPINIÓN** (usuarios):
- **UI minimalista que cuesta leer.** Un equipo que pasó de ClickUp a Linear: "todo es monocromo, es difícil ver dónde termina un elemento y empieza otro" (r/Linear, https://www.reddit.com/r/Linear/comments/1rqox20/anyone_else_having_trouble_with_the_ui/). Otro usuario del mismo hilo (misma fuente) dice que es cuestión de familiaridad. El equipo de Linear respondió con un refresh de UI (https://linear.app/changelog/2026-03-12-ui-refresh).
- **Sin lenguaje natural para crear tareas** y "tarda mucho hacer clic" (r/Linear, https://www.reddit.com/r/Linear/comments/1n4u6uq/linear_pro_cons/).
- **Rigidez de cycles / fechas.** "Linear cree que toda la planificación ocurre a nivel de cycle", no hay vista "hoy", ni agrupar por fecha (mismo hilo).
- **Permisos y reporting limitados** para usos fuera de ingeniería: no se puede invitar a nivel de proyecto; "no puedes correr un service desk"; no se puede usar air-gapped (mismo hilo).
- **Comparaciones con Jira:** reseñas de terceros afirman que crear un issue lleva 4.3 s en Linear frente a 18.7 s en Jira (https://dev.to/pickuma/linear-vs-jira-why-developer-teams-are-switching-in-2026-4c71). Es una medición propia de un blog; no la trato como hecho.

### Oportunidades para un competidor
- Linear no tiene un tablero Kanban con métricas de ciclo accesibles en el plan barato: Insights solo está en Business ($16).
- Planificación flexible (fechas, vista "hoy") para equipos que no trabajan por cycles.
- Entrada rápida en lenguaje natural.
- Legibilidad visual (color por tipo/estado).
- Costes de IA opacos (créditos): ofrecer IA incluida o con tope claro.

---

## Jira (Atlassian)

### Funciones destacadas
**HECHO**
- Backlog, lista, tablero, timeline, calendario y resumen, incluso en el plan Free; formularios, objetivos y reportes con IA (https://www.atlassian.com/software/jira/jira/pricing).
- Automatización con pasos mensuales por plan: 150 por suscripción en Free, 400 por usuario en Standard, 750 en Premium y 1.000 en Enterprise (misma página).
- Rovo Search/Chat/Agents incluidos en los planes de pago (misma página).
- Agents dashboard: adopción de agentes y comparación de cycle time entre trabajo con agente y sin él (https://support.atlassian.com/jira-software-cloud/docs/use-the-agents-dashboard/).
- Rovo Dev deja de ser un producto independiente y sus capacidades pasan a suscripciones elegibles de Jira (https://www.atlassian.com/software/rovo-dev).
- Reportes de cycle time y lead time: existen apps de terceros en Marketplace (https://marketplace.atlassian.com/apps/868937337/time-in-status-cycle-time-lead-time-reports-with-rovo-ai). Si vienen nativos en Jira Cloud: no encontrado en esta ronda.
- Métricas DORA: Atlassian publica guía (https://www.atlassian.com/devops/frameworks/dora-metrics); no verifiqué qué plan las incluye.
- Integración GitHub/GitLab para automatizar estados con PR: no encontrado en esta ronda en fuente primaria.

### Precio
- Free hasta 10 usuarios; Standard $8.48/usuario/mes y Premium $15.56 en la página oficial al extraer (https://www.atlassian.com/software/jira/jira/pricing). Esa extracción parece de tarifas anuales; Enterprise requiere contactar.
- Lista nueva "efectiva el 13 de octubre de 2026" (https://www.atlassian.com/licensing/future-pricing/cloud/list/pricing-tables). Según un blog de un competidor, Breeze (sesgado), el precio mensual pasó de $9.05 a $9.70 en Standard y de $18.30 a $19.60 en Premium (https://www.breeze.pm/articles/atlassian-pricing-changes-2026). Ese blog afirma además que desde el 3 de diciembre se factura aparte el uso por encima de las asignaciones de automatización y Rovo. Contrasta con la página oficial antes de citarlo.
- Con 5 desarrolladores: ~$48-$49/mes en Standard mensual según tarifas del blog (5 × $9.70). Mi cálculo.

### Quejas recurrentes
**OPINIÓN** (usuarios):
- **Lentitud.** "¿Es Jira el software más lento jamás hecho?" (r/jira, https://www.reddit.com/r/jira/comments/t5r3v9/is_jira_the_slowest_software_ever_made/); "Jira Cloud is Bleeping Slow" (https://www.reddit.com/r/jira/comments/uw9fhr/jira_cloud_is_bleeping_slow/). Ambos hilos son más antiguos que 18 meses; úsalos como contexto, no como evidencia reciente. En r/programming alguien gestiona proyectos en hojas de cálculo porque "Jira es demasiado lento y la búsqueda es pésima" (https://www.reddit.com/r/programming/comments/vgvt3m/i_fucking_hate_jira/, también antiguo).
- **Complejidad de configuración.** "El problema real de Jira es que es demasiado personalizable, lo que facilita crear flujos dolorosos" (r/ExperiencedDevs, https://www.reddit.com/r/ExperiencedDevs/comments/izu5u3/tout_le_monde_d%C3%A9teste_jira_mais_personne_narr%C3%AAte/fr/).
- **UI cambiante y publicidad interna.** Un admin con 7 años de experiencia se sintió "abrumado" con la UI nueva de Cloud; otro usuario dice que les llueven anuncios incluso en Premium y que Atlassian "mueve la UI de Cloud con frecuencia" (r/jira, https://www.reddit.com/r/jira/comments/1vi1ndr/just_tested_cloud_the_first_time_my_review/).
- **Aumento de precio y complejidad en reseñas de JSM** (curva de aprendizaje, setup complejo, pricing creep; https://clearfeed.ai/blogs/jira-service-management-review-analysis-ratings). Es Jira Service Management, no Jira Software.

### Oportunidades para un competidor
- Velocidad percibida y arranque sin configuración: "listo para equipo de 5 en 5 minutos".
- Estados de PR conectados por defecto, sin editar workflows.
- Precio plano sin sorpresas de uso: la facturación por uso de automatización/IA es un punto de dolor potencial.
- Sin anuncios internos ni reorganización constante de la UI.

---

## GitHub Projects

### Funciones destacadas
**HECHO**
- Tabla, kanban y roadmap sobre issues y PR, con sincronización bidireccional, campos personalizados, plantillas, gráficos y automatizaciones (https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/about-projects).
- Campo de iteración nativo (cycles/sprints), y gráficos de Insights que suman un campo por iteración (blog de terceros, https://scrumpy.it/blog/github-projects-for-scrum).
- Según ese blog: sub-issues con jerarquía de ocho niveles desde marzo de 2026, e issue fields (Priority, Effort, fechas) disponibles desde julio de 2026. Fuente secundaria; no lo contrasté con el changelog de GitHub.
- El PR vive junto al issue: la automatización de estados con PR es nativa porque el código está en GitHub (misma doc oficial).

### Precio
- GitHub Free $0; Team $4/usuario/mes (https://github.com/pricing?locale=en-US). La página no detalla qué incluye Projects por plan; no encontrado.
- 5 devs en Team: $20/mes (mi cálculo).

### Quejas recurrentes
**HECHO/análisis de un tercero** (https://scrumpy.it/blog/github-projects-for-scrum; el autor vende un producto competidor):
- No hay burndown, ni velocity entre iteraciones, y el burn-up no tiene línea de alcance. El hilo de comunidad pidiendo burndown/velocity está abierto desde noviembre de 2022 sin respuesta de GitHub desde mayo de 2023 (según ese blog).
- Es difícil incluir personas fuera de la organización de GitHub (el artículo lo menciona; no leí el detalle).

**OPINIÓN** (usuarios): en r/github y r/agile, "funciona suficientemente para seguimiento, pero no es un tablero ágil completo" (https://www.reddit.com/r/github/comments/1b8lsam/how_has_your_experience_been_with_using_github/). Es un hilo de 2024, anterior a la ventana de 18 meses.

### Oportunidades para un competidor
- Medición: velocity, burndown, cycle time y throughput listos, que Projects no ofrece.
- Intake de no-desarrolladores (producto, soporte, clientes) sin cuentas de GitHub.
- Ser capa de planificación encima de GitHub, importando issues y PR.

---

## ClickUp

### Funciones destacadas
**HECHO**
- Free incluye tableros Kanban, Sprint Management, vista calendario, docs y formularios (https://clickup.com/pricing).
- Business añade "Sprint Points & Reporting", dashboards, vistas timeline, webhooks y 5K automatizaciones/mes (misma página).
- ClickUp Brain (IA): desde $9/usuario/mes (https://clickup.com/brain).
- Integración con GitHub: no encontrado en fuente verificada. La URL que probé del help center devolvió un artículo distinto (API).

### Precio (https://clickup.com/pricing)
| Plan | Anual | Mensual |
|---|---|---|
| Free | $0 | $0 |
| Unlimited | $7 | $10 |
| Business | $12 | $19 |
| Enterprise | Personalizado | |

- Límites del plan Free: 5 Spaces y 60MB de almacenamiento (misma página).
- Brain se paga aparte: desde $9/usuario/mes (https://clickup.com/brain).
- 5 devs en Business anual: $60/mes; con Brain, +$45/mes (mi cálculo).

### Quejas recurrentes
**OPINIÓN** (usuarios, r/clickup):
- **Lentitud con el uso:** "ahora que el workspace está lleno de tareas, se arrastra: cambiar vistas, cargar listas grandes" (https://www.reddit.com/r/clickup/comments/1v2dbt7/i_love_what_clickup_can_do_but_the_slowness_the/). Otros hilos: https://www.reddit.com/r/clickup/comments/15oqjfi/the_slowest_most_unreliable_app_ive_ever_used_by/ (2023, anterior a la ventana) y https://www.reddit.com/r/clickup/comments/sp4fa2/is_it_just_me_or_is_clickup_too_slow/ (2022).
- **Sobrecarga de funciones:** "la mitad de mi equipo usa quizá el 20% y se abruma con el resto"; onboarding "se ha vuelto un proyecto" (primer hilo de arriba). Otro: "lo más ilógico con mil funciones" (https://www.reddit.com/r/clickup/comments/1xea6r4/awful/); el hilo muestra respuestas divididas, y una de ellas lo defiende como "segundo cerebro" con IA.
- **Facturación sorpresa:** un salto de coste cuando se reclasificaron miembros/invitados, más IA como extra (primer hilo).
- **IA no deseada:** "empujan funciones de IA que nadie quiere en lugar de arreglar bugs" (primer hilo). Un community manager de ClickUp respondió que el admin puede apagar la IA con el ClickApp.

### Oportunidades para un competidor
- Lo contrario de ClickUp: pocas piezas, rendimiento constante con workspaces grandes.
- Precio por asiento sin reclasificaciones ni extras de IA.
- Workspace pre-configurado para ingeniería (no construir jerarquías Space/Folder/List).

---

## Shortcut

### Funciones destacadas
**HECHO** (https://www.shortcut.com/pricing/)
- Free: Kanban, Roadmap, Reports, Iterations (sprints), Docs, integraciones con GitHub, Slack y Figma.
- Team: reportes, límites WIP, múltiples workflows (hasta 5), automatizaciones.
- Business: objetivos/OKR, campos personalizados, reportes avanzados, múltiples workspaces.
- Calificación 4.4/5 en G2 con 177 reseñas (misma página; también https://www.g2.com/products/shortcut/reviews).
- Detalle de la integración GitHub (estado por PR/rama): no encontrado en esta ronda.

### Precio (https://www.shortcut.com/pricing/)
| Plan | Precio | Notas |
|---|---|---|
| Free | $0 | Hasta 10 usuarios, 1 equipo |
| Team | $8.50/usuario/mes | |
| Business | $12 | |
| Enterprise | Personalizado | |

- 5 devs en Team: $42.50/mes (mi cálculo).

### Quejas recurrentes
**OPINIÓN** (G2, https://www.g2.com/products/shortcut/reviews?qs=pros-and-cons; resumen de IA de G2 con conteo de menciones):
- Faltan funciones técnicas como timelines y milestones frente a Jira (6 menciones).
- Funciones menos competitivas frente a Jira y Asana (4 menciones).
- Complejidad de funciones que distrae a equipos pequeños (3 menciones) y curva de aprendizaje para personal no técnico (3 menciones).
- Reseña individual: reporting y personalización limitados frente a Jira (https://www.g2.com/products/shortcut/reviews/shortcut-review-11846033).
- Positivo: facilidad de uso (19 menciones) y integraciones GitHub/Slack (10 menciones), misma fuente.
- Estado reciente del producto y su roadmap de IA: no encontrado.

### Oportunidades para un competidor
- Shortcut es el más parecido a Forja en espíritu (simple, para equipos de software), pero sin reporting profundo; hueco: cycle time y velocidad claros.
- Agentes de IA: en esta ronda no encontré oferta de Shortcut (no encontrado).

---

## Lecciones para Forja (priorizadas)

1. **Cerrar el ciclo PR→estado sin configuración (P0).** Detectar ID de tarea en rama/título/PR y mover estados solos (abierto→En progreso, PR abierto→En revisión, merge→Hecho). Linear lo hace por ID y magic words (https://linear.app/integrations/github) y es el estándar. Como Forja ya guarda rama y PR, hay que activarlo desde el primer día.
2. **Cycle time y throughput de serie, también en el plan barato (P0).** Linear los pone en Business ($16) y GitHub Projects no tiene burndown ni velocity (https://scrumpy.it/blog/github-projects-for-scrum). Que Forja los incluya para todos es diferenciador real para 5 devs.
3. **Velocidad y teclado como contrato (P0).** Latencia baja, atajos para crear, mover y asignar, paleta de comandos. Es el motivo por el que los usuarios dicen que cambian de Jira a Linear (opinión de terceros en https://dev.to/pickuma/linear-vs-jira-why-developer-teams-are-switching-in-2026-4c71). Medir y publicar presupuestos de rendimiento.
4. **Cero configuración inicial (P1).** Tipos de tarea, puntos y sprints con valores razonables; evitar el modelo Jira de workflows editables y la jerarquía de ClickUp. Es la queja más repetida de ambos (r/ExperiencedDevs; r/clickup).
5. **Triaje ligero (P1).** Bandeja de entrada con aceptar, rechazar o posponer, y creación rápida; Linear lo tiene en todos los planes (https://linear.app/pricing).
6. **Entrada en lenguaje natural y captura rápida (P1).** Hueco señalado por usuarios de Linear (https://www.reddit.com/r/Linear/comments/1n4u6uq/linear_pro_cons/); habilita crear tareas desde chat o dictado.
7. **Sprints flexibles (P2).** Sprints/cycles sí, pero con fechas y vista "mi día", donde Linear es rígido según sus usuarios (mismo hilo). Importa para un equipo pequeño con trabajo no planificado.
8. **Precio plano y predecible (P1).** Sin cobro por uso, sin reclasificación de usuarios, sin IA con créditos opacos: es un dolor de ClickUp y un riesgo en Jira (https://www.reddit.com/r/clickup/comments/1v2dbt7/i_love_what_clickup_can_do_but_the_slowness_the/; https://www.breeze.pm/articles/atlassian-pricing-changes-2026, fuente sesgada). Para el equipo dominicano, evaluar precio en moneda local o facturación simple.
9. **Agentes de IA como cola de trabajo, no como relleno (P2).** Linear delega issues a Claude Code/Codex y limita con créditos (https://linear.app/changelog/timeline). Forja puede ofrecer una versión mínima: asignar una tarea a un agente que abre una rama y un PR, con el estado sincronizado. Hacerla opcional (ClickUp recibió quejas por imponer IA).
10. **Legibilidad visual (P2).** Color por tipo y estado en el tablero, algo que los usuarios echan en falta en Linear (https://www.reddit.com/r/Linear/comments/1rqox20/anyone_else_having_trouble_with_the_ui/).

### Vacíos de esta investigación
- No encontré fuente primaria sobre cómo integra Jira, ClickUp o Shortcut los PR de GitHub/GitLab.
- No verifiqué soporte GitLab en ninguno de los cinco.
- Las quejas de Jira sobre lentitud son de hilos antiguos; faltan más recientes de r/ExperiencedDevs y Hacker News (el hilo https://news.ycombinator.com/item?id=45138709 apareció, pero no lo leí).
- Las reseñas en Capterra no se consultaron.

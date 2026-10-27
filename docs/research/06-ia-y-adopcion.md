# 06 · IA en CRM/gestión de trabajo y por qué fracasa la adopción (investigación para Forja)

Fecha de investigación: 2026-10-27. Convenciones: **HECHO** = documentación oficial, informe primario o prensa verificable. **OPINIÓN DE USUARIOS** = foros, reseñas, blogs. Toda cifra lleva fuente y año. "No encontrado" = no pude verificarlo.

Limitaciones: Reddit bloqueó la extracción de texto completo (403); de esos hilos solo uso títulos/fragmentos que devolvió el buscador, marcados como opinión. Varios agregadores de estadísticas citan cifras sin enlazar al estudio original; los marco como "no verificado en origen".

---

## (a) Qué ofrece realmente la IA de cada plataforma

### Salesforce Agentforce
**HECHO**
- Precio: Flex Credits a $500 por 100.000 créditos, 20 créditos (≈$0,10) por acción; $2 por conversación resuelta del "Help Agent"; licencias por usuario de $5 a $550/mes. Según el análisis de un proveedor competidor (Macha, oct. 2026), tarifario de Salesforce del 31-ago-2026: https://www.getmacha.com/blog/agentforce-pricing-explained y página oficial https://help.salesforce.com/s/articleView?id=004811240&language=en_US&type=1
- Una conversación solo se factura como "resuelta" si tiene ≥2 turnos, sin feedback negativo explícito y sin escalar a humano (misma fuente Macha, 2026). Ejemplo de la misma fuente: 3 acciones por conversación ≈ $300/mes con 1.000 conversaciones y $6.000 con 20.000, antes de licencias.
- Reconocimiento público de fiabilidad: Sanjna Parulekar (SVP marketing de producto de Salesforce) dijo "We all had more confidence in LLMs a year ago" (dic. 2025). Salesforce pasó a "hybrid reasoning"/disparadores deterministas; el caso Vivint: el agente omitía enviar encuestas pese a instrucciones explícitas (reportado por The Information). https://aihola.com/article/salesforce-llm-trust-declined (resumen secundario; el original de The Information no lo leí).
- Salesforce State of Sales, 7.ª ed. (2026): "94% de líderes de ventas con agentes dicen que son críticos" (encuesta del propio vendor, sesgo de origen). https://www.salesforce.com/en/wp-content/uploads/sites/4/documents/reports/sales/salesforce-state-of-sales-report-2026.pdf

**Valoración:** valor demostrable en atención al cliente de alto volumen (tarea acotada, medible por resolución). Para equipos pequeños: coste por acción impredecible y complejidad enterprise. Gran parte del discurso "agente autónomo" es marketing; la propia empresa retrocede hacia reglas deterministas.

### HubSpot Breeze
**HECHO**
- Breeze se mide en "HubSpot Credits"; créditos incluidos 500/3.000/5.000 según nivel, por cuenta y no por usuario, por lo que la capacidad por persona cae al crecer el equipo. https://professionalstoolkit.com/articles/hubspot-ai-playbook (blog, 2026)
- Starter incluye resúmenes de negocio y Agent Builder básico; agentes de prospección, datos, notetaker, etc. se reservan a Professional+ (misma fuente).
- Breeze Customer Agent pasó a cobro por resultado (≈$0,50 por conversación resuelta) desde abril 2026: https://www.aigtmstack.com/tools/hubspot-breeze-ai-agents y https://kayako.com/tools/hubspot-service-hub-review/ (blogs comparativos; verificar en hubspot.com antes de decidir).

**OPINIÓN DE USUARIOS**
- Hilo r/hubspot: un usuario afirma haber costado a su empresa "$11.000" por falta de salvaguardas en créditos de enriquecimiento Breeze Intelligence, aun con enriquecimiento automático desactivado: https://www.reddit.com/r/hubspot/comments/1l8jrck/be_careful_when_using_breeze_intelligence_credits/ (2025; no pude abrir el hilo completo, cifra es afirmación del usuario).
- Otro hilo: "lo probamos pero no cumplió expectativas": https://www.reddit.com/r/hubspot/comments/1ile3zr/does_anyone_have_any_thoughts_on_hubspot_breeze/
- Usuarios dicen que campos de datos que antes eran gratuitos ahora requieren comprar créditos: https://www.reddit.com/r/hubspot/comments/1lcshgx/ama_ask_us_anything_about_breeze_intelligence/

**Valoración:** resúmenes y redacción útiles y baratos; lo marketinero son los "agentes" gated por plan y el modelo de créditos que dificulta presupuestar.

### Zoho Zia
**HECHO:** Zia analiza datos que el vendedor registra y tareas para predecir resultados, sentiment, anomalías y asistente conversacional. https://www.g2.com/products/zoho-zia/reviews?qs=pros-and-cons · https://www.techradar.com/reviews/zoho-crm-review
**OPINIÓN:** reseñas en Capterra son mixtas: "funciona bien hasta ahora", pero también que el software exige ser "bastante técnico" (https://www.capterra.com/p/155928/Zoho-CRM/reviews/?page=85). No encontré cifras independientes de precisión de Zia ni quejas sistemáticas de costes por créditos.
**Valoración:** predicciones y anomalías dependen de que se registren datos (problema de adopción); valor real no demostrado con evidencia independiente: "no encontrado".

### Linear (Triage Intelligence, Agent)
**HECHO**
- Triage Intelligence (planes Business/Enterprise): analiza issues entrantes con modelos agénticos y sugiere equipo, proyecto, asignado y etiquetas; detecta duplicados y relacionados; muestra el razonamiento; se puede configurar auto-aplicar. https://linear.app/docs/triage-intelligence · https://linear.app/now/how-we-built-triage-intelligence
- Principios declarados: confianza, transparencia (ver el porqué), sugerencia aceptar/rechazar.
- Privacidad: Linear dice no entrenar con tus datos; los comparte con subprocesadores de IA solo para prestar la función. https://linear.app/docs/triage-intelligence
- Linear Agent / Intake: convierte conversaciones de Slack y soporte en issues. https://linear.app/ai · https://linear.app/intake
**OPINIÓN:** reseñas agregadas puntúan Linear 4,6/5 (3.853 reseñas, oct. 2026) pero son sobre el producto, no sobre la IA (https://aiproductivity.ai/tools/linear/). Métricas independientes de precisión del triage: no encontrado.
**Valoración:** de los casos mejor diseñados: IA como sugerencia con explicación, sobre tarea tediosa (clasificar/deduplicar), reversible.

### Jira / Atlassian Rovo
**HECHO**
- Créditos incluidos por usuario/mes: Jira Standard 25, Premium 70, Enterprise 150 (colecciones Teamwork/Service: 250/700/1.500). https://www.atlassian.com/licensing/rovo
- Un mensaje de chat básico consume ~10 créditos; exceso a $0,01 por crédito con facturación desde el 3-dic-2026 (según https://www.breeze.pm/articles/rovo-pricing — competidor, verificar en Atlassian). Es decir, 25 créditos ≈ 2-3 mensajes por usuario/mes en Standard (cálculo mío sobre esa cifra).
**OPINIÓN:** hilos r/jira: "Rovo is just terrible"/límite de 50 elementos (https://www.reddit.com/r/jira/comments/1ucl0pq/rovo_50_item_limit/), "Rovo is a pain… prefiero GH Copilot o Claude" (https://www.reddit.com/r/jira/comments/1vz0gwk/rovo_is_a_pain/), temor a que sea "otra fuente de ingresos" por uso vago (https://www.reddit.com/r/jira/comments/1lw8ia9/rovo_usage/).
**Valoración:** búsqueda unificada y resúmenes tienen sentido; los créditos escasos y el cobro por exceso son la queja dominante.

### GitHub Copilot en Issues/Projects
**HECHO:** desde 26-mar-2026 las sesiones de agentes (Copilot, Claude, Codex) aparecen bajo el asignado en Issues y en Projects, con estado en vivo. https://github.blog/changelog/2026-03-26-agent-activity-in-github-issues-and-projects/ El agente se asigna a issues desde el backlog (https://github.com/features/copilot/agents); disponible en planes Copilot de pago (https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/troubleshoot-cloud-agent).
**Valoración:** valor claro solo si el trabajo es código en repos GitHub; para tareas de negocio general no aplica. Evidencia independiente de eficacia: no encontrada en esta ronda.

### Señales transversales (HECHO)
- Gartner (jun. 2025): más del 40 % de los proyectos de IA agéntica se cancelarán a fines de 2027 por costes, valor poco claro o controles de riesgo insuficientes. https://www.gartner.com/en/newsroom/press-releases/2025-06-25-gartner-predicts-over-40-percent-of-agentic-ai-projects-will-be-canceled-by-end-of-2027 (es una predicción, no una medición).
- MIT NANDA "GenAI Divide" (jul. 2025, informe preliminar): 95 % de las organizaciones estudiadas sin retorno medible de iniciativas GenAI. https://letsdatascience.com/news/mit-report-documents-genai-pilot-roi-gap-e0924d7d (metodología criticada; usar como indicio).
- Patrón de precios de 2026: todos migran a créditos/consumo (Salesforce, HubSpot, Atlassian) → coste variable. Es la queja más repetida.

---

## (b) Por qué fracasa la adopción de CRM / herramientas de tareas

### HECHOS con fuente y año
- Los vendedores dedican ~30 % de la semana a vender (28 % en 2022). Salesforce State of Sales, 6.ª ed. (2024): https://assets.ctfassets.net/f43wltp2j5se/2gHMpCURXzpMW7PJ3SlWZJ/3cad8d7e8496abbd3c0f99d5c7f16ef4/salesforce-state-of-sales-report-6-ed.pdf
- 7.ª ed. (2026): gráfico "40 % vendiendo / 60 % sin vender", con "entrada manual de datos" como categoría propia. https://www.salesforce.com/en/wp-content/uploads/sites/4/documents/reports/sales/salesforce-state-of-sales-report-2026.pdf (cifra por categoría no legible en la extracción; vendor con interés en IA).
- Forrester (encuesta 2023, informe CRM Market Insights 2023): adopción alta pero satisfacción baja con la solución actual; mayoría seguirá con el mismo proveedor. https://www.forrester.com/blogs/forrester-data-shows-high-crm-adoption-but-low-satisfaction/ (informes 2024 y 2025 existen tras paywall: https://www.forrester.com/report/customer-relationship-management-market-insights-2025/RES189952)
- Gartner (año no confirmado en la fuente secundaria): 70 % de vendedores abrumados por la cantidad de tecnologías. https://www.coevera.com/blog/why-sales-teams-dont-use-crm/ — original no verificado.

### Cifras circulantes SIN verificación en origen (usar con cautela)
- "63 % de las iniciativas CRM fracasan" atribuido a Merkle Group; "solo 40 % de empresas reporta 90 % de adopción"; "5,5 h/semana de entrada manual". https://play2sell.com/blog/2026/05/25/why-salespeople-dont-use-crm-11-reasons-and-how-to-fix-low-adoption — blog de 2026; no encontré el estudio Merkle ni su año. No usarlas como hecho en Forja.
- "47 % de los datos de ventas es inexacto (Validity, 2022)", "26 % de reps con adopción alta (Salesforce, 2024)": https://getgangly.com/blog/crm-adoption-statistics — blog que cita sin enlace al original.
- "~38 % de fallos atribuidos a baja adopción (Vantage Point)", ">60 % de causas son factores humanos": https://sonix.vn/en/insights/why-sales-team-avoids-crm-and-how-to-fix-it/ — año y estudio original no encontrados.
- El agregador crmside.com admite que "los datos de adopción CRM son la parte más débil" de las estadísticas del sector (https://crmside.com/crm-statistics/). Conclusión honesta: no existe una cifra única fiable de "tasa de fracaso de CRM"; la tasa citada de 20-70 % es de procedencia dudosa.

### Mecanismos (consenso de fuentes, mayormente opinión/práctica de consultoras)
1. **Carga de entrada de datos sin retorno para quien la hace:** el CRM sirve al gerente (auditoría, forecast), no al vendedor. https://assimasolutions.com/resources/blog/why-crm-adoption-fails-sales-reps/ (consultora de formación, 2026)
2. **Monitoreo punitivo:** se usa para vigilar y no para entrenar → registros mínimos "para que el jefe se calle". https://play2sell.com/blog/2026/05/25/why-salespeople-dont-use-crm-11-reasons-and-how-to-fix-low-adoption
3. **Fatiga de configuración:** campos obligatorios, etapas, personalizaciones; el tiempo de admin crece antes de que se vea valor. (Inferencia; evidencia cuantitativa específica: no encontrada.)
4. **Datos malos → IA mala:** el propio informe Salesforce 2026 titula una sección "AI Agents are Only as Strong as Their Data". La IA sobre un CRM mal alimentado amplifica el problema.
5. **Sobrecarga de herramientas** (ver Gartner arriba).

**Implicación para Forja:** el mayor predictor de abandono es el coste de captura. Todo lo que reduzca el número de campos/clics vale más que cualquier función de IA.

---

## (c) Privacidad y coste al enviar datos de tareas a un proveedor de IA

### HECHOS
- **OpenAI API:** desde el 1-mar-2023 los datos de API no se usan para entrenar salvo opt-in. Por defecto se guardan logs de abuso hasta 30 días; "Zero Data Retention" y "Modified Abuse Monitoring" requieren aprobación previa de OpenAI. ZDR no cubre algunos endpoints (p. ej. Batch). https://developers.openai.com/api/docs/guides/your-data · https://help.openai.com/en/articles/9197833-batch-api-faq
- **Anthropic API:** ZDR disponible por solicitud a ventas, por organización; contenido no se retiene por defecto salvo "Covered Models", que requieren 30 días de retención. https://platform.claude.com/docs/en/manage-claude/api-and-data-retention. The Register (2-sep-2026): 30 días es la norma comercial y ZDR hay que solicitarlo y verificarlo. https://www.theregister.com/ai-and-ml/2026/09/02/anthropic-promises-zero-data-retention-but-customers-must-check-it-worked/5293789
- **Linear:** no entrena con tus datos; comparte con subprocesadores. https://linear.app/docs/triage-intelligence
- **Ollama:** local, "no vemos tus prompts"; sus modelos cloud sí procesan transitoriamente. https://ollama.com/privacy
- **Conclusión práctica (mía):** ZDR formal es un contrato empresarial; una app pequeña normalmente obtiene "sin entrenamiento + retención de hasta 30 días". ZDR real exige negociar o usar un proveedor/cloud que lo ofrezca.

### Opciones, ordenadas por privacidad
1. **Modelo local/abierto (Ollama, Qwen, Phi, etc.):** datos no salen. Guías de 2026 lo consideran suficiente para resumen/clasificación/RAG en PYMEs (https://pooyagolchian.com/blog/local-ai-ollama-benchmarks-cost-2026/, blog; calidad frente a modelos frontera: sin benchmark independiente verificado → no encontrado). Coste: hardware y mantenimiento; coste marginal por llamada ≈ 0.
2. **API con ZDR / sin entrenamiento:** mejor calidad; requiere acuerdo; coste por token variable.
3. **Resumen/minimización antes de enviar:** enviar solo título y campos no sensibles, pseudonimizar nombres/importes, no enviar adjuntos ni notas libres. Es patrón de diseño propio, sin estudio citado; valor de diseño, no de evidencia.
4. **Coste:** evitar el modelo "crédito por acción" del vendor: con API propia el coste es por token y se puede acotar con caché, límite por usuario/mes y modelos pequeños para clasificar. Cifras de precio por token no se incluyen (cambian demasiado; consultar la página del proveedor).

---

## (d) Patrones de IA que los usuarios sí valoran

| Patrón | Evidencia | Fuente |
|---|---|---|
| Detección de duplicados | HECHO (académico, muestra pequeña): plug-in Jira con embeddings + coseno + GPT-4o logró 100 % de precisión y −45 % de tiempo en refinamiento de backlog (arXiv, 2025). Linear lo ofrece de serie. | http://www.arxiv.org/pdf/2507.10753 · https://linear.app/now/how-we-built-triage-intelligence |
| Clasificación/triage con explicación | HECHO (diseño de Linear): sugerir equipo/etiquetas/asignado, aceptar-rechazar, mostrar el porqué. Precisión medida independiente: no encontrada. | https://linear.app/docs/triage-intelligence |
| Búsqueda semántica | Rovo y la tesis de Aalto muestran que JQL por palabras clave falla cuando los tickets no comparten términos. Es el caso de uso de Rovo menos criticado en los hilos revisados (opinión mía a partir de lo leído). | https://aaltodoc.aalto.fi/server/api/core/bitstreams/7c37548f-fa80-4d5e-81ac-d3713171d3d6/content |
| Resúmenes (hilos, deals, reuniones) | Funciones base incluso en planes baratos (HubSpot Starter: resúmenes de negocio). Quejas de usuarios se concentran en agentes y créditos, no en resúmenes. | https://professionalstoolkit.com/articles/hubspot-ai-playbook |
| Borradores (correos, descripciones) | Incluido en casi todos; riesgo: datos inventados si falta contexto. Queja en r/projectmanagement: la IA "no tiene suficiente conocimiento" y hay que reexplicar el contexto cada vez. | https://www.reddit.com/r/projectmanagement/comments/1uw2voc/biggest_issue_with_ai_tools_for_pms_in_my_opinion/ (opinión) |
| Estimaciones por similitud | Sin estudios de adopción hallados; técnicamente es vecinos más cercanos sobre tareas pasadas (no requiere LLM). Valor para usuarios: no encontrado. | — |
| Crear tareas desde conversación | Linear Intake/Agent lo ofrece; reduce carga de entrada. Eficacia medida: no encontrada. | https://linear.app/intake |

Patrón común de lo que funciona: **sugerencia reversible con justificación, sobre trabajo tedioso, sin cobro sorpresa.** Lo que genera quejas: agentes autónomos, cobro por crédito opaco, límites bajos, alucinaciones sin trazabilidad.

---

## Recomendaciones para Forja

1. **Prioriza reducir la captura de datos antes que añadir IA.** La causa mejor respaldada de abandono es el trabajo de entrada sin retorno (Salesforce 2024/2026; consultoras). Alta rápida: crear tarea con un campo y deducir el resto.
2. **SÍ: detección de duplicados al crear tarea/cliente** (embeddings + similitud coseno; sin LLM generativo en la ruta crítica). Evidencia: arXiv 2025; Linear. Mostrar "¿es igual a X?" con enlace; el usuario decide.
3. **SÍ: búsqueda semántica** sobre tareas/notas; barata (embeddings), verificable (devuelve registros reales, no texto inventado).
4. **SÍ: resúmenes bajo demanda** de hilos largos/historial de cliente, siempre con enlaces a los registros fuente para comprobar. Nunca guardarlos como "verdad" sin marca de origen.
5. **SÍ: clasificación/etiquetado como sugerencia** (aceptar/rechazar con motivo visible, como Linear). Auto-aplicar solo si el usuario lo activa y con tasa de aceptación medida (>~90 % en tu propio log antes de activarlo; umbral recomendado, no de una fuente).
6. **SÍ: estimaciones por similitud con estadística simple** (mediana de tareas parecidas) y mostrar las tareas comparadas; reservar LLM solo para explicar.
7. **NO: agentes autónomos que modifican datos o contactan clientes** en v1. Salesforce retrocede a lógica determinista (2025) y Gartner (2025) prevé cancelaciones masivas. Si hay acciones, que sean borradores que un humano confirma.
8. **NO: facturación opaca por crédito.** Los hilos sobre HubSpot y Rovo (2025-26) muestran desconfianza. Define un tope visible por usuario/mes, contador de uso en UI y modelo pequeño por defecto; sin sorpresas.
9. **Privacidad por diseño:** IA opcional por organización; enviar solo campos mínimos (sin adjuntos, sin datos personales salvo necesidad); proveedor con "sin entrenamiento" documentado y, si hay datos sensibles, ZDR contratado o modelo local (Ollama) para clasificar/resumir. Informar en la UI qué se envía y a quién (OpenAI/Anthropic: retención de logs de hasta 30 días por defecto).
10. **Medir antes de ampliar:** registrar aceptación/rechazo de cada sugerencia y reportes de "incorrecto"; mantener un interruptor global de IA y que la app funcione completa sin ella. Evita basar decisiones en cifras de blogs sin origen (63 %, 47 %, etc.).

---
*Pendientes para una segunda ronda: verificar en origen las cifras marcadas "no verificado"; leer los hilos de Reddit completos; buscar benchmarks independientes de precisión de triage y de modelos locales para resumen en español.*

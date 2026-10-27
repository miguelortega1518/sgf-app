# Investigación de competencia (octubre 2026)

Cómo se hizo: 4 investigaciones en paralelo (CRMs clásicos, CRMs modernos, herramientas de trabajo para desarrolladores, IA y MCP). Las fuentes son resúmenes de G2 y Capterra, hilos de Reddit, páginas oficiales de precios y blogs.

Hay una investigación paralela, más extensa, en `docs/research/` (6 informes). Ambas se contrastaron en `PLAN-PRODUCTO.md`, sección 9 bis.

**Límites que conviene conocer**
- G2 y Capterra bloquearon la lectura directa: se usaron los resúmenes que muestran los buscadores y los conteos de menciones.
- De muchos hilos de Reddit solo se leyó el título, no los comentarios.
- Varios blogs de comparación son de competidores y tienen sesgo.
- Los precios cambian a menudo y algunas páginas se contradicen (HubSpot Starter $7 vs $20; Jira $9,70 vs $8,48). Verifica antes de tomar una decisión comercial.
- Las URLs las aportaron los agentes de investigación; no se comprobó cada una por separado.

## 1. Idea central

Los CRMs de ventas (Salesforce, HubSpot, Pipedrive, Zoho, Close, Attio...) **no compiten con Forja**: gestionan clientes y oportunidades, no el trabajo de un equipo técnico. La competencia real de Forja es Linear, Jira, GitHub Projects, ClickUp, Shortcut y Plane. De los CRMs se aprovechan las lecciones sobre precio, configuración y reportes.

## 2. CRMs de ventas: qué aprender

| Producto | Lo más valorado | Queja más repetida | Lección para Forja |
|---|---|---|---|
| Salesforce | Personalización total, automatización | Curva de aprendizaje (574 menciones en G2), configuración (539), costo total (485) | Que funcione sin administrador dedicado |
| HubSpot | Plan gratis útil, facilidad de uso | Saltos de precio entre planes, cobro por contactos, contratos rígidos, renovaciones hasta +50 % | Precio plano y cancelación en un clic |
| Pipedrive | Pipeline visual, interfaz limpia | Reportes limitados (40 % de 184 reseñas negativas en Capterra), email débil | Reportes buenos desde el plan base |
| Zoho CRM | Precio, módulos conectados | Interfaz recargada, reportes difíciles, soporte lento | Pulido de UX con precio bajo |
| monday CRM | Facilidad (205 menciones), automatización | Curva al conectar tableros, funciones faltantes | Plantillas ya conectadas, no tableros en blanco |
| Close | Llamadas, email y SMS en un lugar | App móvil incompleta, reportes poco flexibles | Móvil con paridad real |
| Attio | Configuración rápida, objetos propios, API y MCP | Reportes y exportación limitados, integraciones frágiles | Importadores de migración y reportes |
| Folk | Simplicidad, sincronización de correo | Sin automatización ni reportes | Camino claro de crecimiento |
| Copper | Integración con Google Workspace | Caro con extras, sin deshacer | Historial de cambios con deshacer |
| Freshsales | Fácil, soporte | Reportes rígidos, funciones faltantes | Reportes personalizados fiables |

Patrones comunes: (1) lo útil queda en planes caros, (2) los reportes son el punto débil, (3) la IA se cobra aparte con créditos, (4) la fricción de contrato y de soporte, (5) la configuración inicial pesa.

## 3. Herramientas de trabajo para desarrolladores: la competencia real

| Producto | Precio de entrada | Lo más valorado | Queja principal | Hueco para Forja |
|---|---|---|---|---|
| Jira | Gratis hasta 10 usuarios; de pago ~$9,70 (Standard); desde el 3-dic-2026 cobra aparte el uso de automatización y Rovo | Flujos, sprints, reportes, JQL | Complejidad (501 reseñas en G2), lentitud (325), búsqueda | Usable con 5 personas sin admin; precio plano |
| Linear | $10 Basic, $16 Business | Velocidad, Cmd+K, ciclos | Reportes limitados (sin flujo acumulado ni métricas por persona), rigidez, 3 subidas de precio en 15 meses | Reportes de entrega con datos reales y estimación |
| GitHub Projects | Incluido; Team $4 | Vive junto al código, «Closes #N» mueve la tarea | Sin velocidad, burndown ni cycle time | Ser la capa de métricas y sprints sobre GitHub |
| ClickUp | $7 / $12 | Muchas vistas, precio | No intuitivo (1.181 menciones), lento (1.155), notificaciones por defecto | Lo contrario: poco, rápido y silencioso |
| Asana | $10,99 / $24,99 | Interfaz amable | Funciones faltantes, no pensado para devs | No es competidor directo |
| Shortcut | Gratis hasta 10; $8,50 | Épicas y tablero | Integraciones pobres | Su base es una audiencia captable |
| Notion | $10 / $20 | Docs junto a tareas | Sin reportes; hay que mantener la estructura | No cubre métricas ni Git |
| Plane | $6 / $13; código abierto | Self-host, importa desde Jira | Operar el servidor | El self-host quizá no importe a un equipo de 5 |
| Height | **Cerró el 24-sep-2025** | — | — | Ejemplo del riesgo de depender de un proveedor |

**Dónde puede ganar un producto pequeño:** reportes de entrega incluidos, integración con GitHub desde el día uno, precio plano, cero configuración, notificaciones silenciosas por defecto, velocidad, estimación como función central, interfaz en español e importadores.
**Qué no intentar competir:** portafolio y cumplimiento empresarial, marketplace de integraciones, agentes de código, wiki completa, gestión para todos los departamentos.

## 4. IA: qué existe y qué conviene

- Los grandes cobran la IA por separado: Salesforce (Flex Credits, unos $0,10 por acción según un blog), HubSpot (créditos), Jira/Rovo (créditos con exceso a $0,01), Notion (agentes aparte), ClickUp Brain. La queja común es la **impredecibilidad del costo**.
- **MCP** (acceso de asistentes externos a la herramienta) ya lo ofrecen Linear, GitHub, Atlassian, Notion, Asana, Attio, Zoho, HubSpot y Salesforce.
- Costo de ejecución estimado para 5 desarrolladores (4.400 operaciones al mes, supuestos propios): ~$1,5 con un modelo pequeño tipo Haiku, ~$31 con uno mediano. Multiplicar por 3 para ir seguro.

Valor frente a esfuerzo para un equipo de 5 (orden recomendado por los agentes y confirmado por mí):

| # | Función | Valor | Esfuerzo | Riesgo |
|---|---|---|---|---|
| 1 | Sincronización PR → tarea (webhooks, sin IA) | Alto | S | Bajo |
| 2 | Servidor MCP propio | Alto | S–M | Medio (permisos) |
| 3 | Crear tareas en lenguaje natural | Medio-alto | S | Bajo con confirmación |
| 4 | Resumen semanal | Medio-alto | S | Bajo |
| 5 | Duplicados (embeddings) | Medio | M | Medio |
| 6 | Triage automático | Medio | M | Medio |
| 7 | Búsqueda semántica | Medio | M | Medio |
| 8 | Estimaciones sugeridas | Bajo (pocos datos) | M | Alto |
| 9 | Pronóstico con IA | Bajo | L | Alto |

Nota: el pronóstico de entrega **sin IA** (simulación a partir del tiempo de ciclo histórico) sí es viable y barato; ver el plan.

## 5. Fuentes principales
- Salesforce: https://www.salesforce.com/sales/pricing/ · https://www.salesforce.com/agentforce/pricing/
- HubSpot: https://www.hubspot.com/pricing/sales · https://www.reddit.com/r/hubspot/
- Pipedrive: https://www.pipedrive.com/en/pricing · https://www.capterra.com/p/132666/Pipedrive/
- Zoho: https://www.zoho.com/crm/zohocrm-pricing.html · https://www.zoho.com/mcp/pricing.html
- monday, Close, Attio, Folk, Copper, Freshsales: páginas de precios oficiales y resúmenes de G2 (ver el informe de la investigación).
- Linear: https://linear.app/pricing · https://linear.app/docs/insights · https://linear.app/docs/mcp
- Jira: https://www.atlassian.com/software/jira/pricing · https://www.breeze.pm/articles/atlassian-pricing-changes-2026
- GitHub Projects: https://github.com/pricing · https://pickuma.com/for-dev/github-projects-review-built-in-project-management-2026/
- ClickUp: https://clickup.com/pricing · Shortcut: https://www.shortcut.com/faq/ · Notion: https://www.notion.com/pricing · Plane: https://plane.so/pricing.md
- Precios de modelos de IA: https://platform.claude.com/docs/en/about-claude/pricing · https://developers.openai.com/api/docs/pricing · https://ai.google.dev/gemini-api/docs/pricing

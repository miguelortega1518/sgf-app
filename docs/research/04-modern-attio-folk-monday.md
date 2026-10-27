# CRM modernos/flexibles: Attio, folk, monday CRM, Notion/Airtable como CRM

Fecha de investigación: 2026-10-27. Convenciones: **[HECHO]** = página oficial del producto o docs; **[OPINIÓN]** = reseñas de usuarios o terceros (se indica dónde). "no encontrado" = no pude verificarlo. Los precios cambian; verificar antes de decidir. G2 y Reddit se leyeron solo por fragmentos de buscador porque la extracción directa falló o devolvió sin comentarios.

---

## Attio

### Funciones destacadas
- **[HECHO] Modelo de datos flexible**: objetos personalizados, atributos de relación personalizados y atributos con fórmula. Los límites dependen del plan: Free 3 objetos, Plus 5, Pro 12, Enterprise ilimitado. Registros: 50.000 / 250.000 / 1.000.000 / a medida. https://attio.com/pricing
- **[HECHO] Enriquecimiento automático**: sincronización de email y calendario que construye la base de contactos, más enriquecimiento de empresa (descripción, categoría, nº de empleados, ARR, financiación) y de persona. Incluye métricas de "communication intelligence" (primera/última interacción, fuerza de conexión). https://attio.com/pricing
- **[HECHO] Automatizaciones/IA**: el 9-jun-2026 relanzaron Workflows con agentes (Web Agent y Custom Agents para calificar leads o preparar reuniones), se describe el flujo en lenguaje natural y se conectan Notion, Linear, Fin, etc. como bloques o vía MCP. https://attio.com/changelog/2026/the-new-workflows. Actualización posterior: salidas estructuradas de agentes y bucles. https://attio.com/changelog/2026/what-s-new-in-workflows. En 2026 hay unas 55 entradas de changelog, o sea cadencia alta. https://attio.com/changelog/2026
- **[HECHO] Emails y archivos en cualquier objeto**, incluidos deals y objetos personalizados. https://attio.com/changelog/2026/emails-on-deals-and-custom-objects, https://attio.com/changelog/2026/files-on-deals-and-custom-objects
- **[HECHO] API, webhooks, App SDK y MCP server** (según el plan). https://attio.com/pricing
- **Por qué migran desde Salesforce/HubSpot**:
  - [HECHO, caso de cliente publicado por el vendedor] Snackpass dejó Salesforce por costo y administración compleja. Dice que liberó un puesto a tiempo completo que mantenía el CRM y que construyó atribución de canal sin ingeniería. https://attio.com/customers/snackpass
  - [OPINIÓN, blogs de comparación de terceros, interesados] Setup en 1–3 días, no requiere admin, ~5x más barato por asiento. https://www.coffee.ai/articles/attio-vs-salesforce-2026, https://www.craftt.io/salesforce-vs-attio. Salesforce sigue ganando en organizaciones grandes o reguladas: https://spiich.ai/articles/attio-vs-salesforce
  - [OPINIÓN, blogs sobre HubSpot] El salto de HubSpot Starter a Professional (~$7→$90/asiento, más onboarding obligatorio de $1.500, más créditos) empuja a buscar alternativas. https://toolchase.com/blog/hubspot-alternatives/, https://www.lyntonweb.com/library/why-companies-leaving-hubspot-2026

### Precio
- **[HECHO]** Free $0 (3 asientos). Plus $35/asiento/mes anual ($44 mensual, hasta 10 asientos). Pro $79 anual ($99 mensual, ilimitados). Enterprise a medida. https://attio.com/pricing, https://attio.com/f/best-sales-crm. Prueba de 14 días de Pro.
- **[HECHO]** Sistema de créditos compartido por IA y workflows: Plus 100 créditos/asiento y 250/espacio; Pro 500/asiento y 1.500/espacio (según la tabla de la página; la columna de cada plan no está rotulada en el texto extraído, así que es una asignación inferida). Paquetes extra desde $85/mes por 5.000 créditos (precio mensual; con descuento anual $70). https://attio.com/pricing
- **[HECHO]** Call intelligence, secuencias, permisos avanzados y reportes avanzados están en Pro. https://attio.com/pricing
- Un tercero estima 10 usuarios Pro = $8.280/año. [OPINIÓN, tercero] https://www.lyntonweb.com/library/why-companies-leaving-hubspot-2026

### Quejas recurrentes
- **Reportes/analítica débiles** [OPINIÓN, G2]: "Very weak reporting function, and the lack of a date trigger in automation"; otro reseñador dice que reportes y forecasting son más delgados que los CRM maduros y acaba exportando. https://www.g2.com/products/attio/reviews?qs=pros-and-cons, https://www.g2.com/products/attio/reviews?page=4. G2 agrupa 19 reseñas con problemas de email sharing/reportes y 13 con información incompleta (enriquecimiento IA, reportes): https://www.g2.com/products/attio/reviews?page=7&qs=pros-and-cons
- **Integraciones nativas y enriquecimiento** [OPINIÓN, G2]: 25 reseñas piden más conexiones nativas. https://www.g2.com/products/attio/reviews?page=10&qs=pros-and-cons. Outbound nativo "delgado", se usa Zapier. https://www.g2.com/products/attio/reviews?page=2
- **Consumo de créditos y límites en workflows** [OPINIÓN, Software Advice]: los créditos se agotan rápido, "find records" limitado a 100 registros, no hay forma sencilla de correr procesos en lote sobre todos los registros, y secuencias limitadas a 10 inscripciones a la vez. https://www.softwareadvice.com/crm/attio-profile/
- **Exportación masiva CSV de datos grandes/unidos** [OPINIÓN, G2]. https://www.g2.com/products/attio/reviews?qs
- **Curva de aprendizaje de "pizarra en blanco"**, sin soporte telefónico, sin sincronización nativa con LinkedIn [OPINIÓN, TechRadar]. https://www.techradar.com/pro/software-services/attio-crm-review
- **Migración desde HubSpot**: un hilo de Reddit dice que la documentación de Attio solo cubre migración desde Salesforce y Affinity [OPINIÓN, Reddit r/CRM, solo el post]. https://www.reddit.com/r/CRM/comments/1pst3ky/moving_from_hubspot_to_attio/. El hilo r/Entrepreneurs muestra un usuario arrepentido del cambio, pero el contenido del comentario es solo un fragmento de buscador. https://www.reddit.com/r/Entrepreneurs/comments/1w2hyfh/hubspot_vs_attio_which_crm_makes_more_sense_for_a/
- Rendimiento con datos grandes: no encontré quejas específicas de latencia; sí los límites de registros por plan (arriba).

### Oportunidades para un competidor
- Reportes/forecasting y triggers por fecha son el hueco más repetido.
- Créditos opacos y costosos para automatizar a escala: un modelo de costo predecible o ilimitado sería diferenciador.
- Operaciones en lote (workflows sobre todos los registros, exportaciones grandes) y mejor tooling de migración desde HubSpot.

---

## folk

### Funciones destacadas
- **[HECHO]** CRM "relacional" para equipos pequeños: pipelines, campañas de email, enriquecimiento, asistentes de IA, "Magic fields" (campos IA), extensión de LinkedIn, sync de email/calendario/WhatsApp. https://www.folk.app/pricing
- **[HECHO] Modelo de datos**: los deals son objetos personalizados; se pueden definir otros tipos (Proyectos, Candidaturas, Partnerships) dentro de un grupo y enlazarlos a personas y empresas. https://developer.folk.app/core-concepts/custom-objects, https://www.folk.app/changelog/objects-v2-launch
- **[HECHO] Colaboración y vistas**: grupos con dashboards, workflows, campañas y secuencias conectados. https://www.folk.app/changelog/group-management-updates
- **[HECHO] Automatización**: secuencias de email de hasta 10 pasos con borradores IA, según la propia comparación de folk (fuente del vendedor). https://www.folk.app/articles/folk-vs-clarify-automation
- **[HECHO] API**: actualización batch de hasta 100 registros por petición (oct-2026). https://developer.folk.app/changelog
- **Por qué migran** [OPINIÓN, Capterra]: reseñas que cambiaron desde Notion ("cumbersome, slow and didn't have a visual pipeline"), desde Attio ("más adecuado, CRM simple y gestión de email") y valoran simplicidad. https://www.capterra.com/p/251534/folk/reviews/ . Evidencia de migraciones desde Salesforce hacia folk: no encontrada.

### Precio
- **[HECHO]** Standard $24/miembro/mes ($288/año). Premium $48 ($576/año). Enterprise desde $80 ($960/año). Los objetos personalizados, deals, secuencias, roles, dashboards y API están en Premium; Standard no los incluye. https://www.folk.app/pricing
- Hay un plan gratuito según los artículos de folk ("unlimited free CRM plan"), pero el precio extraído no lo muestra y otro artículo del mismo sitio dice "No free plan" refiriéndose a un competidor; tratar como no confirmado. https://www.folk.app/articles/crm-digital-marketing-agencies
- Capterra: 4,5/5 con 46 reseñas. https://www.capterra.com/p/251534/folk/reviews/

### Quejas recurrentes
- **Funciones faltantes/limitadas** [OPINIÓN, G2]: 19 reseñas de "falta de funciones esenciales", 12 de "funciones limitadas", 9 de "personalización limitada". https://www.g2.com/products/folk-folk/reviews?page
- **Reportes y automatización profunda** [OPINIÓN, G2]: "not ideal if you need deep sales automation or complex reporting". Un usuario que gestiona alquileres no puede crear registros de propiedad separados y los modela con campos personalizados en deals, lo cual "se vuelve desordenado". https://www.g2.com/products/folk-folk/reviews?qs=pros-and-cons
- **Email** [OPINIÓN, G2, versión francesa]: 10 menciones de problemas de seguimiento y falta de notificación en Outlook. https://www.g2.com/fr/products/folk-folk/reviews?page=7&qs=pros-and-cons. En Capterra, la integración con Gmail no funciona para un usuario. https://www.capterra.com/p/251534/folk/reviews/
- **Paywall de secuencias** [OPINIÓN, Capterra]: usuario no puede hacer secuencias en su plan. https://www.capterra.com/p/251534/folk/reviews/
- Rendimiento con datos grandes: no encontrado.

### Oportunidades para un competidor
- Objetos personalizados reales y relaciones en todos los niveles (no solo en el plan alto).
- Reportes y automatización condicional más profundos que folk, con la misma simplicidad visual.
- Integración de email robusta (Outlook/Gmail).

---

## monday CRM

### Funciones destacadas
- **[HECHO] Tableros flexibles**: docenas de tipos de columna, dashboards, cotizaciones y facturas, automatizaciones personalizadas; apps móviles; hub de comunicaciones centralizado en Standard. https://monday.com/crm/pricing
- **[HECHO] IA**: agentes (outreach caller, lead sourcer, meeting prep, agente propio), notetaker, campos IA, constructor de apps "vibe", constructor de workflows con IA. https://monday.com/crm/pricing
- **[HECHO] Colaboración**: CRM que comparte plataforma con gestión de trabajo, útil para pasar de la venta a la entrega. [OPINIÓN, tercero] https://till-freitag.com/en/blog/salesforce-vs-monday-crm-en, https://www.business.com/reviews/monday-crm/
- **Por qué migran desde Salesforce** [OPINIÓN, consultoras que venden la migración]: pipelines visuales, menos clics, sin overhead de admin. http://www.orangedotdigital.com/migration-salesforce. Opinión contraria: se llega al techo si hace falta automatización/reportes profundos o aprobaciones complejas. https://ones.com/blog/monday-crm-vs-salesforce-7-key-differences-to-pick-the-right-tool/

### Precio
- **[HECHO]** (la página extraída mostró euros, facturación anual para 10 asientos): Basic €12, Standard €17, Pro €28/asiento/mes; Ultimate aparte. Mensual: €18 / €25 / €41. https://monday.com/crm/pricing
- **[HECHO]** Límites: Basic 1.000 contactos/deals activos, 5 columnas por tablero, 1 dashboard, 20 cotizaciones/mes. Standard 10.000, 15 columnas, 5 dashboards, 250 automatizaciones/mes. Pro 100.000, 75 columnas, 50 dashboards, 25.000 automatizaciones/mes; envíos masivos y secuencias de email solo desde Pro. https://monday.com/crm/pricing
- **[HECHO]** Plan gratis hasta 2 asientos en monday.com general. https://monday.com/pricing . [OPINIÓN, business.com] Mínimo de 3 asientos de pago en monday CRM. https://www.business.com/reviews/monday-crm/

### Quejas recurrentes
- **Curva de aprendizaje y complejidad** [OPINIÓN, G2]: 82 menciones de curva empinada, sobre todo al conectar tableros. Con más tableros y automatizaciones se vuelve complejo y caro. https://www.g2.com/products/monday-crm/reviews?qs=pros-and-cons, https://www.g2.com/products/monday-crm/reviews?Tag=manufacturing+systems&page=10
- **Rendimiento con datos grandes** [OPINIÓN, G2]: lentitud con grandes volúmenes y a veces glitchy; otro reseñador dice lo contrario. https://www.g2.com/products/monday-crm/reviews?page=5. Límites de API/paginación GraphQL: https://www.g2.com/products/monday-crm/reviews?page=7
- **Funciones por plan** [HECHO + OPINIÓN]: límites de columnas y automatizaciones por plan (arriba); business.com señala que Basic carece de integración de email y automatizaciones personalizadas. https://www.business.com/reviews/monday-crm/
- **Soporte** [OPINIÓN, Trustpilot, sobre monday.com en general]: 83 reseñas, mayoría insatisfecha, quejas de servicio al cliente. https://www.trustpilot.com/review/www.monday.com
- Falta de estructura: "si la gente no lo usa igual se desordena rápido" [OPINIÓN, G2]. https://www.g2.com/products/monday-crm/reviews?page=3

### Oportunidades para un competidor
- Modelo con entidades relacionales de verdad (contactos/cuentas/deals) en lugar de tableros planos.
- Pricing sin tiers por columnas/automatizaciones.
- Gobernanza por defecto que evite el desorden cuando muchos usuarios editan.

---

## Notion / Airtable como CRM

### Funciones destacadas
- **Airtable [HECHO]**: base relacional con vistas, automatizaciones y API; límites de registros acumulados por base (Free 1.000). https://support.airtable.com/articles/2277136852-airtable-plans-overview, https://support.airtable.com/articles/9157745778-airtable-workspace-settings-overview
- **Notion [HECHO]**: hasta 500 propiedades por base de datos; la propia ayuda dice que el rendimiento depende de nº de páginas, propiedades visibles y filtros/rollups complejos. https://www.notion.com/help/optimize-database-load-times-and-performance
- [OPINIÓN, comparativas] Airtable puede perseguir seguimientos con campo de fecha + vista filtrada + automatización programada; Notion no a ese nivel. https://fluidcrm.io/blog/notion-vs-airtable-crm/

### Precio
- Airtable: Team ~$20/usuario/mes anual y Business ~$45 [OPINIÓN/tercero, solo editores pagan]. https://clickup.com/blog/airtable-review/ . Registros por base: 50.000 (Team) y 125.000 (Business) según tercero. https://valu.vc/notion-vs-airtable-startup-ops/
- Notion: precio por plan no encontrado (la página oficial extraída no mostró cifras): https://www.notion.com/pricing

### Quejas recurrentes
- **Sin automatización nativa de ventas ni sync de email** [OPINIÓN, Reddit r/Notion y comparativas]: "Biggest downside is lack of built in automations" https://www.reddit.com/r/Notion/comments/13c2pf0/notion_dinconv%C3%A9nients_en_tant_que_crm/fr/ ; https://www.reddit.com/r/CRMSoftware/comments/1rzrqsg/can_you_use_notion_for_crm_or_does_it_get_messy/ ; https://ones.com/blog/notion-vs-airtable-for-crm-features-limits-best-picks/
- **Rendimiento con datos grandes**: Notion se ralentiza desde miles de filas, y más con muchas propiedades y rollups [OPINIÓN, Fabric y Nuclino, no oficial]. https://fabric.so/blog/why-notion-is-slow, https://www.nuclino.com/articles/notion-slow. Airtable: dolor al cruzar ~50.000 registros [OPINIÓN, Jetadmin]. https://www.jetadmin.io/blog/airtable-review/
- **Limitación de registros y API** en planes bajos de Airtable [HECHO]: Free 1.000 registros y 1.000 llamadas API/mes. https://support.airtable.com/articles/2277136852-airtable-plans-overview
- **Migración fuera de Notion** [OPINIÓN, Capterra]: el reseñador dice "Notion was cumbersome, slow and didn't have a visual pipeline". https://www.capterra.com/p/251534/folk/reviews/

### Oportunidades para un competidor
- Un "constructor flexible" con CRM nativo (email sync, pipeline, reglas) evita el ciclo de pegar herramientas.
- Rendimiento predecible con decenas de miles de registros sin planificar particiones.

---

## Lecciones para un producto de gestión de trabajo de equipos de desarrollo

1. **Objetos personalizados y relaciones como base, no como extra de plan alto.** Attio y folk los usan como pilar del pitch y los limitan por tier (Attio 3/5/12 objetos; folk solo en Premium). Hacerlo ilimitado es diferenciador. https://attio.com/pricing, https://www.folk.app/pricing
2. **Reportes y triggers por fecha desde el día uno.** La queja número uno en Attio y folk es el reporting débil y la falta de date triggers. https://www.g2.com/products/attio/reviews?qs=pros-and-cons, https://www.g2.com/products/folk-folk/reviews?qs=pros-and-cons
3. **Modelo de costo de automatización/IA predecible.** Los créditos de Attio se agotan rápido en workflows reales; monday limita automatizaciones por plan. https://www.softwareadvice.com/crm/attio-profile/, https://monday.com/crm/pricing
4. **Operaciones en lote y escala como requisito.** Workflows sobre todos los registros, exportaciones grandes y API con batch (folk ya ofrece 100/petición). https://developer.folk.app/changelog
5. **Gobernanza por defecto.** La flexibilidad de monday se vuelve desorden y complejidad al crecer; plantillas, permisos y estructura guiada reducen esa deriva. https://www.g2.com/products/monday-crm/reviews?page=3
6. **Integraciones nativas con las herramientas de desarrollo (Git, CI, issue tracker) y MCP.** Attio expone MCP y bloques para Linear/Notion en workflows; la demanda de integraciones nativas es la segunda queja. https://attio.com/changelog/2026/the-new-workflows
7. **Migración guiada como producto.** Se pierden adopciones por falta de guías (HubSpot→Attio) mientras Salesforce→Attio tiene soporte. https://www.reddit.com/r/CRM/comments/1pst3ky/moving_from_hubspot_to_attio/
8. **Posicionarse contra el "costo de admin", no solo contra el precio por asiento.** El argumento de Snackpass es el puesto de admin liberado, no solo el costo. https://attio.com/customers/snackpass

---
Limitaciones: no se pudieron leer comentarios completos de Reddit ni páginas de G2 completas; citas de G2 son fragmentos de buscador. Precio de Notion: no encontrado.

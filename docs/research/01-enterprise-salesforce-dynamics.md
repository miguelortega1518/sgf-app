# 01 — Gigantes enterprise: Salesforce (Sales Cloud / Agentforce Sales) y Microsoft Dynamics 365 Sales

Fecha de consulta: 2026-10-27. Convención: **[HECHO]** = fuente oficial del proveedor; **[OPINIÓN]** = reseñas/foros (se indica dónde y cuántas menciones). **[TERCERO]** = blog/analista no oficial (menor confianza). Precios en USD de lista, antes de descuentos.

---

## Salesforce Sales Cloud (renombrado "Agentforce Sales") + Agentforce

### Funciones destacadas
1. **Sales Workspace (nuevo, Spring '26)**: hub con IA para vendedores que une agentes, analítica e insights predictivos. Importa porque intenta reemplazar la navegación por objetos por una vista orientada a "qué hago ahora". [HECHO] https://trailhead.salesforce.com/content/learn/modules/spring-26-release-highlights/see-whats-new-agentforce-data-360-agentforce-sales
2. **Prospección 24/7 por agente**: Agentforce construye listas priorizadas de prospectos, disponibles en CRM y Slack. Importa: automatiza el trabajo de menor valor del vendedor. [HECHO] (misma fuente)
3. **Agentforce Builder + Agent Script + Agent Health Monitoring**: construir/probar agentes en un único espacio, con monitoreo de tasa de error, latencia y escalamiento. Importa: observabilidad de agentes es requisito enterprise. [HECHO] (misma fuente)
4. **Agentforce Voice con SIP** para integrar telefonía existente. [HECHO] (misma fuente)
5. **Personalización extrema + ecosistema** (AgentExchange, APIs, Flow). Es lo más citado por usuarios: "extensive customization options" (1.641 menciones en G2). [OPINIÓN] https://www.g2.com/products/agentforce-sales-formerly-salesforce-sales-cloud/reviews?qs=pros-and-cons
6. **Vista 360 del cliente** (2.051 menciones) y "ease of use" (3.658 menciones) en G2 — misma URL. [OPINIÓN]
7. **Agentforce activado por defecto**: en Winter '27 la plataforma se auto-habilita en orgs existentes y se retira el interruptor de Setup; "sin costo adicional y sin cambios de facturación". [HECHO] https://help.salesforce.com/s/articleView?id=release-notes.rn_agentforce_auto_enable.htm&language=en_US&type=5

### Precio (consultado 2026-10-27)
**[HECHO]** https://www.salesforce.com/sales/pricing/
| Plan | USD/usuario/mes |
|---|---|
| Starter Suite | 25 (mensual o anual) |
| Pro Suite | 100 (anual) |
| Core | 195 (anual) — incluye Slack Business+ y Tableau Next |
| Advanced | 395 (anual) — seguridad reforzada, Backup & Recover, Security Center |
| Max | 550 (anual) — Agentforce for Sales, Coworker, Spiff, Maps, Slack Enterprise+, 2,75 M Flex Credits/org/año |

Agentforce (**[HECHO]** https://www.salesforce.com/agentforce/pricing/):
- Salesforce Foundations: $0 (Agentforce Builder, Prompt Builder, etc.).
- Flex Credits: $500 por 100.000 créditos; una acción Agentforce = 20 créditos (≈ $0,10); acciones de voz = 30 créditos. Los créditos no vencidos no se arrastran al siguiente término.
- Conversations: $2 por conversación (no se pueden mezclar Flex Credits y Conversations en la misma org).
- Add-on Agentforce para Sales/Service: $125/usuario/mes (uso de empleados sin medición); Industries $150.
- Agentforce User License: $5/usuario/mes (requiere Flex Credits); Coworker standalone: $50/usuario/mes.

Contexto de subidas: la lista subió ~6 % el 1-ago-2025 (Enterprise 165→175, Unlimited 330→350) [HECHO anuncio: https://www.salesforce.com/au/news/stories/pricing-update-2025/ ; cifras exactas por tercero: https://dealiqinc.com/vendors/salesforce/]. El 3-sep-2026 Enterprise/Unlimited/Agentforce 1 fueron reemplazados por Core/Advanced/Max; un analista calcula +11 % (175→195) y +13 % (350→395) para Core/Advanced [TERCERO] https://salesforcedictionary.com/news/salesforce-news-september-3-2026-editions-repricing-core-advanced-max . Nota: el precio listado para Agentforce Sales de lista (add-on $125) sigue requiriendo edición Core o superior ("AI can be added to Core and above").

### Quejas recurrentes
- **Curva de aprendizaje y complejidad de configuración**: 1.831 menciones en G2 (la queja más repetida, junto a UX móvil) [OPINIÓN] https://www.g2.com/products/agentforce-sales-formerly-salesforce-sales-cloud/reviews?qs=pros-and-cons ; G2 lista 27.576 reseñas en total. Un resumen de G2 añade que la plataforma "se vuelve compleja a medida que crecen las personalizaciones" y requiere experiencia técnica (misma ficha).
- **Costo**: "expensive", 1.109 menciones en G2 (misma URL). En Reddit: "todo está licenciado y qué incluye cada licencia, con nombres confusos, es muy difícil de entender" (r/salesforce, org de ~5.000 usuarios) https://www.reddit.com/r/salesforce/comments/1i7szuj/what_is_your_companys_sentiment_on_salesforce_in/ ; hilo con un dueño que dice pagar ~US$400k/año https://www.reddit.com/r/salesforce/comments/1syekxa/salesforce_the_love_affair_you_start_to_regret/ [OPINIÓN, hilos individuales, no cuantificable].
- **Cambios constantes de nombres/productos, deprecaciones, documentación desactualizada, AEs sin conocimiento actualizado, latencia/glitches** (mismo hilo 1syekxa; varios comentaristas coinciden, otros lo contradicen como "astroturfing negativo") [OPINIÓN].
- **Renovaciones/contrato**: un usuario relata auto-renovación anual por perder la ventana de aviso de 30 días (r/CRM) https://www.reddit.com/r/CRM/comments/1fak5vr/want_to_get_an_honest_opinion_of_how_people_feel/ [OPINIÓN, 1 caso].
- **Agentforce — precio impredecible y fiabilidad**: en G2 Agentforce "pricing complexity and unpredictability is the most common complaint"; casos de alucinaciones en agentes autónomos, inconsistencia al probar, y base de conocimiento obsoleta que el agente presenta con igual confianza (3 semanas de limpieza en un caso) https://www.g2.com/products/salesforce-agentforce/reviews?date=2025-2026&page=5 y https://www.g2.com/products/salesforce-agentforce/reviews?page=10 [OPINIÓN, varias reseñas]. Un comentarista en r/salesforce lo llama "producto crappy" (1 hilo).
- **Dependencia de datos limpios / costo total de Data Cloud**: un blog estima US$150k–600k de primer año para despliegues avanzados en mid-market [TERCERO, no verificado] https://www.default.com/post/salesforce-agentforce-review-and-pricing

### Oportunidades para un competidor
- **Precio y licenciamiento legibles**: un único plan con lo que incluye, sin edition-ladder ni créditos por acción. Es el dolor más visible (1.109 menciones + hilos).
- **Time-to-value sin admin dedicado**: la configuración sigue siendo la mayor barrera (1.831 menciones).
- **IA que no exige un proyecto de higiene de datos de 3 semanas**: agentes con grounding visible y costos predecibles.
- **Estabilidad de producto y documentación** frente a la rotación de marcas.

---

## Microsoft Dynamics 365 Sales

### Funciones destacadas
1. **Integración nativa con Microsoft 365 (Outlook, Teams, Excel) y Power Platform** — es el principal motivo de elección. [HECHO] https://www.microsoft.com/en-us/dynamics-365/products/sales ; [OPINIÓN] G2: 11 menciones de "seamless integration" https://www.g2.com/products/dynamics-365-sales/reviews?qs=pros-and-cons
2. **Agentes prediseñados**: Sales Qualification Agent (investiga leads, verifica ajuste con ICP, redacta primer correo), Sales Opportunity Agent, Sales Research Agent y Sales Close Agent (preview). [HECHO] https://www.microsoft.com/en-us/dynamics-365/products/sales/pricing y https://learn.microsoft.com/en-us/dynamics365/release-plan/2026wave1/sales/dynamics365-sales/ (descripción de agentes: [TERCERO] https://www.disrupsoft.cl/en/blog/ai-powered-crm-copilot-dynamics-365 ; cambio de plan de abr–jun 2026: https://pricingsaas.com/companies/microsoft.dynamics365/diffs/2026Q2)
3. **Copilot en el flujo de trabajo**: resúmenes de oportunidades/leads, preparación de reuniones, borradores de correo, chat en lenguaje natural, también dentro de Outlook y Teams. [HECHO] https://www.microsoft.com/en-us/dynamics-365/products/sales/pricing
4. **Enriquecimiento autónomo de datos y acciones recomendadas** (solo Premium). Importa: ataca el "CRM sucio", causa raíz de la baja adopción. [HECHO] https://www.microsoft.com/en-us/dynamics-365/products/sales
5. **Conversation intelligence, forecasting, sales accelerator, scoring predictivo, relationship analytics**. [HECHO] notas al pie de la página de precios.
6. **Extensibilidad con Copilot Studio / Power Apps / Power Automate** (estas últimas requieren licencias adicionales). [HECHO] misma página.
7. **Personalización** valorada por usuarios (9 menciones en G2). [OPINIÓN] https://www.g2.com/compare/dynamics-365-sales-vs-pega-customer-engagement-suite

### Precio (consultado 2026-10-27)
**[HECHO]** https://www.microsoft.com/en-us/dynamics-365/products/sales/pricing — todos "usuario/mes, pago anual":
| Plan | USD |
|---|---|
| Sales Professional | 65 |
| Sales Enterprise | 105 (incluye Copilot y acceso a agentes prediseñados) |
| Sales Premium | 150 (todo Enterprise + 1.000 Copilot Credits, Sales Insights, acciones recomendadas, enriquecimiento de datos) |

Copilot Credits adicionales: pago por uso (requiere suscripción Azure) o prepago con Commit Units ("ahorra hasta 20 %") [HECHO] https://www.microsoft.com/en-us/dynamics-365/products/customer-service/pricing ; los créditos se agrupan a nivel de tenant y el consumo por operación depende de su complejidad [HECHO] https://www.microsoft.com/licensing/guidance/Copilot-Credits . Cantidad de créditos que consume cada agente en Sales: no encontrado.

### Quejas recurrentes
- **Curva de aprendizaje**: 13 menciones; **complejidad**: 8; **"no siempre intuitivo"**: 7; **costo alto**: 6 (G2, totales históricos) [OPINIÓN] https://www.g2.com/compare/dynamics-365-sales-vs-pega-customer-engagement-suite ; ficha con 1.624 reseñas https://www.g2.com/products/dynamics-365-sales/reviews?qs. Las reseñas citan que reportes y personalización avanzada requieren perfil técnico, y que el rendimiento se degrada.
- **Lentitud y dependencia del partner**: un usuario que migra de D365 Sales a HubSpot lo describe como "lento, difícil de adaptar, con soporte in-app deficiente y documentación confusa/obsoleta" (r/Dynamics365) https://www.reddit.com/r/Dynamics365/comments/1kpc1mz/popularity_of_microsoft_dynamics/ ; otro: funciones básicas requieren desarrollos del partner y carga de datos lenta, y 2,5 M de registros se multiplican ×10 en tamaño en Dataverse https://www.reddit.com/r/Dynamics365/comments/1jexx1o/questions_about_typical_dynamics_implementation/ [OPINIÓN, 2 hilos].
- **Licenciamiento complejo y caro**: hilo con mezcla de licencias Sales Enterprise/Customer Engagement/Team Member sin descuentos, "sobrevalorado" (hilo antiguo, de 2020; usar con cautela) https://www.reddit.com/r/Dynamics365/comments/iz97kp/licensing_costs/ [OPINIÓN].
- **IA medida por créditos**: la IA completa (agentes) exige Premium o créditos aparte; Enterprise no incluye créditos [TERCERO] https://flectic.com/learn/sales-pricing-guide . No encontré reseñas de usuarios sobre sorpresas de factura de Copilot Credits en Sales → "no encontrado".

### Oportunidades para un competidor
- **UX que no necesite capacitación**: aprendizaje y complejidad son las quejas #1–2.
- **Costo de implementación y dependencia del partner**: una oferta "autoservicio" con importación y personalización sin consultor.
- **Precio de IA transparente**: sin consumo medido por créditos ni Azure obligatorio.
- **Rendimiento y simplicidad** como promesa explícita.

---

## Lecciones para un producto de gestión de trabajo de equipos de desarrollo

1. **Precio de una sola línea.** Ambos gigantes sufren por escalones, add-ons y créditos; ofrecer un plan por usuario con IA incluida y tope de consumo visible es diferenciador directo.
2. **Valor en menos de un día, sin admin.** La curva de aprendizaje encabeza las quejas de ambos (1.831 y 13 menciones en G2). Plantillas por defecto para flujos de equipos dev (sprints, bugs, releases) y onboarding guiado.
3. **Integración profunda con el entorno donde ya trabaja el equipo** (Git, CI, chat, IDE) — equivalente a lo que Microsoft gana con Outlook/Teams. Capturar actividad automáticamente para que nadie "llene el CRM/tablero".
4. **IA que parte de datos propios y limpios**: automatizar enriquecimiento y mantenimiento (estado de tareas inferido de commits/PR) en lugar de pedir higiene manual; los agentes de ambos fallan cuando la base está sucia (Agentforce G2).
5. **Costo de IA predecible**: mostrar el consumo, permitir presupuesto máximo, evitar medidores por acción; la queja de "pricing unpredictability" ya domina Agentforce.
6. **Observabilidad y reversibilidad de agentes**: Salesforce lanza Agent Health Monitoring; ofrecer registro de acciones del agente y deshacer en un clic desde el inicio.
7. **Estabilidad de producto y nomenclatura**: evitar renombrar y deprecar; mantener documentación actualizada es ventaja explícita frente a Salesforce.
8. **No auto-activar IA sin consentimiento.** Salesforce enciende Agentforce por defecto y retira el interruptor (Winter '27); un producto que dé control granular a admins por equipo gana confianza.

---
*Límites: G2 y varios sitios bloquearon la extracción directa; las cifras de menciones de G2 provienen de fragmentos de resultados de búsqueda. Hilos de Reddit son anécdotas, no muestra representativa. Los precios de Microsoft se tomaron de fragmentos del sitio oficial (la página renderiza con JS).*

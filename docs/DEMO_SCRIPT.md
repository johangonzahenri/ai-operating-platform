# AI Operating Platform (v1.1.0) &mdash; Interview & Demonstration Script

Este documento contiene el guion estructurado para demostraciones técnicas y ejecutivas de la **AI Operating Platform (v1.1.0)** en tres duraciones: 5 minutos, 10 minutos y 20 minutos.

---

## 1. Versión Rápida &mdash; 5 Minutos (Elevator Pitch Técnico)

### Minuto 0:00 &ndash; 1:00: Qué es la Plataforma
* **Discurso:** "Esta es la AI Operating Platform. Es una infraestructura completa diseñada para resolver el problema de cómo las empresas ejecutan y gobiernan sistemas de agentes de IA de forma segura, determinista y auditable sin depender de cajas negras ni frameworks frágiles."
* **Acción en pantalla:** Abrir `http://127.0.0.1:3000`, mostrar la Consola de Operaciones y la insignia de estado del motor en tiempo real.

### Minuto 1:00 &ndash; 2:30: El Escenario Dorado (Golden Scenario)
* **Discurso:** "Para verla en acción, veamos una aplicación de comercio electrónico real llamada Tentaciones consumiendo la plataforma. El usuario escribe en lenguaje natural: *'Quiero unas zapatillas negras para correr y ver cómo me quedan'*. La plataforma no alucina: extrae la intención, consulta el catálogo real, recomienda el modelo con fibra de carbono, evalúa la talla en el Probador Virtual 3D y calcula el umbral de despacho gratis."
* **Acción en pantalla:** Ejecutar la tarea desde la Consola o ejecutar el Golden Journey en la pestaña de Showcase.

### Minuto 2:30 &ndash; 4:00: Inspección de la Traza y Gobernanza
* **Discurso:** "Lo que hace única a esta plataforma es lo que ocurre tras bambalinas: cada paso genera un evento inmutable en SQLite WAL con secuencia monótona. La seguridad opera bajo Default-Deny: ninguna herramienta se ejecuta sin autorización RBAC explícita."
* **Acción en pantalla:** Mostrar el timeline de eventos duraderos y la pestaña de Políticas de Gobernanza.

### Minuto 4:00 &ndash; 5:00: Conclusión y Métricas
* **Discurso:** "El core engine tiene cero dependencias externas en tiempo de ejecución, cuenta con más de 890 pruebas automáticas pasando y permite cambiar entre modelos locales (Ollama) y modelos de nube (OpenAI/Anthropic) con un solo interruptor."
* **Acción en pantalla:** Mostrar la consola de Integraciones y la pestaña de Tenants & Quotas.

---

## 2. Versión Estándar &mdash; 10 Minutos (Demostración Técnica de Producto)

### Minuto 0:00 &ndash; 2:00: Arquitectura Hexagonal y Principios
* Explicar el principio: $\text{CORE ENGINE} \neq \text{PLATFORM PRODUCT} \neq \text{APPLICATIONS}$.
* Mostrar la separación de capas: Dominio puro, Casos de uso de aplicación, Adaptadores de infraestructura, API REST y SDK tipado.

### Minuto 2:00 &ndash; 5:00: Tentaciones AI Commerce E2E
* Búsqueda en lenguaje natural con análisis semántico.
* Probador Virtual 3D: Perfiles biométricos (Nova, Sora, Mateo), URNs estándar y recomendación de tallas.
* Asistencia en carrito con validación estricta de stock antes de mutar.
* Flujo de checkout con distinción clara entre Webpay Demo y pasarela productiva.

### Minuto 5:00 &ndash; 8:00: SaaS Control Plane y Fábrica de Aplicaciones
* Gestión multi-inquilino y cuotas de consumo por plan (FREE, PRO, BUSINESS, ENTERPRISE).
* Validador de manifiestos (`application.json`) y catálogo oficial de 7 capacidades gobernadas.
* Consola de integraciones reales (/integrations) y generación de evidencia segura.

### Minuto 8:00 &ndash; 10:00: Resiliencia y Durabilidad
* Simulación o explicación del `RestartRecoveryService`: recuperación automática ante caídas de servidor.
* Verificación de seguridad en el frontend: 0 innerHTML, 0 eval, cero fugas de claves de API.
* Preguntas y respuestas técnicas.

---

## 3. Versión Completa &mdash; 20 Minutos (Deep Dive de Arquitectura para Líderes Técnicos)

* **0:00 - 4:00:** Contexto de negocio, riesgos de arquitecturas de IA no gobernadas y justificación del diseño hexagonal.
* **4:00 - 8:00:** Demostración en vivo de Tentaciones AI Commerce: ciclo completo desde consulta hasta orden confirmada.
* **8:00 - 12:00:** Análisis de código del Core Engine: FSM de operaciones autónomas, `AutonomyBudget`, `GovernedModelRouter` y fallback dinámico.
* **12:00 - 15:00:** Seguridad y Auditoría: RBAC fail-closed, evaluación de políticas, prevención de contaminación de prototipos y sanitización de secretos.
* **15:00 - 18:00:** Persistencia y Recuperación: SQLite WAL monotonic ordering, adaptación PostgreSQL y exportación OpenTelemetry.
* **18:00 - 20:00:** Conclusiones, matriz de verdad de capacidades y hoja de ruta.

# Registro Oficial de Aplicaciones del Ecosistema (Application Registry)
## Registro Canónico del Portafolio y Estado de Proyectos

Este registro documenta formalmente las aplicaciones satélites del ecosistema gobernado por la **AI Operating Platform**, especificando su nivel de integración, capacidades consumidas, tecnologías, repositorios y estado de verificación.

---

## 1. Invariante Fundamental del Ecosistema

$$\text{Core Engine} \neq \text{Platform Product} \neq \text{Child Applications}$$
$$\text{Platform Product} \neq \text{Application}$$
$$\text{Application} \neq \text{External Service}$$

Las aplicaciones del ecosistema son **entidades de negocio independientes** que son dueñas de sus catálogos, lógica de inventario, carritos de compra y políticas comerciales. Consumen inteligencia artificial, automatizaciones y servicios de gobernanza de la plataforma a través de contratos REST seguros mediante `PlatformClient`.

---

## 2. Matriz Maestra del Registro de Proyectos

| Project ID | Name | Repository | Local Path | Status | Framework | Platform Integration | UI | Backend | AI | AR | Payments | Security | Tests | Documentation |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`PROJ-00-PLATFORM`** | AI Operating Platform | `johangonzahenri/ai-operating-platform` | `.` (Root) | `IMPLEMENTED` | Node.js Nativo / TypeScript | Core Engine & Parent API | SPA Nativa (0 innerHTML) | Node.js REST API | Multi-Provider Gateway | N/A | API Key & Scopes | Zero-Trust, RBAC, PolicyGateway | 1600 PASS (74 suites) | `LIBRO_OFICIAL.md`, `MANUAL_OFICIAL.md` |
| **`PROJ-01-TENTACIONES`** | Tentaciones AI Commerce | `johangonzahenri/tentaciones-ai-commerce` (Propuesto) | `src/application/platform/` | `PARTIAL` | TypeScript / Node.js | `TentacionesPlatformAdapter` sobre `PlatformClient` | Standalone Web (En diseño) | Motor Local + REST Client | Search, Recommendations, Cart Assist | URN Validation & Fitting Bridge | Webpay Demo Simulation | Tenant Scopes (`tenant-tentaciones`) | 48 PASS | `docs/TENTACIONES_PLATFORM_INTEGRATION.md` |
| **`PROJ-02-SPAREPARTS`** | Spare Parts Search & Comparison | `johangonzahenri/spare-parts-store` (Propuesto) | `examples/reference-consumer/` / Futuro satélite | `PLANNED` | TypeScript / Web SPA | `PlatformClient` + Multi-Source Connectors | Buscador y Comparador Multi-Tienda | Motor de Compatibilidad & Precios | Parts Discovery & Cross-Reference | N/A | Comparación de Ofertas Externas | Evidence Provenance & Scopes | 16 PASS (Ref App) | `docs/PROJ_02_SPARE_PARTS_PRODUCT_CHARTER.md` |
| **`PROJ-03-FLEET`** | Fleet Management | `johangonzahenri/fleet-management` (Propuesto) | Por crear | `PLANNED` | TypeScript / Web | Ingestion IoT hacia `PlatformClient` | Mapas & Telemetría (Planificado) | Event Dispatcher & Route Engine | Route Optimization & Pred. Maint. | N/A | N/A | Hardware Spooler Isolation | 0 PASS (Planificado) | `docs/APPLICATION_PORTFOLIO.md` |
| **`PROJ-04-PORTAL`** | Customer Portal | `johangonzahenri/customer-portal` (Propuesto) | Por crear | `PLANNED` | TypeScript / Web | Webhooks hacia `PlatformClient` | Portal Autoservicio (Planificado) | Ticket Lifecycle & Triage | Helpdesk Triage & Solution Bot | N/A | N/A | Human Oversight & SoD Gating | 0 PASS (Planificado) | `docs/APPLICATION_PORTFOLIO.md` |
| **`PROJ-05-ANALYTICS`** | Analytics AI | `johangonzahenri/analytics-ai` (Propuesto) | Por crear | `PLANNED` | TypeScript / Web | Harvester sobre `/api/v1/business/*` | Dashboard Gráfico (Planificado) | Metric Aggregator & Reporter | Trend Detection & Exec Briefing | N/A | N/A | Executive RBAC & Masking | 0 PASS (Planificado) | `docs/APPLICATION_PORTFOLIO.md` |

---

## 3. Fichas Arquitectónicas Detalladas por Aplicación

### 3.1. PROJ-01-TENTACIONES — Tentaciones AI Commerce
* **Propósito**: E-commerce para retail de vestuario femenino y deportivo con asistencia conversacional y probador virtual 3D/AR.
* **Dominio de Negocio**: Retail / E-Commerce / Fashion Tech.
* **Repositorio Propuesto**: `https://github.com/johangonzahenri/tentaciones-ai-commerce`
* **Capacidades de Plataforma Utilizadas**: `product.discovery`, `product.recommendation`, `product.compare`, `cart.assistance`, `ar.fitting_room`.
* **Agentes Potenciales**: `shopping-agent`, `stylist-agent`, `inventory-agent`.
* **Flujos de Trabajo Potenciales**: Descubrimiento semántico -> Recomendación -> Ajuste de Talla AR -> Asistencia de Carrito -> Checkout.
* **Integraciones Potenciales**: Webpay Plus (Transbank), Shopify/WooCommerce catalog sync, WebXR viewer.
* **Estado Actual**: **`PARTIAL`** (Adaptador de plataforma y motor en memoria 100% testeados; interfaz gráfica standalone pendiente).
* **MVP Planificado**: Single Page Application comercial con catálogo reactivo, probador AR y checkout determinista.
* **Dependencias**: `ai-operating-platform` corriendo en `/api/v1/*` y cliente `@ai-platform/client`.

---

### 3.2. PROJ-02-SPAREPARTS — Spare Parts Search & Comparison
* **Propósito**: Buscador y comparador inteligente de repuestos de vehículos multi-fuente con verificación determinista de compatibilidad, cálculo de reputación de vendedores y costo total (inspirado en el modelo multi-tienda de SoloTodo).
* **Dominio de Negocio**: Automotriz / Búsqueda y Comparación / Repuestos.
* **Repositorio Propuesto**: `https://github.com/johangonzahenri/spare-parts-store`
* **Documento Canónico**: [`docs/PROJ_02_SPARE_PARTS_PRODUCT_CHARTER.md`](./PROJ_02_SPARE_PARTS_PRODUCT_CHARTER.md)
* **Capacidades de Plataforma Utilizadas**: `product.discovery`, `parts.compatibility`, `product.compare`, `report.generate`, `automation.execute`.
* **Agentes y Servicios**: `QueryUnderstandingAgent`, `VehicleIdentificationService`, `SourceSearchCoordinator`, `ProductNormalizationAgent`, `DeterministicFitmentEngine`, `CrossReferenceEngine`, `PriceIntelligenceService`, `SellerReputationService`.
* **Flujos de Trabajo Potenciales**: Búsqueda por vehículo/lenguaje natural -> Despacho paralelo a conectores -> Normalización canónica -> Verificación de compatibilidad con evidencia -> Comparación lado a lado -> Redirección a tienda oficial.
* **Estado Actual**: **`PLANNED`** (Fases 141-149 registradas en el Master Work Plan; referencia previa de compatibilidad validada en suite de pruebas).
* **MVP Planificado**: Aplicación web SPA con búsqueda dual (vehículo + lenguaje natural), tabla comparativa multi-fuente y telemetría reactiva SSE.
* **Dependencias**: `ai-operating-platform` (`@ai-platform/client`, OpenAPI 3.1, SSE streaming).

---

### 3.3. PROJ-03-FLEET — Fleet Management
* **Propósito**: Gestión integral de flotas comerciales, seguimiento de telemetría IoT, mantenimiento predictivo y despacho inteligente de rutas.
* **Dominio de Negocio**: Logística / Transporte / Gestión de Activos.
* **Repositorio Propuesto**: `https://github.com/johangonzahenri/fleet-management`
* **Capacidades de Plataforma Utilizadas**: `fleet.telemetry`, `route.optimization`, `maintenance.predictive`, `dispatch.agent`.
* **Agentes Potenciales**: `fleet-dispatcher-agent`, `maintenance-planner-agent`, `fuel-efficiency-agent`.
* **Flujos de Trabajo Potenciales**: Ingesta de telemetría -> Detección de anomalías -> Re-planificación de rutas -> Asignación a choferes.
* **Integraciones Potenciales**: Dispositivos GPS/OBD-II, APIs de mapas y tráfico en tiempo real.
* **Estado Actual**: **`PLANNED`** (Ficha arquitectónica definida; sin código fuente).
* **MVP Planificado**: Consola de mapa con visualización de vehículos, estado de combustible y despacho de rutas optimizadas.
* **Dependencias**: `ai-operating-platform` y cliente `@ai-platform/client`.

---

### 3.4. PROJ-04-PORTAL — Customer Portal
* **Propósito**: Portal unificado de atención al cliente y soporte técnico con agentes conversacionales, triaje inteligente y escalamiento gobernado.
* **Dominio de Negocio**: Atención al Cliente / Helpdesk / Post-Venta.
* **Repositorio Propuesto**: `https://github.com/johangonzahenri/customer-portal`
* **Capacidades de Plataforma Utilizadas**: `ticket.triage`, `ticket.resolution`, `ticket.escalate`, `human.oversight`.
* **Agentes Potenciales**: `triage-bot-agent`, `technical-support-agent`, `billing-agent`.
* **Flujos de Trabajo Potenciales**: Recepción de consulta -> Clasificación de urgencia -> Respuesta autónoma con RAG -> Aprobación humana de reembolso.
* **Integraciones Potenciales**: Zendesk, WhatsApp Business API, correo electrónico IMAP/SMTP.
* **Estado Actual**: **`PLANNED`** (Ficha arquitectónica definida; sin código fuente).
* **MVP Planificado**: Widget de chat web con historial de conversaciones y panel de agente humano supervisor.
* **Dependencias**: `ai-operating-platform` y cliente `@ai-platform/client`.

---

### 3.5. PROJ-05-ANALYTICS — Analytics AI
* **Propósito**: Plataforma de inteligencia de negocios (BI) y recolección analítica para monitoreo de rendimiento estratégico, financiero y operacional.
* **Dominio de Negocio**: Business Intelligence / Analítica Predictiva / Dirección Ejecutiva.
* **Repositorio Propuesto**: `https://github.com/johangonzahenri/analytics-ai`
* **Capacidades de Plataforma Utilizadas**: `metric.harvesting`, `report.synthesis`, `anomaly.detection`, `executive.briefing`.
* **Agentes Potenciales**: `data-analyst-agent`, `executive-briefing-agent`, `anomaly-auditor-agent`.
* **Flujos de Trabajo Potenciales**: Agregación de eventos -> Cálculo de KPIs de portafolio -> Detección de desviaciones -> Generación de reporte PDF.
* **Integraciones Potenciales**: Fuentes de datos SQL/NoSQL externas, herramientas de visualización de datos.
* **Estado Actual**: **`PLANNED`** (Ficha arquitectónica definida; sin código fuente).
* **MVP Planificado**: Dashboard de indicadores ejecutivos en tiempo real con resúmenes ejecutivos generados por agentes gobernados.
* **Dependencias**: `ai-operating-platform` y cliente `@ai-platform/client`.

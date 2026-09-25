# Registro de Documentación Oficial (Documentation Registry)

Este registro cataloga todos los documentos oficiales, técnicos y manuales operativos de la **AI Operating Platform**, definiendo su propósito, idioma, autoridad canónica y estado de revisión.

---

## 1. Catálogo Canónico de Documentos

| Documento | Propósito | Idioma | Canónico | Estado | Última Revisión | Componentes Relacionados |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `LIBRO_OFICIAL_AI_OPERATING_PLATFORM.md` | Libro y especificación integral de arquitectura de la plataforma en 13 capítulos. | `es-419` | **SÍ** | VIGENTE | 2026-09-17 | Todos los componentes del sistema |
| `docs/LIBRO_OFICIAL_AI_OPERATING_PLATFORM.md` | Espejo sincronizado del Libro Oficial dentro del directorio de documentación. | `es-419` | SÍ (Espejo) | VIGENTE | 2026-09-17 | Todos los componentes del sistema |
| `docs/SOURCE_OF_TRUTH.md` | Jerarquía oficial de autoridad documental y resolución de discrepancias. | `es-419` | **SÍ** | VIGENTE | 2026-09-17 | Gobernanza documental y calidad |
| `docs/MASTER_WORK_PLAN.md` | Plan Maestro Operativo Oficial, indexación X.Y.Z, checklists y trazabilidad dinámica. | `es-419` | **SÍ** | VIGENTE | 2026-09-24 | Planificación operativa, gobernanza y tareas |
| `docs/AGENT_OPERATING_PROTOCOL.md` | Protocolo canónico de comportamiento operativo y directivas para agentes de IA. | `es-419` | **SÍ** | VIGENTE | 2026-09-24 | Agentes IA, Gobernanza, Directivas |
| `docs/PROJ_02_SPARE_PARTS_PRODUCT_CHARTER.md` | Carta constitutiva y especificación de producto para Spare Parts Search & Comparison. | `es-419` | **SÍ** | VIGENTE | 2026-09-24 | Portafolio, PROJ-02, Fitment, Multi-tienda |
| `docs/ROADMAP_MASTER.md` | Registro granular y estructurado de iniciativas técnicas con identificadores únicos. | `es-419` | **SÍ** | VIGENTE | 2026-09-17 | Roadmap, planificación y backlog |
| `ROADMAP.md` | Resumen ejecutivo de hitos de versión y criterios de cierre de fase. | `es-419` | **SÍ** | VIGENTE | 2026-09-17 | Hitos v0.1 a v1.1 y futuro v1.2 |
| `README.md` | Guía de bienvenida, visión general, arquitectura de capas e instrucciones de arranque. | `es-419` | **SÍ** | VIGENTE | 2026-09-17 | Control Plane, Servidor, Scripts |
| `CHANGELOG.md` | Historial cronológico de cambios notables organizado según Keep a Changelog. | `es-419` | **SÍ** | VIGENTE | 2026-09-17 | Releases v0.1 a v1.1.0 |
| `docs/MANUAL_OFICIAL.md` | Manual operacional para desarrolladores y administradores de la plataforma. | `es-419` | **SÍ** | VIGENTE | 2026-09-17 | Platform API, SDK, CLI, Web UI |
| `docs/MANUAL_ARQUITECTURA.md` | Guía detallada de patrones arquitectónicos, puertos, adaptadores e invariantes. | `es-419` | SÍ | VIGENTE | 2026-09-17 | Hexagonal, CQRS, FSM, WAL |
| `docs/PROMPT_TRACEABILITY.md` | Matriz de trazabilidad de los prompts 94 al 100 con evidencias y commits. | `es-419` | **SÍ** | VIGENTE | 2026-09-17 | Prompts 94-100, Git |
| `docs/ARCHITECTURE_REGISTRY.md` | Inventario detallado de capas, paquetes y responsabilidades del código fuente. | `es-419` | **SÍ** | VIGENTE | 2026-09-17 | `src/` (Core, Domain, Infra, API) |
| `docs/APPLICATION_REGISTRY.md` | Registro de aplicaciones del ecosistema satélite conectadas o integradas. | `es-419` | **SÍ** | VIGENTE | 2026-09-17 | Tentaciones, Vehicle Parts, Support |
| `docs/DEVICE_REGISTRY.md` | Registro de dispositivos físicos comerciales y adaptadores de hardware. | `es-419` | **SÍ** | VIGENTE | 2026-09-17 | Brother DCP-1600, Spooler |
| `docs/SECURITY_REGISTRY.md` | Catálogo de controles de seguridad, aislamiento multi-tenant y mitigaciones. | `es-419` | **SÍ** | VIGENTE | 2026-09-17 | RBAC, Default Deny, Secret Redaction |
| `docs/TEST_REGISTRY.md` | Registro de suites de pruebas automatizadas, contratos y métricas de calidad. | `es-419` | **SÍ** | VIGENTE | 2026-09-18 | `tests/` (1064 tests PASS) |
| `docs/TECHNICAL_DEBT.md` | Registro explícito de brechas técnicas, limitaciones conocidas y deuda técnica. | `es-419` | **SÍ** | VIGENTE | 2026-09-18 | Gaps de autenticación, red, memoria, presupuestos |
| `docs/DECISIONS.md` | Índice maestro y consolidación de Registros de Decisiones Arquitectónicas (ADRs). | `es-419` | **SÍ** | VIGENTE | 2026-09-18 | `docs/decisions/` (ADRs 0001-0028) |
| `docs/V1_EXIT_CRITERIA.md` | Lista de verificación de criterios objetivos para certificación de producción. | `es-419` | **SÍ** | VIGENTE | 2026-09-20 | Production Readiness Gate |
| `docs/RELEASE_CERTIFICATION_V1.md` | Matriz oficial y reporte de certificación de release v1.3.0 (AOP-V1-EXIT). | `es-419` | **SÍ** | VIGENTE | 2026-09-20 | Release Certification Audit |
| `docs/V1_RELEASE_READINESS.md` | Evaluación integral de preparación para producción y gobernanza de release v1.3.0. | `es-419` | **SÍ** | VIGENTE | 2026-09-20 | Release Readiness & Production Audit |
| `DOCUMENTACION/KANBAN_TABLERO_MAESTRO.md` | Tablero Maestro Kanban multi-proyecto y multi-fase de la plataforma. | `es-419` | **SÍ** | VIGENTE | 2026-09-18 | Roadmap, Fases y Gestión |
| `docs/PLATFORM_API.md` | Especificación de contratos REST, esquemas de payload y códigos de respuesta. | `es-419` | SÍ | VIGENTE | 2026-09-17 | `src/platform/api/` |
| `docs/PLATFORM_CLIENT.md` | Guía de uso del SDK en TypeScript `@ai-platform/client` para aplicaciones satélites. | `es-419` | SÍ | VIGENTE | 2026-09-17 | `src/platform-client/` |
| `docs/OPERATIONAL_CONSOLE.md` | Guía de operación y arquitectura de la interfaz web Single-Page Application. | `es-419` | SÍ | VIGENTE | 2026-09-17 | `src/platform/web/` |
| `docs/REAL_AI_PROVIDERS.md` | Guía de configuración y adaptadores de modelos OpenAI, Anthropic y Ollama. | `es-419` | SÍ | VIGENTE | 2026-09-17 | `src/infrastructure/model/` |
| `docs/BUSINESS_DEVICES.md` | Especificación del adaptador de hardware e impresora comercial Brother. | `es-419` | SÍ | VIGENTE | 2026-09-17 | `src/infrastructure/device/` |
| `docs/CREDENTIAL_GOVERNANCE.md` | Gobernanza de credenciales API, almacenamiento zero-plaintext y rotación. | `es-419` | SÍ | VIGENTE | 2026-09-19 | `src/domain/security/api-credential.ts` |
| `docs/NETWORK_TOPOLOGY.md` | Topología de red perimetral, DMZ y exposición controlada de APIs. | `es-419` | SÍ | VIGENTE | 2026-09-20 | `src/platform/server.ts`, `src/platform/api/` |
| `docs/NETWORK_SECURITY.md` | Defensa en profundidad perimetral, cabeceras estrictas y aislamiento físico. | `es-419` | SÍ | VIGENTE | 2026-09-20 | `src/platform/api/http-router.ts` |
| `docs/EXTERNAL_CONSUMERS.md` | Guía de integración de consumidores externos, SDK y conectividad webhooks. | `es-419` | SÍ | VIGENTE | 2026-09-20 | `src/platform-client/` |
| `docs/AI_APPLICATION_PORTFOLIO_MAP.md` | Mapa visual y topología jerárquica del portafolio de aplicaciones satélites. | `es-419` | **SÍ** | VIGENTE | 2026-09-22 | Portafolio, Ecosistema, Mermaid |
| `docs/APPLICATION_PORTFOLIO.md` | Cartera oficial de aplicaciones derivadas, estrategia de repositorios y ciclo de vida. | `es-419` | **SÍ** | VIGENTE | 2026-09-22 | Portafolio, Apps Satélites |
| `docs/PROJECT_NOMENCLATURE.md` | Nomenclatura oficial canónica, mapa conceptual del ecosistema y glosario de términos. | `es-419` | **SÍ** | VIGENTE | 2026-09-23 | Gobernanza, Ecosistema, Mermaid |
| `docs/REPOSITORY_MAP.md` | Mapa físico de directorios y desglose exhaustivo por capas del código fuente `src/`. | `es-419` | **SÍ** | VIGENTE | 2026-09-23 | Repositorio, Arquitectura Hexagonal |
| `docs/PERSISTENCE_ARCHITECTURE.md` | Arquitectura de persistencia duradera en SQLite con WAL, OCC, rehidratación y recuperación. | `es-419` | **SÍ** | VIGENTE | 2026-09-23 | `src/infrastructure/persistence/sqlite/` |
| `docs/SCRIPTS_CATALOG.md` | Catálogo e inventario detallado de todos los scripts operacionales y comandos npm. | `es-419` | **SÍ** | VIGENTE | 2026-09-23 | `scripts/`, `package.json` |
| `docs/TEST_ARCHITECTURE.md` | Arquitectura de pruebas, desglose de las 74 suites y 1600 tests en 8 dominios. | `es-419` | **SÍ** | VIGENTE | 2026-09-23 | `tests/unit/` (1600 tests PASS) |
| `docs/OFFICIAL_DOCUMENTATION_INDEX.md` | Índice maestro de documentación oficial organizado por categorías y perfiles de rol. | `es-419` | **SÍ** | VIGENTE | 2026-09-23 | Todos los componentes y documentos |
| `docs/PLATFORM_PRODUCT_BASELINE_V1_4.md` | Línea base del producto v1.4.0: arquitectura, capacidades, gaps y opciones de roadmap. | `es-419` | **SÍ** | VIGENTE | 2026-09-23 | Plataforma Estrella, Baseline v1.4 |
| `docs/DEVELOPER_PLATFORM.md` | Especificación integral de la Developer Platform, Application Factory y CLI. | `es-419` | **SÍ** | VIGENTE | 2026-09-23 | Developer Platform, Application Factory, CLI |
| `docs/APPLICATION_FACTORY_CLI.md` | Guía de referencia y manual de comandos para la CLI de andamiaje `create-aop-app`. | `es-419` | **SÍ** | VIGENTE | 2026-09-23 | `create-aop-app`, Scaffolding, CLI, ApplicationFactory |
| `docs/OPENAPI_GUIDE.md` | Guía y especificación oficial del contrato OpenAPI 3.1 de la Platform REST API. | `es-419` | **SÍ** | VIGENTE | 2026-09-23 | OpenAPI 3.1, REST API, Contrato, SDK |
| `docs/SSE_EVENT_STREAMING.md` | Guía oficial y especificación técnica de streaming de eventos en tiempo real (SSE). | `es-419` | **SÍ** | VIGENTE | 2026-09-23 | Server-Sent Events, EventStreamAdapter, Web Control Plane |
| `docs/SDK_GUIDE.md` | Guía de referencia y manual de uso exhaustivo del SDK `@ai-platform/client`. | `es-419` | **SÍ** | VIGENTE | 2026-09-23 | `@ai-platform/client`, SDK, Client Error Codes |
| `docs/APPLICATION_INTEGRATION_GUIDE.md` | Guía canónica de integración para aplicaciones satélites del ecosistema. | `es-419` | **SÍ** | VIGENTE | 2026-09-23 | Satélites, Portafolio, Webhooks, Idempotency |
| `docs/REFERENCE_APPLICATION.md` | Especificación y certificación de la aplicación de referencia canónica (Reference Consumer). | `es-419` | **SÍ** | VIGENTE | 2026-09-23 | Reference Consumer, Certification, Live SSE, Adapter |
| `docs/MULTI_AGENT_PLATFORM.md` | Arquitectura de plataforma multi-agente, taxonomía, tool proficiency, Web AI y proveedores externos. | `es-419` | **SÍ** | VIGENTE | 2026-09-24 | Multi-Agent, Web AI, Evaluation, External Providers |
| `docs/BUSINESS_AGENT_USE_CASES.md` | Catálogo canónico de casos de uso de automatización empresarial en 13 áreas de negocio. | `es-419` | **SÍ** | VIGENTE | 2026-09-24 | Business Automation, Agents, Oversight, Evidence |
| `docs/AUTOMOTIVE_SOURCE_MAP.md` | Mapa canónico de fuentes automotrices, taxonomía, métodos de acceso y modelo de confianza. | `es-419` | **SÍ** | VIGENTE | 2026-09-24 | Spare Parts, Source Discovery, PROJ-02, Fitment |
| `docs/SPARE_PARTS_DOMAIN_MODEL.md` | Modelo de dominio canónico para repuestos, vehículos, compatibilidad y ofertas (PROJ-02). | `es-419` | **SÍ** | VIGENTE | 2026-09-24 | Spare Parts, Domain Model, Fitment, Offers |
| `docs/SPARE_PARTS_MULTI_SOURCE_SEARCH.md` | Especificación de búsqueda multi-fuente paralela, selección y aislamiento de fallos (PROJ-02). | `es-419` | **SÍ** | VIGENTE | 2026-09-24 | Spare Parts, Multi-Source Search, Parallel, Agents |
| `docs/SPARE_PARTS_NORMALIZATION_DEDUP_CROSS_REFERENCE.md` | Motor de normalización, deduplicación y referencias cruzadas OEM/Aftermarket (PROJ-02). | `es-419` | **SÍ** | VIGENTE | 2026-09-24 | Spare Parts, Normalization, Deduplication, CrossReference, Clusters |
| `docs/SPARE_PARTS_FITMENT_VERIFICATION.md` | Motor determinista de verificación de compatibilidad pieza-vehículo y resolución de conflictos (PROJ-02). | `es-419` | **SÍ** | VIGENTE | 2026-09-24 | Spare Parts, Fitment, Verification, Conflicts, Determinism |
| `docs/SPARE_PARTS_PRICE_INTELLIGENCE.md` | Motor de inteligencia de precios, cálculo de costo total (Landed Cost) y reputación de vendedores (PROJ-02). | `es-419` | **SÍ** | VIGENTE | 2026-09-24 | Spare Parts, Pricing, TotalCost, LandedCost, SellerTrust, Comparison |
| `docs/SPARE_PARTS_WEB_UX.md` | UX Web, filtros reactivos, selector vehicular y comparador lado a lado 0 innerHTML (PROJ-02). | `es-419` | **SÍ** | VIGENTE | 2026-09-24 | Spare Parts, Web UX, SideBySide, Facade, ZeroInnerHTML, REST |
| `docs/SPARE_PARTS_PLATFORM_INTEGRATION.md` | Adaptador satélite `@ai-platform/client`, telemetría SSE reactiva y capacidad de plataforma (PROJ-02). | `es-419` | **SÍ** | VIGENTE | 2026-09-25 | Spare Parts, Platform Integration, Adapter, Telemetry, SSE, ZeroInnerHTML |
| `docs/AR_3D_AI_VISION_ARCHITECTURE.md` | Arquitectura de visión computacional AR 3D, VTO, modelos neuronales y oclusión para Tentaciones. | `es-419` | **SÍ** | VIGENTE | 2026-09-24 | Tentaciones, AR 3D, Virtual Try-On, Computer Vision |
| `docs/ARCHITECTURAL_HARDENING_AUDIT.md` | Auditoría arquitectónica transversal: Runtime Multi-Agente, MCP, HITL, Gobernanza de Tools, Evidencia y Seguridad. | `es-419` | **SÍ** | VIGENTE | 2026-09-25 | Multi-Agent Runtime, MCP, HITL, Tool Governance, Evidence, Security |
| `docs/PHASE_81_DISCOVERY.md` | Documento de descubrimiento y auditoría de continuidad arquitectónica (Fase 81). | `es-419` | SÍ | VIGENTE | 2026-09-22 | Fase 81 Discovery |
| `docs/PHASE_82_DISCOVERY.md` | Documento de descubrimiento de portafolio y formalización de proyectos (Fase 82). | `es-419` | SÍ | VIGENTE | 2026-09-22 | Fase 82 Discovery |
| `docs/GLOSARIO.md` | Definiciones formales de términos técnicos y arquitectónicos del sistema. | `es-419` | SÍ | VIGENTE | 2026-09-17 | Conceptos de arquitectura de IA |

---

## 2. Política de Sincronización

1. **Unicidad:** Todo cambio en la arquitectura o en los tests debe reflejarse en los documentos canónicos correspondientes.
2. **Espejo del Libro:** Cualquier actualización al archivo `LIBRO_OFICIAL_AI_OPERATING_PLATFORM.md` en la raíz debe reflejarse de manera idéntica en `docs/LIBRO_OFICIAL_AI_OPERATING_PLATFORM.md`.
3. **Verificación Automatizada:** El comando `npm run docs:check` valida la presencia de todos los documentos obligatorios, la consistencia de versión y la resolución de enlaces internos.

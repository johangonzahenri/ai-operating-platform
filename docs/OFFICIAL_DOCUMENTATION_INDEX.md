# Índice Maestro de Documentación Oficial (Official Documentation Index)

Este índice proporciona el mapa canónico de navegación para toda la documentación técnica, arquitectónica y operativa del repositorio **AI Operating Platform** (`ai-operating-platform`).

---

## 1. Documentos Fundacionales y Gobernanza

| Documento | Ubicación | Propósito | Audiencia Principal |
| :--- | :--- | :--- | :--- |
| **Fuente de Verdad** | [SOURCE_OF_TRUTH.md](./SOURCE_OF_TRUTH.md) | Jerarquía canónica de autoridad técnica (`CÓDIGO > TESTS > GIT > DOCS > ROADMAP`), taxonomía de estados y política de idioma. | Todos los roles |
| **Plan Maestro Operativo** | [MASTER_WORK_PLAN.md](./MASTER_WORK_PLAN.md) | Sistema oficial de planificación, indexación jerárquica `X.Y.Z`, checklists y trazabilidad dinámica de tareas. | Todos los roles, Agentes IA |
| **Protocolo de Agentes** | [AGENT_OPERATING_PROTOCOL.md](./AGENT_OPERATING_PROTOCOL.md) | Guía canónica de comportamiento operativo, jerarquía de verdad y reglas para agentes de IA y desarrolladores. | Agentes IA, Desarrolladores |
| **Nomenclatura Oficial** | [PROJECT_NOMENCLATURE.md](./PROJECT_NOMENCLATURE.md) | Nomenclatura canónica, glosario de términos técnicos y mapa conceptual del ecosistema con aplicaciones satélites. | Arquitectos, Desarrolladores |
| **Mapa del Repositorio** | [REPOSITORY_MAP.md](./REPOSITORY_MAP.md) | Mapa físico del sistema de archivos, estructura de directorios y desglose por capas en `src/`. | Desarrolladores, Nuevos Integrantes |
| **Libro Oficial** | [LIBRO_OFICIAL_AI_OPERATING_PLATFORM.md](./LIBRO_OFICIAL_AI_OPERATING_PLATFORM.md) | Tratado maestro integral del diseño, evolución histórica, matrices de verdad y certificación de la plataforma. | Auditores, Liderazgo Técnico |
| **Línea Base del Producto** | [PLATFORM_PRODUCT_BASELINE_V1_4.md](./PLATFORM_PRODUCT_BASELINE_V1_4.md) | Especificación integral y estado del arte de la plataforma en v1.4.0 (qué es, qué no es, capacidades y roadmap). | Todos los roles |
| **Índice de Documentación** | [OFFICIAL_DOCUMENTATION_INDEX.md](./OFFICIAL_DOCUMENTATION_INDEX.md) | Este índice de referencia y navegación rápida. | Todos los roles |

---

## 2. Arquitectura de Infraestructura, Persistencia y Pruebas

| Documento | Ubicación | Propósito |
| :--- | :--- | :--- |
| **Arquitectura de Persistencia** | [PERSISTENCE_ARCHITECTURE.md](./PERSISTENCE_ARCHITECTURE.md) | Persistencia duradera en SQLite con `node:sqlite`, modo WAL, esquema relacional v3, OCC, inmutabilidad y `RestartRecoveryService`. |
| **Arquitectura de Pruebas** | [TEST_ARCHITECTURE.md](./TEST_ARCHITECTURE.md) | Desglose y categorización de las 74 suites de prueba y los 1600 tests automatizados del repositorio. |
| **Catálogo de Scripts** | [SCRIPTS_CATALOG.md](./SCRIPTS_CATALOG.md) | Inventario y guía de ejecución para todos los scripts operacionales, validadores de documentación y comandos npm. |
| **Registro de Decisiones (ADR)** | [DECISIONS.md](./DECISIONS.md) & [decisions/](./decisions/) | Catálogo de las 61 Decisiones Arquitectónicas Registradas (ADR 0001 a ADR 0061). |
| **Registro de Arquitectura** | [ARCHITECTURE_REGISTRY.md](./ARCHITECTURE_REGISTRY.md) | Inventario formal de subsistemas, módulos y componentes de la plataforma. |
| **Topología de Red** | [PRODUCTION_NETWORK_TOPOLOGY.md](./PRODUCTION_NETWORK_TOPOLOGY.md) | Topología de red, puertos de escucha, proxies inversos y zonas de seguridad. |

---

## 3. Seguridad, Políticas y Gobernanza

| Documento | Ubicación | Propósito |
| :--- | :--- | :--- |
| **Arquitectura de Seguridad** | [SECURITY_ARCHITECTURE.md](./SECURITY_ARCHITECTURE.md) | Modelo de contención de agentes, autenticación JWT, redacción de datos sensibles y sandbox de ejecución. |
| **Registro de Seguridad** | [SECURITY_REGISTRY.md](./SECURITY_REGISTRY.md) | Inventario de controles de seguridad, algoritmos criptográficos y matrices de mitigación. |
| **Modelo de Amenazas** | [THREAT_MODEL.md](./THREAT_MODEL.md) | Análisis STRIDE de vectores de ataque en ejecución autónoma y llamadas a herramientas. |
| **Controles de Seguridad** | [SECURITY_CONTROLS.md](./SECURITY_CONTROLS.md) | Lista de verificación de controles operacionales implementados. |

---

## 4. Interfaces de Plataforma y Aplicaciones Satélites

| Documento | Ubicación | Propósito |
| :--- | :--- | :--- |
| **Plataforma para Desarrolladores** | [DEVELOPER_PLATFORM.md](./DEVELOPER_PLATFORM.md) | Especificación de Developer Platform, CLI, contratos de SDK y ApplicationFactory. |
| **CLI de Application Factory** | [APPLICATION_FACTORY_CLI.md](./APPLICATION_FACTORY_CLI.md) | Manual de comandos para la herramienta de andamiaje y verificación `create-aop-app`. |
| **Guía del Contrato OpenAPI 3.1** | [OPENAPI_GUIDE.md](./OPENAPI_GUIDE.md) | Guía técnica y formalización del contrato OpenAPI 3.1 para la Platform REST API. |
| **Streaming de Eventos (SSE)** | [SSE_EVENT_STREAMING.md](./SSE_EVENT_STREAMING.md) | Especificación y guía de streaming de eventos en tiempo real mediante Server-Sent Events. |
| **Guía del SDK de Cliente** | [SDK_GUIDE.md](./SDK_GUIDE.md) | Manual de uso y referencia rápida del cliente `@ai-platform/client` en TypeScript. |
| **Guía de Integración Satélite** | [APPLICATION_INTEGRATION_GUIDE.md](./APPLICATION_INTEGRATION_GUIDE.md) | Contrato canónico de integración para conectar aplicaciones de negocio satélites. |
| **Aplicación de Referencia** | [REFERENCE_APPLICATION.md](./REFERENCE_APPLICATION.md) | Especificación y certificación de la aplicación de referencia canónica (Reference Consumer). |
| **Especificación de Platform API** | [PLATFORM_API.md](./PLATFORM_API.md) | Especificación de endpoints REST v1 (`/api/v1/*`), contratos JSON y códigos de estado. |
| **SDK Platform Client** | [PLATFORM_CLIENT.md](./PLATFORM_CLIENT.md) | Guía de uso del SDK cliente en TypeScript para conectar aplicaciones externas. |
| **Integración Tentaciones** | [TENTACIONES_PLATFORM_INTEGRATION.md](./TENTACIONES_PLATFORM_INTEGRATION.md) | Especificación de integración de la Aplicación Satélite 01 (Tentaciones AI Commerce). |
| **Charter PROJ-02 Spare Parts** | [PROJ_02_SPARE_PARTS_PRODUCT_CHARTER.md](./PROJ_02_SPARE_PARTS_PRODUCT_CHARTER.md) | Carta constitutiva y especificación del producto satélite Spare Parts Search & Comparison. |
| **Mapa de Fuentes Automotrices** | [AUTOMOTIVE_SOURCE_MAP.md](./AUTOMOTIVE_SOURCE_MAP.md) | Mapa canónico de fuentes automotrices, taxonomía, métodos de acceso y modelo de confianza. |
| **Modelo de Dominio Repuestos** | [SPARE_PARTS_DOMAIN_MODEL.md](./SPARE_PARTS_DOMAIN_MODEL.md) | Modelo de dominio canónico para repuestos, vehículos, compatibilidad y ofertas (PROJ-02). |
| **Búsqueda Multi-Fuente Repuestos** | [SPARE_PARTS_MULTI_SOURCE_SEARCH.md](./SPARE_PARTS_MULTI_SOURCE_SEARCH.md) | Especificación de búsqueda multi-fuente paralela, selección y aislamiento de fallos (PROJ-02). |
| **Normalización y Deduplicación Repuestos** | [SPARE_PARTS_NORMALIZATION_DEDUP_CROSS_REFERENCE.md](./SPARE_PARTS_NORMALIZATION_DEDUP_CROSS_REFERENCE.md) | Motor de normalización, deduplicación y referencias cruzadas OEM/Aftermarket (PROJ-02). |
| **Verificación Determinista de Fitment** | [SPARE_PARTS_FITMENT_VERIFICATION.md](./SPARE_PARTS_FITMENT_VERIFICATION.md) | Motor determinista de verificación de compatibilidad pieza-vehículo y resolución de conflictos (PROJ-02). |
| **Inteligencia de Precios y Costo Total** | [SPARE_PARTS_PRICE_INTELLIGENCE.md](./SPARE_PARTS_PRICE_INTELLIGENCE.md) | Motor de inteligencia de precios, cálculo de costo total (Landed Cost) y reputación de vendedores (PROJ-02). |
| **UX Web y Comparador Lado a Lado** | [SPARE_PARTS_WEB_UX.md](./SPARE_PARTS_WEB_UX.md) | UX Web, filtros reactivos, selector vehicular y comparador lado a lado 0 innerHTML (PROJ-02). |
| **Integración Satélite Spare Parts & SSE** | [SPARE_PARTS_PLATFORM_INTEGRATION.md](./SPARE_PARTS_PLATFORM_INTEGRATION.md) | Adaptador satélite `@ai-platform/client`, telemetría SSE reactiva y capacidad de plataforma (PROJ-02). |
| **Arquitectura AR 3D AI & VTO** | [AR_3D_AI_VISION_ARCHITECTURE.md](./AR_3D_AI_VISION_ARCHITECTURE.md) | Arquitectura de visión computacional AR 3D, Virtual Try-On, modelos neuronales y oclusión para Tentaciones. |
| **Plataforma Multi-Agente & Web AI** | [MULTI_AGENT_PLATFORM.md](./MULTI_AGENT_PLATFORM.md) | Arquitectura multi-agente, taxonomía, tool proficiency, Web AI, evaluación y proveedores externos. |
| **Casos de Uso de Automatización** | [BUSINESS_AGENT_USE_CASES.md](./BUSINESS_AGENT_USE_CASES.md) | Catálogo canónico de casos de uso de automatización empresarial en 13 áreas operacionales. |
| **Registro de Aplicaciones** | [APPLICATION_REGISTRY.md](./APPLICATION_REGISTRY.md) | Catálogo oficial de aplicaciones satélites del ecosistema (01 a 05). |
| **Registro de Dispositivos** | [DEVICE_REGISTRY.md](./DEVICE_REGISTRY.md) | Catálogo y estado de integración de hardware y dispositivos periféricos. |
| **Operaciones de Impresión** | [PRINT_OPERATIONS.md](./PRINT_OPERATIONS.md) | Documentación técnica del adaptador de impresión Brother DCP-1600 series. |

---

## 5. Roadmap, Auditoría y Deuda Técnica

| Documento | Ubicación | Propósito |
| :--- | :--- | :--- |
| **Roadmap Maestro** | [ROADMAP_MASTER.md](./ROADMAP_MASTER.md) | Roadmap canónico estructurado por versiones (v0.1 a v1.4+), épicas y tareas verificadas. |
| **Resumen del Roadmap** | [ROADMAP.md](../ROADMAP.md) | Vista ejecutiva del estado de las fases del proyecto. |
| **Criterios de Salida v1.0** | [V1_EXIT_CRITERIA.md](./V1_EXIT_CRITERIA.md) | Criterios de verificación y certificación de producción para el release v1.0. |
| **Preparación para Release** | [V1_RELEASE_READINESS.md](./V1_RELEASE_READINESS.md) | Matriz de comprobación de calidad, estabilidad y empaquetado para despliegue. |
| **Auditoría de Hardening Arquitectónico** | [ARCHITECTURAL_HARDENING_AUDIT.md](./ARCHITECTURAL_HARDENING_AUDIT.md) | Auditoría transversal: Multi-Agent Runtime, MCP, HITL, Gobernanza de Tools, Evidencia y Seguridad. |
| **Registro de Deuda Técnica** | [TECHNICAL_DEBT.md](./TECHNICAL_DEBT.md) | Inventario formal de mejoras arquitectónicas, refactorizaciones y deudas técnicas gestionadas. |
| **Trazabilidad de Prompts** | [PROMPT_TRACEABILITY.md](./PROMPT_TRACEABILITY.md) | Registro histórico de trazabilidad de fases y prompts de desarrollo. |

---

## 6. Guías de Navegación por Perfil de Usuario

### Para Desarrolladores de Plataforma Core:
1. Leer [SOURCE_OF_TRUTH.md](./SOURCE_OF_TRUTH.md) y [PROJECT_NOMENCLATURE.md](./PROJECT_NOMENCLATURE.md).
2. Estudiar [REPOSITORY_MAP.md](./REPOSITORY_MAP.md) y [PERSISTENCE_ARCHITECTURE.md](./PERSISTENCE_ARCHITECTURE.md).
3. Consultar [TEST_ARCHITECTURE.md](./TEST_ARCHITECTURE.md) y ejecutar `npm test` antes de cualquier cambio.

### Para Desarrolladores de Aplicaciones Satélites (e.g. Tentaciones):
1. Leer la sección de Aplicaciones Satélites en [PROJECT_NOMENCLATURE.md](./PROJECT_NOMENCLATURE.md).
2. Consultar [PLATFORM_CLIENT.md](./PLATFORM_CLIENT.md) y [TENTACIONES_PLATFORM_INTEGRATION.md](./TENTACIONES_PLATFORM_INTEGRATION.md).
3. Utilizar el SDK oficial de integración en `src/platform-client/`.

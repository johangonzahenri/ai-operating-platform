# Registro Central de Decisiones Arquitectónicas (ADR Master Index)

Este documento consolida el índice oficial de los Registros de Decisiones Arquitectónicas (Architectural Decision Records - ADR) de la **AI Operating Platform**, vinculando cada decisión histórica con su archivo de especificación en `docs/decisions/` y su impacto en el diseño.

---

## 1. Decisiones Consolidadas de la Auditoría Canónica (Prompt 100)

| Decisión | Título | Estado | Fecha | Justificación y Regla de Oro |
| :--- | :--- | :--- | :--- | :--- |
| **ADR-100-01** | Jerarquía Canónica de Fuente de Verdad | APROBADA | 2026-09-17 | $\text{Código} > \text{Tests} > \text{Git} > \text{Documentación} > \text{Roadmap} > \text{Excel}$. Ningún documento puede declarar capacidades no respaldadas por código y tests. |
| **ADR-100-02** | Fuente Única de Versión de Runtime | APROBADA | 2026-09-17 | `src/platform/version.ts` (`PLATFORM_VERSION`) es la autoridad canónica de versión, sincronizada con `package.json`, README y Control Plane. |
| **ADR-100-03** | Política de Idioma Documental (`es-419`) | APROBADA | 2026-09-17 | Documentación oficial en Español Latinoamericano (`es-419`); Interfaz Web bilingüe (`es-419` / `en`); Identificadores técnicos, APIs y commits en inglés sin traducir. |
| **ADR-100-04** | Rol del Excel como Herramienta Derivada | APROBADA | 2026-09-17 | `AI_Operating_Platform_Roadmap.xlsx` es una vista de seguimiento generada. No constituye una base de datos independiente ni fuente primaria. |
| **ADR-100-05** | Relación Canónica de Rutas de API | APROBADA | 2026-09-17 | `/api/v1/*` es el prefijo canónico de producción; `/api/platform/v1/*` se mantiene como alias de compatibilidad en transición. |

---

## 2. Índice Maestro de ADRs Históricos (docs/decisions/)

### Serie Numérica Formal (ADR 0001 – ADR 0022)

| ADR | Título | Archivo | Estado | Contexto / Impacto |
| :--- | :--- | :--- | :--- | :--- |
| **ADR 0001** | TypeScript & Node.js Foundation | `0001-typescript-node-foundation.md` | APROBADO | Elección de TypeScript puro sobre Node.js nativo con cero dependencias en tiempo de ejecución. |
| **ADR 0002** | Domain Events & Observability | `0002-domain-events-and-observability.md` | APROBADO | Bus de eventos inmutables tipados correlacionados por `traceId`. |
| **ADR 0003** | Manual Composition Root | `0003-manual-composition.md` | APROBADO | Inyección de dependencias manual y explícita en `composition.ts` sin frameworks de DI reflectivos. |
| **ADR 0004** | Core Runtime Execution Model | `0004-core-runtime-execution-model.md` | APROBADO | `CoreRuntime` como propietario único del ciclo de vida y despacho de tareas. |
| **ADR 0005** | Tools as Explicit Capabilities | `0005-tools-as-explicit-capabilities.md` | APROBADO | Modelado de herramientas como capacidades gobernadas con validación de esquemas JSON. |
| **ADR 0006** | Engine / Platform / Application Boundary | `0006-engine-platform-application-boundary.md` | APROBADO | Separación estricta de responsabilidades: Core Engine ≠ Platform Product ≠ Application. |
| **ADR 0007** | Sequential Orchestration | `0007-sequential-orchestration.md` | APROBADO | Orquestador declarativo determinista con política de detención ante primer fallo. |
| **ADR 0008** | Context & Memory Boundaries | `0008-context-and-memory-boundaries.md` | APROBADO | Particionamiento estricto de memoria por ámbitos `TASK`, `AGENT` y `SESSION`. |
| **ADR 0009** | Observability & Governance Boundaries | `0009-observability-and-governance-boundaries.md` | APROBADO | Gobernanza fail-closed obligatoria antes de cualquier ejecución de modelo o herramienta. |
| **ADR 0010** | Platform API & Web UI Boundary | `0010-platform-api-and-web-ui.md` | APROBADO | Desacoplamiento de la consola web como cliente puro de la API REST nativa. |
| **ADR 0011** | First-Class Agent Architecture | `0011-agent-architecture.md` | APROBADO | El Agente es un agregado declarativo de capacidades que no reemplaza a la Ejecución. |
| **ADR 0012** | Autonomous Operations Foundation | `0012-autonomous-operations.md` | APROBADO | Modelo inicial para ciclos iterativos supervisados de operaciones autónomas. |
| **ADR 0013** | Bounded Autonomous Operations & Budget | `0013-bounded-autonomous-operations.md` | APROBADO | `AutonomyBudget` inmutable que fija topes estrictos de pasos, costo USD y tiempo. |
| **ADR 0014** | Autonomous Operations API Integration | `0014-autonomous-operations-api-integration.md` | APROBADO | Endpoints REST `/api/v1/operations` y renderizado seguro en el Control Plane web. |
| **ADR 0015** | Durable Persistence Architecture | `0015-durable-persistence-architecture.md` | APROBADO | Adopción de `node:sqlite` nativo en modo WAL para persistencia relacional duradera. |
| **ADR 0016** | Formal Domain Rehydration Boundary | `0016-formal-domain-rehydration-boundary.md` | APROBADO | Métodos estáticos de rehidratación en agregados eliminando el uso de `Reflect.construct`. |
| **ADR 0017** | Core Execution Rehydration Boundary | `0017-core-execution-domain-rehydration-boundary.md` | APROBADO | Rehidratación formal para `Task`, `Execution` y `TaskError` con validación de invariantes. |
| **ADR 0018** | Agent Domain Rehydration Boundary | `0018-agent-domain-rehydration-boundary.md` | APROBADO | Rehidratación formal para `Agent` con listas blancas inmutables y control de versiones OCC. |
| **ADR 0019** | Durable SQLite Repositories | `0019-durable-sqlite-adapters-for-task-execution-agent.md` | APROBADO | Implementación de repositorios SQLite para tareas, ejecuciones y agentes. |
| **ADR 0020** | Crash Recovery & Reconciliation | `0020-crash-recovery-and-restart-reconciliation.md` | APROBADO | `RestartRecoveryService` para transición atómica de operaciones interrumpidas tras caídas. |
| **ADR 0021** | Durable Events & Audit Infrastructure | `0021-durable-events-and-audit-infrastructure.md` | APROBADO | `SqliteEventStore` como almacén append-only inmutable de eventos de dominio. |
| **ADR 0022** | Observability Audit Query & Diagnostics | `0022-observability-audit-query-and-runtime-diagnostics.md` | APROBADO | Proyecciones CQRS forenses para reconstrucción de líneas de tiempo por `traceId`. |
| **ADR 0023** | Google Gemini Model Gateway Adapter | `0023-google-gemini-model-gateway.md` | APROBADO | Adaptador nativo para modelos Google Gemini / Vertex AI con streaming y JSON estructurado. |
| **ADR 0024** | SQLite Durable Memory Gateway | `0024-sqlite-durable-memory-gateway.md` | APROBADO | Persistencia relacional duradera para retención contextual de memoria por agente y sesión. |
| **ADR 0025** | Asymmetric JWT & Key Rotation | `0025-asymmetric-jwt-and-key-rotation.md` | APROBADO | Verificación criptográfica RS256/ES256 con soporte para rotación dinámica de claves OIDC. |
| **ADR 0026** | Production Reverse Proxy & TLS | `0026-production-reverse-proxy-and-tls.md` | APROBADO | Manifiestos de Nginx y Caddy con terminación TLS, HSTS, CSP y rate limiting perimetral. |
| **ADR 0027** | Virtual Organization Foundation | `0027-virtual-organization-foundation.md` | APROBADO | Jerarquía organizativa multinivel (Organización, Áreas, Equipos) y membresía gobernada de agentes con roles. |
| **ADR 0028** | Team Resource Budget Governance | `0028-team-resource-budget-governance.md` | APROBADO | Cuotas operacionales, límites de consumo por equipo y transacciones atómicas con prevención de carreras. |
| **ADR 0029** | Reactive Operational Streaming (SSE) | `0029-reactive-operational-streaming-sse.md` | APROBADO | Streaming unidireccional reactivo vía Server-Sent Events, replay desde Last-Event-ID y fallback a sondeo. |
| **ADR 0030** | Organizational Coordination Foundation | `0030-organizational-coordination-foundation.md` | APROBADO | Coordinación organizacional entre agentes, validación de ciclos, límites de profundidad, PolicyGateway y budgets. |
| **ADR 0031** | Agent Role, Responsibility & Capability Governance | `0031-agent-role-responsibility-capability-governance.md` | APROBADO | Gobernanza formal de roles, responsabilidades y capacidades verificadas de agentes con descubrimiento multigriterio. |
| **ADR 0032** | Workflow Orchestration & Governed Task Assignment | `0032-workflow-orchestration-governed-task-assignment.md` | APROBADO | Orquestación de flujos de trabajo como DAG, asignación gobernada de tareas a agentes mediante PolicyGateway y cuotas de equipo. |
| **ADR 0033** | Workflow Verification & Result Validation | `0033-workflow-verification-and-result-validation.md` | APROBADO | Capa de verificación determinista que desacopla el estado de ejecución técnica del veredicto de validez de resultados con segregación de funciones. |
| **ADR 0034** | Human Oversight, Approval & Escalation Governance | `0034-human-oversight-approval-and-escalation-governance.md` | APROBADO | Capa gobernada de supervisión humana, aprobación y escalamiento para pausar, autorizar y reanudar flujos de trabajo sin bypass de seguridad. |
| **ADR 0035** | Agent Lifecycle, Evaluation & Governance | `0035-agent-lifecycle-evaluation-and-governance.md` | APROBADO | Gobernanza formal del ciclo de vida de agentes, evaluación determinista, calificación por versión de perfil y elegibilidad de ejecución con segregación de funciones. |
| **ADR 0036** | AI Solutions Factory & Application Blueprint Governance | `0036-ai-solutions-factory-and-blueprint-governance.md` | APROBADO | Gobernanza formal de la fábrica de soluciones de IA, planos arquitectónicos declarativos inmutables, puerta de publicación determinista y ciclo de vida. |
| **ADR 0037** | AI Enterprise Operating System & Executive Governance Foundation | `0037-ai-enterprise-operating-system-and-executive-governance.md` | APROBADO | Capa de sistema operativo empresarial y gobernanza ejecutiva acoplando estrategia, objetivos, iniciativas, soluciones, KPIs y registros de decisiones ejecutivas con supervisión humana estricta. |
| **ADR 0038** | Executive Orchestrator & Closed-Loop Business Operations | `0038-executive-orchestrator-and-closed-loop-business-operations.md` | APROBADO | Orquestador ejecutivo y operaciones empresariales de bucle cerrado con captura de instantáneas inmutables, síntesis y validación determinista de planes, evaluación de gobernanza, re-planificación acotada y convergencia de KPIs. |
| **ADR 0039** | Autonomous Operations Runtime & Continuous Business Governance | `0039-autonomous-operations-runtime-and-continuous-business-governance.md` | APROBADO | Daemon de operaciones autónomas continuas 24/7 con disparadores temporizados/por eventos, exclusión mutua mediante leases distribuidos, disyuntor de seguridad (circuit breaker) y gobierno continuo. |
| **ADR 0040** | Enterprise API Authentication, Authorization & Credential Governance | `0040-enterprise-api-authentication-and-credential-governance.md` | APROBADO | Autenticación de API enterprise, almacenamiento de cero texto plano de llaves con SHA-256 y comparación timing-safe, reconciliación fail-closed de inquilino/aplicación, alcances de capacidad granulares y rotación con período de gracia. |
| **ADR 0041** | Enterprise Network Topology, Controlled Transport Binding & Secure API Exposure | `0041-enterprise-network-topology-and-secure-api-exposure.md` | APROBADO | Topología de red empresarial, bind seguro 127.0.0.1 por defecto, rechazo de 0.0.0.0 sin opt-in en prod, modelo de confianza de reverse proxy, CORS dinámico estricto, cabeceras de seguridad y aislamiento de periféricos. |
| **ADR 0042** | V1 Exit Certification & Production Readiness Governance | `0042-v1-exit-certification-and-production-readiness-governance.md` | APROBADO | Marco de certificación objetiva de salida a producción, jerarquía inmutable de fuente de verdad, clasificación CERTIFIED WITH OPEN GAPS para v1.3.0 y gobernanza de release. |
| **ADR 0043** | Production Identity, OIDC / JWKS Key Rotation & External Security Foundation | `0043-production-identity-and-external-security-foundation.md` | APROBADO | Verificación OIDC/JWT con recuperación dinámica de JWKS, caché con TTL, rotación de claves asimétricas (RS256/ES256), validación determinista de configuración en producción y pipeline Zero-Trust. |
| **ADR 0044** | Multi-Enterprise Governance, Holding Operating Model & Cross-Enterprise Mandates | `0044-multi-enterprise-governance-and-portfolio-operating-model.md` | APROBADO | Gobernanza jerárquica de portafolio/holding, axioma Cross-Enterprise Default Deny, mandatos de autoridad delegada explícita, agregación determinista de KPIs (0 LLM) y control de concurrencia optimista (OCC). |
| **ADR 0045** | Multi-Enterprise Operational Runtime & Governed Execution | `0045-multi-enterprise-operational-runtime-and-governed-execution.md` | APROBADO | Conexión del modelo de gobernanza de portafolio con el runtime operacional, Segregación de Funciones (SoD), validación fail-closed de mandatos y agregación de métricas. |
| **ADR 0046a** | Budget and Cost Separation | `0046-budget-cost-separation.md` | APROBADO | Separación arquitectónica entre gobernanza de límites de consumo duro (Budget) y contabilidad financiera de costos (Cost Accounting). |
| **ADR 0046** | Governed Mandate Reconciliation & Runtime Consistency | `0046-governed-mandate-reconciliation-and-runtime-consistency.md` | APROBADO | Reconciliación determinista de mandatos ante expiración, revocación, cancelación o reducción de alcance, preservando inmutabilidad histórica (0 mutación retroactiva). |
| **ADR 0047** | Authorization Trace & Persistent RBAC | `0047-authorization-trace-and-persistent-rbac.md` | APROBADO | Trazas formales de autorización RBAC persistentes con auditoría y mitigación de fuga de secretos. |
| **ADR 0048** | Abort Signal Propagation | `0048-abort-signal-propagation.md` | APROBADO | Propagación determinista de señales de cancelación a través del pipeline de ejecución y herramientas. |
| **ADR 0049** | OpenAPI Formal Specification | `0049-openapi-formal-spec.md` | APROBADO | Especificación formal OpenAPI / Swagger para todos los contratos de endpoints de la plataforma. |
| **ADR 0050** | Governance & Compliance Evidence Export | `0050-governance-and-compliance-evidence-export.md` | APROBADO | Exportación de paquetes de evidencia gobernados para auditoría y compliance, sellados criptográficamente con SHA-256 en 9 alcances, con redacción de secretos y cero mutación de estado. |
| **ADR 0051** | Official MCP TypeScript SDK v2 Integration | `0051-official-enterprise-mcp-server-adapter.md` | APROBADO | Integración del SDK oficial `@modelcontextprotocol/server` (v2.1.0) en la capa perimetral de plataforma (src/platform/mcp/) con cero dependencias en Core/Domain y soporte dual 2026-07-28 / 2024-11-05. |


---

### Serie de Arquitectura y Gobernanza (ADR-001 – ADR-010)

| ADR | Título | Archivo | Estado | Contexto / Impacto |
| :--- | :--- | :--- | :--- | :--- |
| **ADR-001** | Core Platform Separation | `ADR-001-core-platform-separation.md` | APROBADO | Aislamiento físico de paquetes entre motor central y productos de plataforma. |
| **ADR-002** | Hexagonal Architecture | `ADR-002-hexagonal-architecture.md` | APROBADO | Modelo de puertos y adaptadores con dirección de dependencias centrípeta. |
| **ADR-003** | Security Context Model | `ADR-003-security-context.md` | APROBADO | Propagación obligatoria de `SecurityContext` inmutable con tenant y principal. |
| **ADR-004** | Default-Deny Security Model | `ADR-004-default-deny.md` | APROBADO | Denegación por defecto en evaluación de políticas de modelos y herramientas. |
| **ADR-005** | Durable Events | `ADR-005-durable-events.md` | APROBADO | Estructura inmutable de eventos de dominio para auditoría de cumplimiento. |
| **ADR-006** | Platform API Specification | `ADR-006-platform-api.md` | APROBADO | Contrato REST estándar para consumo de capacidades de la plataforma. |
| **ADR-007** | External Application Boundary | `ADR-007-external-application-boundary.md` | APROBADO | Las aplicaciones satélites no invaden el dominio del motor central. |
| **ADR-008** | Tentaciones Integration | `ADR-008-tentaciones-integration.md` | APROBADO | Patrón de integración y fallback para el comercio electrónico Tentaciones. |
| **ADR-009** | AR Governance | `ADR-009-ar-governance.md` | APROBADO | Validación determinista de esquemas biométricos y URNs para realidad aumentada. |
| **ADR-010** | Platform Truth Model | `ADR-010-platform-truth-model.md` | APROBADO | Modelo de correspondencia entre capacidades declaradas y pruebas verificadas. |

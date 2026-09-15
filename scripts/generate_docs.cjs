const fs = require('fs');
const path = require('path');

// 1. ADRs
const adrs = {
  'ADR-001-core-platform-separation.md': `# ADR-001: Core Platform Separation

## Status
Accepted

## Context
The system consists of core multi-agent execution, a public platform API/web product, and external consumer applications. Without strict separation, domain models risk becoming tightly coupled with transport formats or application-specific requirements.

## Decision
Enforce the fundamental invariant:
CORE ENGINE != PLATFORM PRODUCT != APPLICATIONS
- Core Engine owns task lifecycle, planning, model routing, and security policies.
- Platform API/Product owns HTTP serialization, routing, and console surfaces.
- External Applications (such as Tentaciones AI Commerce) consume only via the authenticated Platform API/Client.

## Alternatives Considered
- Monolithic layered architecture: rejected due to high risk of cross-layer domain contamination.
- Microservices deployment: rejected for local execution simplicity and test velocity.

## Consequences
- Clean hexagonal isolation and testability.
- Strict compile-time and runtime validation preventing domain imports by external consumers.
`,

  'ADR-002-hexagonal-architecture.md': `# ADR-002: Hexagonal Architecture (Ports and Adapters)

## Status
Accepted

## Context
The Core Engine must remain agnostic to concrete model providers (Ollama, OpenAI, Anthropic), storage systems (SQLite, In-Memory), and user interfaces.

## Decision
Adopt Hexagonal Architecture across all subsystems:
- Domain defines ports (interfaces) for models, tools, tasks, events, and applications.
- Infrastructure provides concrete adapters adhering strictly to domain contracts.
- Composition root wires dependencies explicitly without global singletons.

## Alternatives Considered
- Direct concrete dependency injection throughout domain: rejected for violation of purity.

## Consequences
- Pluggable infrastructure enables effortless stubbing in unit tests.
- High resilience and modular evolution.
`,

  'ADR-003-security-context.md': `# ADR-003: SecurityContext and Trusted Principal Identification

## Status
Accepted

## Context
Multi-tenant and multi-role operations require trusted principal identification without caller tampering or permission escalation.

## Decision
Implement an immutable SecurityContext containing a verified Principal (USER, SERVICE, SYSTEM, ANONYMOUS), roles, tenant binding, and correlation identifiers. All security boundary checks evaluate against this context fail-closed.

## Alternatives Considered
- Passing raw HTTP headers directly to domain handlers: rejected as insecure and unverified.

## Consequences
- Prevents cross-tenant leaks and privilege escalation.
- Full traceability of caller identities in audit logs.
`,

  'ADR-004-default-deny.md': `# ADR-004: Default-Deny Authorization and Application Capability Scoping

## Status
Accepted

## Context
External applications and callers must only access explicitly permitted capabilities and tools.

## Decision
Enforce default-deny across the platform:
- Applications must be registered with an explicit list of allowedCapabilities.
- Unregistered operations or unauthenticated requests fail immediately with 401 Unauthorized or 403 Forbidden.
- Tool invocations require explicit RBAC permissions and approval gates for critical risk levels.

## Alternatives Considered
- Permissive default with blacklist: rejected due to security risk of omission.

## Consequences
- Predictable and auditable security perimeter.
- Fail-closed behavior on all unrecognized actions.
`,

  'ADR-005-durable-events.md': `# ADR-005: Durable Append-Only Event Store with SQLite WAL

## Status
Accepted

## Context
Agent reasoning, planning decisions, tool executions, and state transitions must be persistently auditable and resilient across process restarts.

## Decision
Implement an append-only SqliteEventStore backed by SQLite WAL mode with monotonic sequence numbers, aggregate correlation, and deterministic trace IDs.

## Alternatives Considered
- In-memory event bus only: rejected because crash recovery and historical audits are impossible.
- Distributed event streaming (Kafka/RabbitMQ): rejected for local runtime footprint.

## Consequences
- Complete, immutable audit log of all system decisions.
- High performance concurrent writes under SQLite WAL.
`,

  'ADR-006-platform-api.md': `# ADR-006: Unified Platform API v1 & SDK Client

## Status
Accepted

## Context
The Web Console and external applications need a standardized, versioned HTTP surface with SDK client support.

## Decision
Expose canonical /api/v1/* endpoints (with /api/platform/v1/* compatibility routes) powered by PlatformService and consumed via the typed @ai-platform/client (PlatformClient).

## Alternatives Considered
- Ad-hoc RPC endpoints: rejected for lack of standardization.
- GraphQL: rejected to maintain lightweight REST contract.

## Consequences
- Clean client-server separation.
- Uniform error schemas (code, message, status).
`,

  'ADR-007-external-application-boundary.md': `# ADR-007: External Application Boundary and Identity Model

## Status
Accepted

## Context
External consumer applications must be modeled as first-class entities in the platform registry without importing internal domain classes.

## Decision
Define ExternalApplication domain entity and ApplicationRegistryPort managing metadata, implementation status, runtime status, authentication mode, and capability scopes.

## Alternatives Considered
- Hardcoded application lists in router: rejected for lack of dynamic governance.

## Consequences
- Clean application governance and self-describing platform catalog.
- Extensible to future consumers (e.g. Vehicle Diagnostics, Support Desk).
`,

  'ADR-008-tentaciones-integration.md': `# ADR-008: Tentaciones AI Commerce Live Integration Architecture

## Status
Accepted

## Context
Tentaciones AI Commerce is the primary reference implementation demonstrating external AI capabilities (catalog discovery, recommendation, comparison, cart assistance).

## Decision
Integrate Tentaciones via TentacionesPlatformAdapter using authenticated API keys and capability-scoped requests. Tentaciones owns its catalog and cart; Platform owns AI orchestration and intent evaluation.

## Alternatives Considered
- Embedding e-commerce catalog directly into Core Engine: rejected as fundamental violation of separation.

## Consequences
- Zero inventory or price hallucination.
- Graceful degradation to traditional commerce when platform is offline.
`,

  'ADR-009-ar-governance.md': `# ADR-009: AR / 3D Virtual Fitting Room Governance and Sizing Engine

## Status
Accepted

## Context
Virtual fitting room features require governed 3D asset identifiers, avatar body calibrations, and deterministic sizing rules without crashing if 3D assets are missing.

## Decision
Govern AR assets with URN format urn:tentaciones:ar:<category>:<productSlug>, strict SemVer (v1.0.0), avatar profiles (Nova, Sora, Mateo), and deterministic size rules. Malformed or missing assets degrade safely to STANDARD_2D_VIEW.

## Alternatives Considered
- Storing raw unvalidated 3D file URLs in LLM prompts: rejected for hallucination and reliability risks.

## Consequences
- Resilient fitting room experience.
- Reliable size advice backed by deterministic measurement charts.
`,

  'ADR-010-platform-truth-model.md': `# ADR-010: Platform Truth Model and Source of Truth (SOT) Governance

## Status
Accepted

## Context
Web consoles and documentation frequently misrepresent simulated or planned features as live infrastructure, harming technical credibility.

## Decision
Enforce a strict Truth Model across all console badges, APIs, and docs:
- Explicit statuses: IMPLEMENTED, PARTIAL, DESIGNED, PLANNED.
- Explicit runtime states: HEALTHY, OPERATIONAL, AVAILABLE, NOT_CONNECTED, OFFLINE, DEGRADED.
- Clear Source of Truth badges (Platform API, Core Engine, Architecture Specification, External Integration).

## Alternatives Considered
- Binary active/inactive statuses: rejected as misleading.

## Consequences
- Uncompromised technical credibility and complete audit transparency.
`
};

const adrDir = path.join('docs', 'decisions');
fs.mkdirSync(adrDir, { recursive: true });
for (const [filename, content] of Object.entries(adrs)) {
  fs.writeFileSync(path.join(adrDir, filename), content.trim() + '\n', 'utf8');
}
console.log('ADR files written.');

// 2. docs/MANUAL_OFICIAL.md
const manualContent = `# MANUAL OFICIAL DE LA AI OPERATING PLATFORM

## 1. Executive Overview
La **AI Operating Platform** es una plataforma de orquestación de inteligencia artificial multi-agente, desacoplada, gobernada y orientada a la producción. Proporciona las capacidades centrales de planificación, enrutamiento neutral de modelos LLM, ejecución segura de herramientas, persistencia duradera en SQLite WAL, trazabilidad inmutable y una API tipada para aplicaciones consumidoras externas.

## 2. Project Vision
Construir una infraestructura de software de IA rigurosa donde la inteligencia de los modelos esté subordinada a políticas de seguridad, presupuestos deterministas y límites arquitectónicos estrictos.

## 3. Architecture Principles
- **Separación Fundamental:** \`CORE ENGINE != PLATFORM PRODUCT != APPLICATIONS\`.
- **Arquitectura Hexagonal:** Dominio puro con puertos e interfaces; infraestructura basada en adaptadores enchufables.
- **Default-Deny:** Toda invocación de agente o herramienta denegada por defecto hasta autorización explícita por política.
- **Cero Alucinación de Catálogo:** Los modelos LLM extraen intenciones pero nunca inventan precios, stock o identificadores reales.
- **Trazabilidad Inmutable:** Cada decisión, paso y error queda correlacionado con un \`traceId\` único en el Event Store duradero.

## 4. Global Architecture
\`\`\`mermaid
graph TD
    Client[External Consumer / Tentaciones] -->|HTTP REST + API Key| API[Platform API /api/v1]
    API --> Service[PlatformService]
    Service --> Runtime[Core Engine / Agent Runtime]
    Runtime --> Planner[LLM Planner]
    Runtime --> Gateway[Model Gateway / Routing]
    Runtime --> Tools[Tool Registry & Dispatcher]
    Runtime --> Policy[Policy Gateway / Default Deny]
    Runtime --> Store[(Sqlite Event Store & Tasks)]
\`\`\`

## 5. Core Engine
El motor central (\`src/application/runtime/core-runtime.ts\`) coordina el ciclo de vida de tareas (\`CREATED\` -> \`RUNNING\` -> \`COMPLETED\` / \`FAILED\`), evaluando pre-condiciones, presupuestos y límites operativos sin acoplarse a frameworks web.

## 6. Orchestrator
El orquestador coordina DAGs multi-paso deterministas o basados en agentes, garantizando la terminación acotada y la propagación del contexto de ejecución.

## 7. Planner
El \`LLMPlanner\` descompone objetivos de alto nivel en planes ejecutables acotados (\`Plan\`, \`PlanStep\`), validando esquemas y transformando respuestas de modelos en intenciones estructuradas.

## 8. Agents
Entidades gobernadas con metadatos seguros (\`SafeAgentMetadata\`), capacidades declaradas y estados operativos administrados.

## 9. Model Gateway
Capa neutral de abstracción para proveedores de modelos (Stub, OpenAI, Anthropic, Ollama) que normaliza solicitudes, presupuestos de tokens y llamadas a herramientas estructuradas.

## 10. Memory
Abstracción de contexto y memoria (\`MemoryGateway\`, \`TaskContext\`) con aislamiento por tenant e higienización de secretos antes de cada interacción con el modelo.

## 11. Tool Layer
Registro tipado (\`ToolRegistry\`), validación determinista de esquemas JSON y ejecución mediante \`ToolInvocationRuntime\` con tokens de cancelación y aprobación para herramientas de riesgo crítico.

## 12. Security & Governance
- Identificación de principales (\`Principal\`: USER, SERVICE, SYSTEM, ANONYMOUS).
- Contexto de seguridad inmutable (\`SecurityContext\`).
- Evaluación de políticas fail-closed y aislamiento estricto multi-tenant (\`tenantId\`).

## 13. Observability
Emisión estructurada de eventos de auditoría y métricas con correlación unificada de \`traceId\` a través de todas las capas.

## 14. Durable Runtime
Persistencia persistente sobre SQLite en modo WAL con números de secuencia monotónicos y capacidad de recuperación ante caídas para tareas pendientes.

## 15. Platform API
Superficie REST canónica expuesta en \`/api/v1/*\` (y alias \`/api/platform/v1/*\`) consumida por el cliente tipado \`@ai-platform/client\` (\`PlatformClient\`).

## 16. Web Console
Centro de orquestación visual e inteligencia operativa construido con DOM nativo seguro (cero \`innerHTML\`, cero \`eval\`), mostrando el estado real del sistema y badges de Source of Truth.

## 17. Application Integration
Marco de integración de aplicaciones externas mediante \`ApplicationRegistryPort\`, asignación de identidades de servicio, credenciales API Key y alcance restringido de capacidades permitidas (\`allowedCapabilities\`).

## 18. Tentaciones AI Commerce
Primera aplicación externa de referencia que consume la plataforma para búsqueda semántica, recomendación y asistencia de compra en moda y calzado.

## 19. AI Commerce Intelligence
Capacidades de comercio:
- \`product.discovery\`: Extracción de términos de búsqueda sin alucinar catálogo.
- \`product.recommendation\`: Puntuación y explicabilidad de candidatos.
- \`product.compare\`: Matriz comparativa de atributos reales (precio, material, corte).
- \`cart.assistance\`: Evaluación de umbral de envío gratuito y sugerencias de accesorios.

## 20. AR / 3D Virtual Fitting
Gobernanza de activos 3D bajo URN \`urn:tentaciones:ar:<category>:<productSlug>\`, control SemVer (\`v1.0.0\`), perfiles de avatar (Nova, Sora, Mateo), motor de cálculo de tallas y degradación elegante a vista 2D estándar.

## 21. End-to-End Journey
Demostración del flujo completo: Intención del usuario -> Búsqueda -> Recomendación -> Probador Virtual AR -> Recomendación de Talla -> Comparación -> Asistencia de Carrito -> Trazabilidad completa en Event Store.

## 22. Testing & Verification
Suite automatizada con más de 830 pruebas unitarias, de integración, de límites de seguridad y de pureza arquitectónica (833 passing, 0 failures).

## 23. Truth Model
Gobernanza estricta de la verdad técnica:
- Estados de Implementación: \`IMPLEMENTED\`, \`PARTIAL\`, \`DESIGNED\`, \`PLANNED\`.
- Estados de Runtime: \`HEALTHY\`, \`OPERATIONAL\`, \`AVAILABLE\`, \`NOT_CONNECTED\`, \`OFFLINE\`, \`DEGRADED\`.
- Badges de Source of Truth: \`Platform API\`, \`Core Engine\`, \`Architecture Specification\`, \`External Integration\`.

## 24. Development Workflow
\`\`\`bash
npm run build   # Compilación TypeScript limpia
npm test        # Ejecución de la suite completa de pruebas
npm run check   # Verificación integral
npm start       # Inicio del servidor Platform API (127.0.0.1:3000)
\`\`\`

## 25. Deployment Architecture
Diseñado para ejecución local en desarrollo y pruebas, con arquitectura preparada para despliegue modular de servicios Node.js y bases de datos SQLite WAL / PostgreSQL.

## 26. Current Limitations
- **Model Gateway:** Utiliza \`StubModelGateway\` para pruebas deterministas locales; los conectores externos a APIs de terceros están diseñados.
- **Registros:** Registros de aplicaciones y API keys en memoria en modo desarrollo; tareas y eventos persistidos en SQLite duradero.
- **Catálogo Tentaciones:** Catálogo sintético de prueba para validar la integración de API sin acoplamiento a bases de datos de comercio propietarias.

## 27. Future Roadmap
- Soporte para streaming de eventos SSE en la Web Console.
- Integración de conectores en vivo a proveedores de modelos remotos (OpenAI, Anthropic).
- Conexión de aplicaciones adicionales (Vehicle Parts Diagnostics, Enterprise Support Desk).

---

## Cómo estudiar este proyecto (Ruta de Aprendizaje)

Para ingenieros y evaluadores técnicos que deseen estudiar esta plataforma, se recomienda seguir la siguiente secuencia:

1. **Architecture & Boundaries:** Leer \`docs/MANUAL_OFICIAL.md\` y los ADRs en \`docs/decisions/\`.
2. **Core Engine & Domain:** Inspeccionar \`src/domain/\` para comprender las entidades puras y puertos.
3. **Security & Policies:** Revisar \`src/domain/security/\` y las pruebas en \`tests/unit/security-context.test.ts\`.
4. **Platform API & Client:** Explorar \`src/platform/api/\` y \`src/platform-client/\`.
5. **Web Console:** Abrir \`src/platform/web/index.html\` y \`app.js\` para observar el frontend puro sin frameworks ni manipulación insegura del DOM.
6. **External Integration:** Examinar \`src/application/platform/tentaciones-platform-adapter.ts\` y \`src/application/platform/ar-fitting-room.ts\`.
7. **Golden Journey Proof:** Ejecutar y analizar \`tests/unit/e2e-tentaciones-golden-journey.test.ts\`.
`;

fs.writeFileSync(path.join('docs', 'MANUAL_OFICIAL.md'), manualContent.trim() + '\n', 'utf8');
console.log('docs/MANUAL_OFICIAL.md written.');

// 3. docs/README.md (Navigation index)
const docsIndexContent = `# AI Operating Platform — Documentation Index

Welcome to the comprehensive technical documentation for the **AI Operating Platform**.

## Documentation Categories

### 1. Architecture & Foundations
- [Official System Manual](MANUAL_OFICIAL.md)
- [System Architecture Overview](../ARCHITECTURE.md)
- [Architectural Decision Records (ADRs)](decisions/)
- [Domain Boundaries & Hexagonal Model](architecture/domain-boundaries.md)
- [Official Architecture Book (Spanish)](../LIBRO_OFICIAL_AI_OPERATING_PLATFORM.md)

### 2. Security & Governance
- [Security Architecture & Threat Model](SECURITY_ARCHITECTURE.md)
- [Authentication & Principal Model](AUTHENTICATION.md)
- [Authorization & RBAC Controls](AUTHORIZATION.md)
- [Security Control Matrix](SECURITY_CONTROL_MATRIX.md)
- [Repository Security Policy](../SECURITY.md)

### 3. Core Engine & Runtime
- [Core Runtime & Lifecycle](PLATFORM_RUNTIME.md)
- [Agent Architecture](architecture/agents.md)
- [LLM Planner](LLM_PLANNER.md)
- [Model Gateway](MODEL_GATEWAY.md)
- [Tool Registry & Governance](TOOL_REGISTRY.md)
- [Memory & Context Architecture Audit](MEMORY_CONTEXT_ARCHITECTURE_AUDIT.md)

### 4. Platform API & Product
- [Platform API v1 Specification](PLATFORM_API_V1.md)
- [Platform Client SDK](PLATFORM_CLIENT.md)
- [Web Console & Dashboard](PLATFORM_DASHBOARD.md)
- [Platform Truth Matrix & SOT Badges](PLATFORM_TRUTH_MATRIX.md)

### 5. Applications & External Integration
- [External Application Integration Guide](APPLICATION_INTEGRATION.md)
- [Tentaciones AI Commerce Live Integration](TENTACIONES_PLATFORM_INTEGRATION.md)
- [AI Commerce Intelligence Architecture](AI_COMMERCE.md)
- [AR & 3D Virtual Fitting Room Governance](AR_VIRTUAL_FITTING.md)
- [End-to-End Golden Journey Verification](END_TO_END_ARCHITECTURE.md)
- [Tentaciones Case Study](case-study-tentaciones.md)

### 6. Portfolio & Freelancer
- [Freelancer Project Portfolio Package](PORTFOLIO_FREELANCER.md)
- [Contributing Guidelines](../CONTRIBUTING.md)
- [Developer Guide](../DEVELOPMENT.md)
`;

fs.writeFileSync(path.join('docs', 'README.md'), docsIndexContent.trim() + '\n', 'utf8');
console.log('docs/README.md written.');

// 4. Root README.md
const rootReadmeContent = `# AI OPERATING PLATFORM

> **Governed multi-agent orchestration platform for real external AI applications.**
>
> *Orchestration · Agents · Model Routing · Tools · Security · Memory · Durable Execution · Observability · Platform API*

---

## Project Overview

The **AI Operating Platform** is an enterprise-inspired software system designed to govern, orchestrate, and observe multi-agent AI execution across external applications.

### Fundamental Invariant
$$\\text{CORE ENGINE} \\neq \\text{PLATFORM PRODUCT} \\neq \\text{APPLICATIONS}$$

- **Core Engine:** Owns task lifecycles, planning, model routing, tool dispatching, and security policy enforcement.
- **Platform API & Web Console:** Exposes typed contracts, REST endpoints (\`/api/v1/*\`), SDK clients, and operational inspection surfaces.
- **External Applications:** Independent consumer applications (e.g., *Tentaciones AI Commerce*) that retain complete domain ownership of catalog, pricing, and cart state, consuming the platform exclusively via authenticated APIs.

---

## Verified Project Metrics

| Metric | Verified Value | Source of Truth |
| :--- | :--- | :--- |
| **Automated Tests** | **833+ passing** | Node.js native test runner (\`npm test\`) |
| **Test Failures** | **0** | Continuous test verification |
| **Regressions** | **0** | Full test suite verification |
| **Build Status** | **PASS** | Official TypeScript compiler (\`tsc\`) |
| **Platform API Endpoints** | **18+ canonical routes** | HTTP Router (\`/api/v1/*\`, \`/api/platform/v1/*\`) |
| **Security Controls** | **Default-Deny + RBAC + Tenant Isolation** | \`SecurityContext\` & \`PolicyGateway\` |
| **Persistence Engine** | **SQLite WAL Mode** | \`SqliteEventStore\` & \`SqliteTaskRepository\` |
| **External Consumer** | **Tentaciones AI Commerce** | \`TentacionesPlatformAdapter\` |
| **AR Fitting Room Governance** | **URNs + SemVer + 3 Avatars + Size Engine** | \`ar-fitting-room.ts\` |
| **DOM Purity** | **0 \`innerHTML\` / 0 \`eval\`** | Web Console (\`src/platform/web/\`) |

---

## Key Capabilities

1. **Governed Multi-Agent Runtime:** Task decomposition, step planning, and tool execution under strict execution budgets (\`maxSteps\`, \`maxDurationMs\`, \`maxToolCalls\`).
2. **Provider-Neutral Model Routing:** Decoupled gateways supporting Stub, OpenAI, Anthropic, and Ollama providers without domain coupling.
3. **Default-Deny Tool Layer:** Strict JSON schema validation, risk classification (\`LOW\`, \`MEDIUM\`, \`HIGH\`, \`CRITICAL\`), approval gates, and cancellation tokens.
4. **Durable SQLite WAL Event Store:** Append-only sequence numbers and deterministic \`traceId\` correlation across all operations.
5. **Typed Platform API & SDK:** Versioned REST endpoints with typed SDK client (\`@ai-platform/client\`).
6. **Operational Web Console:** Live dashboard, execution inspector, system blueprint, truth badges, and enterprise showcase mode.
7. **AI Commerce & AR Virtual Fitting:** Real-world demonstration with Tentaciones AI Commerce (catalog discovery, recommendations, product comparison, cart assistance, and 3D virtual fitting room sizing).

---

## Quick Start & Reproducibility

### Prerequisites
- Node.js >= 20.0.0
- npm >= 9.0.0

### Installation & Verification
\`\`\`bash
# 1. Clone the repository
git clone https://github.com/johangonzahenri/ai-operating-platform.git
cd ai-operating-platform

# 2. Install dependencies
npm install

# 3. Compile TypeScript
npm run build

# 4. Execute all automated tests
npm test

# 5. Run full verification (build + tests)
npm run check
\`\`\`

### Starting the Platform Server
\`\`\`bash
npm start
\`\`\`
The server starts at \`http://127.0.0.1:3000\`:
- **Web Console & Showcase:** \`http://127.0.0.1:3000/\`
- **Platform Health Endpoint:** \`http://127.0.0.1:3000/api/v1/health\`
- **Applications Registry:** \`http://127.0.0.1:3000/api/v1/applications\`

---

## Platform Architecture

\`\`\`mermaid
graph TD
    subgraph External Applications
        Tentaciones[Tentaciones AI Commerce]
        Diagnostics[Vehicle Diagnostics - Planned]
        Support[Support Assistant - Planned]
    end

    subgraph Platform Layer
        API[Platform API v1 / REST]
        Console[Operational Web Console]
        ClientSDK[@ai-platform/client]
    end

    subgraph Core Engine
        Runtime[CoreRuntime & Orchestrator]
        Planner[LLM Planner]
        Gateway[Model Gateway]
        Tools[Tool Registry & Dispatcher]
        Policy[Security & Policy Gateway]
    end

    subgraph Persistence & Durability
        EventStore[(SQLite WAL Event Store)]
        TaskRepo[(SQLite Task Repository)]
    end

    Tentaciones -->|API Key + Tenant ID| API
    Console --> API
    API --> Runtime
    Runtime --> Planner
    Runtime --> Gateway
    Runtime --> Tools
    Runtime --> Policy
    Runtime --> EventStore
    Runtime --> TaskRepo
\`\`\`

---

## Truth Model & Known Limitations

The project adheres to a strict **Truth-First** policy:
- **Stub Model Gateway:** Development environment uses deterministic \`StubModelGateway\` for fast, reproducible tests without external API dependencies. Remote provider integrations are designed.
- **In-Memory Registries:** Application registry and API key repositories operate in-memory during local development; tasks and event streams are durably persisted in SQLite WAL mode.
- **Synthetic Catalog:** Tentaciones uses verified synthetic product data to validate integration contracts without coupling to proprietary e-commerce databases.

---

## Documentation

- [Official Platform Manual](docs/MANUAL_OFICIAL.md)
- [Architectural Decision Records (ADRs)](docs/decisions/)
- [Freelancer Project Portfolio Package](docs/PORTFOLIO_FREELANCER.md)
- [Tentaciones AI Commerce Case Study](docs/case-study-tentaciones.md)
- [Platform Truth Matrix](docs/PLATFORM_TRUTH_MATRIX.md)
- [Documentation Index](docs/README.md)
- [Contributing Guide](CONTRIBUTING.md)
- [Developer Guide](DEVELOPMENT.md)
- [Security Policy](SECURITY.md)

---

## License
MIT License.
`;

fs.writeFileSync('README.md', rootReadmeContent.trim() + '\n', 'utf8');
console.log('README.md written.');

// 5. CONTRIBUTING.md, DEVELOPMENT.md, SECURITY.md
const contributingContent = `# Contributing to AI Operating Platform

Thank you for your interest in contributing to the **AI Operating Platform**.

## Code of Conduct & Architectural Invariants
All contributions must strictly uphold the system's core invariants:
1. **Separation of Concerns:** \`CORE ENGINE != PLATFORM PRODUCT != APPLICATIONS\`.
2. **Hexagonal Purity:** Domain entities and ports must have zero imports from infrastructure, HTTP, express, or external application packages.
3. **Default-Deny Security:** Any new tool, capability, or endpoint must be secured by default.
4. **DOM Security:** Web Console frontend code must never use \`innerHTML\`, \`outerHTML\`, \`eval()\`, or \`document.write()\`.
5. **Truth First:** No false claims in documentation or console badges.

## Development Workflow
1. Fork and clone the repository.
2. Create a feature branch (\`git checkout -b feat/your-feature\`).
3. Ensure TypeScript builds cleanly: \`npm run build\`.
4. Run all unit and integration tests: \`npm test\`.
5. Commit using conventional commit format (\`feat:\`, \`fix:\`, \`docs:\`, \`test:\`, \`refactor:\`).
6. Submit a Pull Request with a clear description and verification evidence.
`;
fs.writeFileSync('CONTRIBUTING.md', contributingContent.trim() + '\n', 'utf8');

const developmentContent = `# Developer Guide — AI Operating Platform

## Prerequisites
- Node.js >= 20.0.0
- npm >= 9.0.0

## Repository Structure
\`\`\`text
├── src/
│   ├── domain/               # Pure domain entities, value objects, ports
│   ├── application/          # Use cases, runtime, orchestrators, adapters
│   ├── infrastructure/       # SQLite persistence, model gateways, tool registry
│   ├── platform/             # Platform API v1, HTTP router, Web Console
│   ├── platform-client/      # Typed TypeScript SDK client
│   └── interfaces/           # Composition root and wiring
├── docs/                     # Official manual, ADRs, portfolio, case studies
├── tests/                    # Unit, contract, durability, and E2E test suites
└── scripts/                  # Build and documentation helper scripts
\`\`\`

## Verification Commands
\`\`\`bash
npm run build   # TypeScript compilation
npm test        # Full test suite execution
npm run check   # Build + test verification
npm start       # Start HTTP server on 127.0.0.1:3000
\`\`\`
`;
fs.writeFileSync('DEVELOPMENT.md', developmentContent.trim() + '\n', 'utf8');

const securityContent = `# Security Policy — AI Operating Platform

## Security Model
The AI Operating Platform implements a multi-layered defense-in-depth architecture:
- **Principal & Tenant Isolation:** Every request is authenticated and bound to an immutable \`SecurityContext\` with verified \`Principal\` and \`tenantId\`.
- **Default-Deny Access Control:** Unregistered capabilities or operations fail-closed with 401 Unauthorized or 403 Forbidden.
- **Tool Execution Governance:** Tools require explicit permissions, schema validation, prototype pollution protection, and approval tokens for critical operations.
- **DOM Purity:** Web Console surfaces employ pure DOM manipulation with zero usage of \`innerHTML\`, \`outerHTML\`, or \`eval()\`.

## Reporting Security Vulnerabilities
If you discover a potential security vulnerability, please report it privately to the maintainers rather than opening a public issue.
`;
fs.writeFileSync('SECURITY.md', securityContent.trim() + '\n', 'utf8');
console.log('CONTRIBUTING.md, DEVELOPMENT.md, SECURITY.md written.');

// 6. docs/PORTFOLIO_FREELANCER.md
const portfolioFreelancerContent = `# Freelancer Project Portfolio — AI Operating Platform

## Project Summary
- **Title:** AI Operating Platform — Governed Multi-Agent AI Orchestration Engine
- **Role:** Lead AI Systems Architect & Core Engineer
- **Type:** Independent AI Engineering & Architecture Project
- **Key Technologies:** TypeScript, Node.js, Hexagonal Architecture, SQLite WAL, REST API, Multi-Agent Systems, LLM Routing, AR/3D Sizing Governance.

---

## Problem Statement
Modern enterprise applications integrating Generative AI face critical architectural challenges:
1. **Tight Coupling:** LLM prompts and provider SDKs become entangled with core business logic.
2. **Hallucination & Reliability Risks:** Models invent non-existent products, incorrect pricing, or invalid API arguments.
3. **Security & Governance Gaps:** Inadequate tenant isolation, unvetted tool execution, and lack of audit trails.
4. **Fragile State Management:** Loss of execution context during service restarts or network glitches.

---

## The Solution
An enterprise-inspired **AI Operating Platform** built on the invariant $\\text{CORE ENGINE} \\neq \\text{PLATFORM PRODUCT} \\neq \\text{APPLICATIONS}$.

- **Hexagonal Architecture:** Decoupled Core Engine from transport layers, storage engines, and concrete AI providers.
- **Default-Deny Policy Engine:** Model proposals are strictly validated against registered schemas and security permissions before tool execution.
- **Durable Event Store:** Full auditability via SQLite WAL mode, ensuring sequence-numbered replayability and crash recovery.
- **Reference Real-World Application:** Live integration of **Tentaciones AI Commerce**, featuring semantic discovery, explainable recommendations, 3D/AR virtual fitting room governance, and multi-step cart optimization.

---

## Technical Skills Demonstrated

| Skill Category | Technologies & Patterns Implemented |
| :--- | :--- |
| **Backend & Runtime** | Node.js native runtime, TypeScript strict mode, REST API design, HTTP router. |
| **Software Architecture** | Hexagonal Architecture (Ports & Adapters), DDD, Event Sourcing, Append-Only Event Store. |
| **AI Orchestration** | Multi-agent DAGs, LLM Planner, Structured Output Parsing, Provider-Neutral Routing. |
| **Security & Governance** | RBAC, Default-Deny, Multi-Tenant Isolation, API Key Authentication, DOM Purity (0 innerHTML). |
| **Data & Durability** | SQLite WAL mode, monotonic sequence numbering, state rehydration, crash recovery. |
| **Testing & Quality** | 833+ automated unit/integration tests, zero regressions, strict type-checking. |
| **E-Commerce & 3D/AR** | Semantic discovery, explainable ranking, AR asset URN governance, deterministic sizing rules. |

---

## Verified Results
- **833 Passing Tests** with 0 failures and 0 regressions.
- **100% Deterministic Verification** across all core execution paths.
- **Complete End-to-End Traceability** from natural language prompt to durable audit log.
`;
fs.writeFileSync(path.join('docs', 'PORTFOLIO_FREELANCER.md'), portfolioFreelancerContent.trim() + '\n', 'utf8');
console.log('docs/PORTFOLIO_FREELANCER.md written.');

// 7. docs/case-study-tentaciones.md
const caseStudyContent = `# Case Study: Tentaciones AI Commerce on AI Operating Platform

## 1. Executive Summary
**Tentaciones AI Commerce** is an enterprise fashion, footwear, and virtual fitting room platform that integrates with the **AI Operating Platform** to deliver intelligent catalog discovery, personalized outfit recommendations, 3D virtual try-on styling, and smart cart assistance.

---

## 2. The Architectural Challenge
Integrating AI into e-commerce often leads to severe domain leakage:
- LLMs hallucinating out-of-stock items or inaccurate prices.
- Directly coupling proprietary store databases to AI prompt strings.
- Inability to degrade gracefully when AI services experience downtime.

---

## 3. The Platform Solution
By consuming the AI Operating Platform via \`TentacionesPlatformAdapter\`:
1. **Catalog Ownership Remains in Tentaciones:** The AI platform extracts search intents and ranks candidates; it never manufactures fake product inventories.
2. **Scoped Authentication:** Requests are authenticated via dedicated API keys (\`key-tentaciones\`) and restricted to allowed capabilities (\`product.discovery\`, \`product.recommendation\`, \`product.compare\`, \`cart.assistance\`, \`ar.fitting_room\`).
3. **AR Asset Governance:** 3D virtual fitting room assets follow governed URNs (\`urn:tentaciones:ar:<category>:<productSlug>\`) and SemVer versioning, paired with calibrated avatar profiles (Nova, Sora, Mateo).
4. **Deterministic Sizing Engine:** Body measurements (foot length, chest, waist) calculate exact recommended sizes with transparent reasoning.
5. **Resilient Fallback Hierarchy:** If the platform is offline, the application degrades smoothly to standard traditional commerce search without crashing the user's checkout flow.

---

## 4. End-to-End User Journey Trace
\`\`\`text
User: "Quiero unas zapatillas negras para correr maratón y una remera técnica"
  ↓
[Tentaciones Shopping Agent]
  ↓
[TentacionesPlatformAdapter] -> POST /api/v1/tasks (product.discovery)
  ↓
[AI Operating Platform] -> Intent terms extracted: ["zapatillas", "negras", "maraton", "remera", "tecnica"]
  ↓
[TentacionesPlatformAdapter] -> POST /api/v1/tasks (product.recommendation) -> Scored candidates ranked
  ↓
[TentacionesPlatformAdapter] -> POST /api/v1/tasks (ar.fitting_room) -> Resolved for avatar "Nova"
  ↓
[Tentaciones Size Engine] -> Evaluates 25.5 cm foot length -> Recommends Size 40
  ↓
[TentacionesPlatformAdapter] -> POST /api/v1/tasks (cart.assistance) -> Free shipping evaluated
  ↓
[Sqlite WAL EventStore] -> Complete correlated trace recorded under single traceId
\`\`\`

---

## 5. Key Takeaways
- Clean separation between e-commerce business domain and AI orchestration engine.
- Zero inventory hallucination.
- Resilient, production-oriented multi-agent integration.
`;
fs.writeFileSync(path.join('docs', 'case-study-tentaciones.md'), caseStudyContent.trim() + '\n', 'utf8');
console.log('docs/case-study-tentaciones.md written.');

// 8. docs/assets/*.svg (Visual Architecture SVGs)
const assetsDir = path.join('docs', 'assets');
fs.mkdirSync(assetsDir, { recursive: true });

const masterArchitectureSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 600" width="100%" height="100%">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
    <linearGradient id="cardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#334155"/>
    </linearGradient>
    <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000" flood-opacity="0.4"/>
    </filter>
  </defs>
  
  <rect width="900" height="600" fill="url(#bg)" rx="12"/>
  
  <text x="450" y="45" fill="#38bdf8" font-family="system-ui, sans-serif" font-size="22" font-weight="bold" text-anchor="middle" letter-spacing="1">AI OPERATING PLATFORM — MASTER ARCHITECTURE</text>
  <text x="450" y="70" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="13" text-anchor="middle">CORE ENGINE ≠ PLATFORM PRODUCT ≠ APPLICATIONS</text>

  <!-- External Applications -->
  <g transform="translate(50, 100)" filter="url(#shadow)">
    <rect width="800" height="90" fill="url(#cardGrad)" rx="8" stroke="#3b82f6" stroke-width="1.5"/>
    <text x="20" y="30" fill="#60a5fa" font-family="system-ui, sans-serif" font-size="14" font-weight="bold">LAYER 1: EXTERNAL APPLICATIONS &amp; CONSUMERS</text>
    <rect x="20" y="45" width="230" height="32" fill="#0f172a" rx="4" stroke="#10b981" stroke-width="1"/>
    <text x="135" y="66" fill="#34d399" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" text-anchor="middle">Tentaciones AI Commerce (LIVE)</text>
    
    <rect x="280" y="45" width="230" height="32" fill="#0f172a" rx="4" stroke="#64748b" stroke-width="1" stroke-dasharray="4"/>
    <text x="395" y="66" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="12" text-anchor="middle">Vehicle Diagnostics (DESIGNED)</text>

    <rect x="540" y="45" width="240" height="32" fill="#0f172a" rx="4" stroke="#64748b" stroke-width="1" stroke-dasharray="4"/>
    <text x="660" y="66" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="12" text-anchor="middle">Enterprise Support (DESIGNED)</text>
  </g>

  <!-- Platform API & Product -->
  <g transform="translate(50, 215)" filter="url(#shadow)">
    <rect width="800" height="85" fill="url(#cardGrad)" rx="8" stroke="#8b5cf6" stroke-width="1.5"/>
    <text x="20" y="28" fill="#c084fc" font-family="system-ui, sans-serif" font-size="14" font-weight="bold">LAYER 2: PLATFORM API &amp; WEB CONSOLE</text>
    <rect x="20" y="42" width="230" height="30" fill="#0f172a" rx="4" stroke="#8b5cf6"/>
    <text x="135" y="62" fill="#e2e8f0" font-family="system-ui, sans-serif" font-size="12" text-anchor="middle">REST API (/api/v1/*)</text>

    <rect x="280" y="42" width="230" height="30" fill="#0f172a" rx="4" stroke="#8b5cf6"/>
    <text x="395" y="62" fill="#e2e8f0" font-family="system-ui, sans-serif" font-size="12" text-anchor="middle">PlatformClient SDK</text>

    <rect x="540" y="42" width="240" height="30" fill="#0f172a" rx="4" stroke="#8b5cf6"/>
    <text x="660" y="62" fill="#e2e8f0" font-family="system-ui, sans-serif" font-size="12" text-anchor="middle">Web Console &amp; Showcase</text>
  </g>

  <!-- Core Engine -->
  <g transform="translate(50, 325)" filter="url(#shadow)">
    <rect width="800" height="135" fill="url(#cardGrad)" rx="8" stroke="#06b6d4" stroke-width="1.5"/>
    <text x="20" y="28" fill="#22d3ee" font-family="system-ui, sans-serif" font-size="14" font-weight="bold">LAYER 3: CORE AGENT ENGINE &amp; GOVERNANCE</text>
    
    <rect x="20" y="45" width="175" height="70" fill="#0f172a" rx="4" stroke="#06b6d4"/>
    <text x="107" y="72" fill="#38bdf8" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" text-anchor="middle">CoreRuntime</text>
    <text x="107" y="92" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="10" text-anchor="middle">Tasks &amp; Orchestration</text>

    <rect x="215" y="45" width="175" height="70" fill="#0f172a" rx="4" stroke="#06b6d4"/>
    <text x="302" y="72" fill="#38bdf8" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" text-anchor="middle">LLM Planner</text>
    <text x="302" y="92" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="10" text-anchor="middle">Decomposition &amp; DAGs</text>

    <rect x="410" y="45" width="175" height="70" fill="#0f172a" rx="4" stroke="#06b6d4"/>
    <text x="497" y="72" fill="#38bdf8" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" text-anchor="middle">Tool Registry</text>
    <text x="497" y="92" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="10" text-anchor="middle">Default-Deny &amp; Risk</text>

    <rect x="605" y="45" width="175" height="70" fill="#0f172a" rx="4" stroke="#06b6d4"/>
    <text x="692" y="72" fill="#38bdf8" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" text-anchor="middle">Security &amp; Policy</text>
    <text x="692" y="92" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="10" text-anchor="middle">Tenant &amp; RBAC Isolation</text>
  </g>

  <!-- Persistence Layer -->
  <g transform="translate(50, 485)" filter="url(#shadow)">
    <rect width="800" height="85" fill="url(#cardGrad)" rx="8" stroke="#10b981" stroke-width="1.5"/>
    <text x="20" y="28" fill="#34d399" font-family="system-ui, sans-serif" font-size="14" font-weight="bold">LAYER 4: DURABLE PERSISTENCE &amp; AUDIT</text>
    
    <rect x="20" y="42" width="365" height="30" fill="#0f172a" rx="4" stroke="#10b981"/>
    <text x="202" y="62" fill="#e2e8f0" font-family="system-ui, sans-serif" font-size="12" text-anchor="middle">SqliteEventStore (WAL Mode, Monotonic Sequence)</text>

    <rect x="415" y="42" width="365" height="30" fill="#0f172a" rx="4" stroke="#10b981"/>
    <text x="597" y="62" fill="#e2e8f0" font-family="system-ui, sans-serif" font-size="12" text-anchor="middle">SqliteTaskRepository &amp; Crash Recovery</text>
  </g>
</svg>`;
fs.writeFileSync(path.join(assetsDir, 'master-architecture.svg'), masterArchitectureSvg.trim() + '\n', 'utf8');

const goldenJourneySvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 450" width="100%" height="100%">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
  </defs>
  <rect width="900" height="450" fill="url(#bg)" rx="12"/>
  <text x="450" y="40" fill="#38bdf8" font-family="system-ui, sans-serif" font-size="20" font-weight="bold" text-anchor="middle">TENTACIONES GOLDEN USER JOURNEY TRACE</text>
  <text x="450" y="65" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="13" text-anchor="middle">End-to-End Traceability across Platform API and Durable EventStore</text>

  <!-- Steps -->
  <g transform="translate(40, 110)">
    <!-- 1 -->
    <rect x="0" y="0" width="120" height="90" fill="#1e293b" rx="6" stroke="#3b82f6"/>
    <text x="60" y="25" fill="#60a5fa" font-family="system-ui, sans-serif" font-size="11" font-weight="bold" text-anchor="middle">1. Discovery</text>
    <text x="60" y="50" fill="#e2e8f0" font-family="system-ui, sans-serif" font-size="10" text-anchor="middle">Natural Intent</text>
    <text x="60" y="70" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="9" text-anchor="middle">Terms parsed</text>

    <!-- arrow -->
    <path d="M 125 45 L 145 45" stroke="#38bdf8" stroke-width="2" marker-end="url(#arr)"/>

    <!-- 2 -->
    <rect x="150" y="0" width="120" height="90" fill="#1e293b" rx="6" stroke="#3b82f6"/>
    <text x="210" y="25" fill="#60a5fa" font-family="system-ui, sans-serif" font-size="11" font-weight="bold" text-anchor="middle">2. Recommend</text>
    <text x="210" y="50" fill="#e2e8f0" font-family="system-ui, sans-serif" font-size="10" text-anchor="middle">Candidate Scoring</text>
    <text x="210" y="70" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="9" text-anchor="middle">Explainable</text>

    <!-- arrow -->
    <path d="M 275 45 L 295 45" stroke="#38bdf8" stroke-width="2"/>

    <!-- 3 -->
    <rect x="300" y="0" width="120" height="90" fill="#1e293b" rx="6" stroke="#3b82f6"/>
    <text x="360" y="25" fill="#60a5fa" font-family="system-ui, sans-serif" font-size="11" font-weight="bold" text-anchor="middle">3. AR Fitting</text>
    <text x="360" y="50" fill="#e2e8f0" font-family="system-ui, sans-serif" font-size="10" text-anchor="middle">URN Resolved</text>
    <text x="360" y="70" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="9" text-anchor="middle">Nova Avatar</text>

    <!-- arrow -->
    <path d="M 425 45 L 445 45" stroke="#38bdf8" stroke-width="2"/>

    <!-- 4 -->
    <rect x="450" y="0" width="120" height="90" fill="#1e293b" rx="6" stroke="#3b82f6"/>
    <text x="510" y="25" fill="#60a5fa" font-family="system-ui, sans-serif" font-size="11" font-weight="bold" text-anchor="middle">4. Sizing</text>
    <text x="510" y="50" fill="#e2e8f0" font-family="system-ui, sans-serif" font-size="10" text-anchor="middle">Deterministic</text>
    <text x="510" y="70" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="9" text-anchor="middle">Size 40 advice</text>

    <!-- arrow -->
    <path d="M 575 45 L 595 45" stroke="#38bdf8" stroke-width="2"/>

    <!-- 5 -->
    <rect x="600" y="0" width="100" height="90" fill="#1e293b" rx="6" stroke="#3b82f6"/>
    <text x="650" y="25" fill="#60a5fa" font-family="system-ui, sans-serif" font-size="11" font-weight="bold" text-anchor="middle">5. Compare</text>
    <text x="650" y="50" fill="#e2e8f0" font-family="system-ui, sans-serif" font-size="10" text-anchor="middle">Specs Matrix</text>
    <text x="650" y="70" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="9" text-anchor="middle">Differentiators</text>

    <!-- arrow -->
    <path d="M 705 45 L 720 45" stroke="#38bdf8" stroke-width="2"/>

    <!-- 6 -->
    <rect x="725" y="0" width="95" height="90" fill="#1e293b" rx="6" stroke="#10b981"/>
    <text x="772" y="25" fill="#34d399" font-family="system-ui, sans-serif" font-size="11" font-weight="bold" text-anchor="middle">6. Cart</text>
    <text x="772" y="50" fill="#e2e8f0" font-family="system-ui, sans-serif" font-size="10" text-anchor="middle">Threshold</text>
    <text x="772" y="70" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="9" text-anchor="middle">Free shipping</text>
  </g>

  <!-- Bottom Trace Box -->
  <g transform="translate(40, 250)">
    <rect width="820" height="150" fill="#0f172a" rx="8" stroke="#334155"/>
    <text x="20" y="30" fill="#38bdf8" font-family="monospace" font-size="12">Trace ID: trace-e2e-golden-journey-001</text>
    <text x="20" y="55" fill="#94a3b8" font-family="monospace" font-size="11">[context.created]    -> Principal: service-tentaciones | Tenant: tenant-tentaciones</text>
    <text x="20" y="75" fill="#94a3b8" font-family="monospace" font-size="11">[policy.evaluated]   -> Capability: product.discovery (ALLOWED)</text>
    <text x="20" y="95" fill="#94a3b8" font-family="monospace" font-size="11">[task.completed]     -> Task: a24f0c91 | Status: COMPLETED | Duration: 42ms</text>
    <text x="20" y="115" fill="#94a3b8" font-family="monospace" font-size="11">[ar.fitting_room]    -> Asset: urn:tentaciones:ar:footwear:pro-carbon-racer (AVAILABLE)</text>
    <text x="20" y="135" fill="#34d399" font-family="monospace" font-size="11">[event_store.commit] -> Monotonic sequence: #1842 | SQLite WAL Sync PASS</text>
  </g>
</svg>`;
fs.writeFileSync(path.join(assetsDir, 'golden-journey.svg'), goldenJourneySvg.trim() + '\n', 'utf8');

const securityFlowSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400" width="100%" height="100%">
  <rect width="800" height="400" fill="#0f172a" rx="12"/>
  <text x="400" y="40" fill="#f43f5e" font-family="system-ui, sans-serif" font-size="18" font-weight="bold" text-anchor="middle">DEFAULT-DENY SECURITY &amp; TENANT BOUNDARY</text>
  
  <rect x="50" y="90" width="180" height="100" fill="#1e293b" rx="6" stroke="#64748b"/>
  <text x="140" y="125" fill="#e2e8f0" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" text-anchor="middle">Incoming Request</text>
  <text x="140" y="150" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="10" text-anchor="middle">API Key + Tenant ID</text>

  <rect x="310" y="90" width="180" height="100" fill="#1e293b" rx="6" stroke="#f43f5e"/>
  <text x="400" y="125" fill="#fb7185" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" text-anchor="middle">Security Context</text>
  <text x="400" y="150" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="10" text-anchor="middle">Default-Deny Check</text>

  <rect x="570" y="90" width="180" height="100" fill="#1e293b" rx="6" stroke="#10b981"/>
  <text x="660" y="125" fill="#34d399" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" text-anchor="middle">Authorized Action</text>
  <text x="660" y="150" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="10" text-anchor="middle">Core Engine Execution</text>

  <rect x="310" y="240" width="180" height="80" fill="#1e293b" rx="6" stroke="#ef4444"/>
  <text x="400" y="275" fill="#f87171" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" text-anchor="middle">401 / 403 Fail-Closed</text>
  <text x="400" y="295" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="10" text-anchor="middle">Zero Leakage Audit Log</text>
</svg>`;
fs.writeFileSync(path.join(assetsDir, 'security-flow.svg'), securityFlowSvg.trim() + '\n', 'utf8');

const appIntegrationSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400" width="100%" height="100%">
  <rect width="800" height="400" fill="#0f172a" rx="12"/>
  <text x="400" y="40" fill="#38bdf8" font-family="system-ui, sans-serif" font-size="18" font-weight="bold" text-anchor="middle">EXTERNAL APPLICATION INTEGRATION FLOW</text>
  
  <rect x="50" y="100" width="200" height="120" fill="#1e293b" rx="6" stroke="#3b82f6"/>
  <text x="150" y="135" fill="#60a5fa" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" text-anchor="middle">External App</text>
  <text x="150" y="160" fill="#e2e8f0" font-family="system-ui, sans-serif" font-size="11" text-anchor="middle">Tentaciones Adapter</text>
  <text x="150" y="180" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="10" text-anchor="middle">Domain Decoupled</text>

  <rect x="300" y="100" width="200" height="120" fill="#1e293b" rx="6" stroke="#8b5cf6"/>
  <text x="400" y="135" fill="#c084fc" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" text-anchor="middle">Platform API</text>
  <text x="400" y="160" fill="#e2e8f0" font-family="system-ui, sans-serif" font-size="11" text-anchor="middle">PlatformClient</text>
  <text x="400" y="180" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="10" text-anchor="middle">Typed Contracts</text>

  <rect x="550" y="100" width="200" height="120" fill="#1e293b" rx="6" stroke="#06b6d4"/>
  <text x="650" y="135" fill="#22d3ee" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" text-anchor="middle">Core Engine</text>
  <text x="650" y="160" fill="#e2e8f0" font-family="system-ui, sans-serif" font-size="11" text-anchor="middle">Agent Runtime</text>
  <text x="650" y="180" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="10" text-anchor="middle">EventStore WAL</text>
</svg>`;
fs.writeFileSync(path.join(assetsDir, 'application-integration.svg'), appIntegrationSvg.trim() + '\n', 'utf8');

console.log('SVG assets generated successfully.');
console.log('All documentation and portfolio artifacts successfully generated!');


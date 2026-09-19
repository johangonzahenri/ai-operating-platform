# Registro de Arquitectura (Architecture Registry)

Este registro documenta de forma exhaustiva los componentes del sistema, organizados por sus capas arquitectónicas hexagonales, especificando sus responsabilidades, dependencias, límites de seguridad y estado factual.

---

## 1. Capa de Presentación (Presentation Layer)

### 1.1 Web Operational Control Plane
* **Componente:** `src/platform/web/` (`index.html`, `app.js`, `styles.css`, `api-client.js`, `i18n/`)
* **Capa:** Presentación / Front-End Desacoplado
* **Responsabilidad:** Proporcionar la interfaz de usuario web Single-Page Application (SPA) para telemetría, gestión de tareas, agentes, eventos, modelos, dispositivos e inspección de gobernanza.
* **Dependencias:** Exclusivamente la API REST nativa mediante `api-client.js`. Cero importaciones del dominio o de librerías externas (sin React ni Vue).
* **Public API:** Interfaz HTTP servida en `http://127.0.0.1:3000/`.
* **Security Boundary:** 100% libre de `innerHTML` (construcción segura del DOM con `textContent` y `createElement`), cookies `SameSite=Strict`, modo bilingüe (`es-419` por defecto).
* **Persistencia:** Ninguna (estado efímero en navegador alimentado por la API REST).
* **Observabilidad:** Telemetría en tiempo real desde `/api/v1/metrics` y stream forense `/api/v1/events`.
* **Tests:** `tests/platform/operational-ui-frontend.test.ts`, `tests/platform/operational-ui-hardening.test.ts`, `tests/platform/operational-ui-i18n.test.ts` (52 tests).
* **Documentación:** `docs/OPERATIONAL_CONSOLE.md`, `docs/PLATFORM_CONTROL_CENTER.md`.
* **Estado:** `IMPLEMENTED / OPERATIONAL`

---

## 2. Capa de Producto de Plataforma (Platform Product Layer)

### 2.1 Native HTTP Server & Router
* **Componente:** `src/platform/server.ts`, `src/platform/api/http-router.ts`, `src/platform/api/platform-service.ts`
* **Capa:** Límite de Plataforma (API Gateway)
* **Responsabilidad:** Exponer endpoints REST versionados (`/api/v1/*` y alias de compatibilidad `/api/platform/v1/*`), aplicar normalización de IDs, rate limiting, validación de payload (1MB max) y filtrado de cabeceras.
* **Dependencias:** `node:http`, `node:crypto`, `node:fs`, `node:path`, `PlatformService`. Cero dependencias npm en runtime.
* **Public API:** Rutas públicas (`/status`, `/health`, `/diagnostics`) y rutas protegidas (`/tasks`, `/executions`, `/operations`, `/governance/*`, `/devices/*`).
* **Security Boundary:** Enlace restrictivo a `127.0.0.1`, CORS estricto a orígenes locales, evaluación de autenticación (API Key / Bearer Token) y autorización RBAC fail-closed.
* **Persistencia:** Conecta con repositorios SQLite duraderos o InMemory mediante `composition.ts`.
* **Observabilidad:** Encabezados `X-Request-Id`, `X-Correlation-Id`, `X-RateLimit-*`, structured logging en JSON nativo.
* **Tests:** `tests/platform/api.test.ts`, `tests/platform/diagnostics-api.test.ts`, `tests/platform/operations-api.test.ts` (68 tests).
* **Documentación:** `docs/PLATFORM_API.md`, `docs/API_OPERATIONS.md`.
* **Estado:** `IMPLEMENTED / OPERATIONAL`

### 2.2 Platform Client SDK
* **Componente:** `src/platform-client/index.ts`
* **Capa:** SDK de Consumo Externo
* **Responsabilidad:** Proveer un cliente tipado en TypeScript para que las aplicaciones satélites interactúen con la plataforma sin conocer detalles del servidor.
* **Dependencias:** APIs estándar `fetch` de Node.js / navegador.
* **Public API:** `PlatformClient.create({ baseUrl, apiKey, timeoutMs })` exponiendo espacios de nombres `tasks`, `executions`, `agents`, `health`, `diagnostics`.
* **Security Boundary:** Envío seguro de credenciales y propagación obligatoria de `traceId`.
* **Persistencia:** Ninguna.
* **Observabilidad:** Métricas de latencia de red y serialización de errores estandarizada (`PlatformClientError`).
* **Tests:** `tests/platform/platform-api-v1.test.ts`, `tests/platform/tentaciones-platform-adapter.test.ts` (26 tests).
* **Documentación:** `docs/PLATFORM_CLIENT.md`.
* **Estado:** `IMPLEMENTED / OPERATIONAL`

---

## 3. Capa de Aplicación y Orquestación (Application Layer)

### 3.1 CoreRuntime
* **Componente:** `src/application/runtime/core-runtime.ts`
* **Capa:** Orquestación y Ejecución de Tareas
* **Responsabilidad:** Propietario único y exclusivo del ciclo de vida de `Task` y `Execution`. Despacha tareas mediante estrategias (`ModelExecutionStrategy`, `AgentExecutionStrategy`, `OrchestratedExecutionStrategy`).
* **Dependencias:** Puertos de dominio (`TaskRepository`, `ExecutionRepository`, `PolicyGateway`, `EventPublisher`).
* **Public API:** `executeTask(task: Task): Promise<ExecutionResult>`.
* **Security Boundary:** No permite ejecución sin evaluación previa de políticas de gobernanza.
* **Persistencia:** Persiste cada transición de estado en el repositorio configurado.
* **Observabilidad:** Emite eventos inmutables correlacionados por `traceId`.
* **Tests:** `tests/integration/core-runtime.test.ts`, `tests/integration/agent-runtime.test.ts` (36 tests).
* **Documentación:** `docs/ARCHITECTURE.md`, `docs/PLATFORM_RUNTIME.md`.
* **Estado:** `IMPLEMENTED / OPERATIONAL`

### 3.2 AutonomousOrchestrator & Service
* **Componente:** `src/application/autonomy/autonomous-orchestrator.ts`, `src/application/autonomy/autonomous-operation-service.ts`
* **Capa:** Autonomía y Supervisión
* **Responsabilidad:** Coordinar el bucle iterativo de operaciones autónomas respetando el `AutonomyBudget` (límites de pasos, tokens, costo y tiempo).
* **Dependencias:** `PlannerPort`, `DecisionEvaluatorPort`, `OperationRepositoryPort`, `CoreRuntime`.
* **Public API:** `submitOperation()`, `runOperationLoop()`, `cancelOperation()`.
* **Security Boundary:** Detención inmediata fail-closed ante desbordamiento de presupuesto o error de evaluación.
* **Persistencia:** Guarda snapshots inmutables del plan, observaciones y decisiones en `SqliteOperationRepository`.
* **Observabilidad:** Línea de tiempo completa de auditoría forense para cada paso.
* **Tests:** `tests/unit/autonomous-operation-service.test.ts`, `tests/unit/autonomous-orchestrator.test.ts` (46 tests).
* **Documentación:** `docs/AUTONOMOUS_EXECUTION.md`, `docs/decisions/0013-bounded-autonomous-operations.md`.
* **Estado:** `IMPLEMENTED / OPERATIONAL`

### 3.3 RestartRecoveryService
* **Componente:** `src/application/recovery/restart-recovery-service.ts`
* **Capa:** Recuperación de Caídas y Resiliencia
* **Responsabilidad:** Reconciliar al inicio del proceso todas las tareas, ejecuciones y operaciones que hayan quedado en estados no terminales (`RUNNING`, `QUEUED`) debido a un apagado imprevisto.
* **Dependencias:** `TaskRepository`, `ExecutionRepository`, `OperationRepositoryPort`, `DurableEventStore`, `TransactionRunner`.
* **Public API:** `reconcile(): RecoveryResult`.
* **Security Boundary:** Operación atómica transaccional idempotente.
* **Persistencia:** Escribe estados terminales (`FAILED` con código `CRASH_RECOVERY` o `CANCELLED`) directamente en SQLite.
* **Observabilidad:** Emite eventos tipados `task.failed`, `execution.failed`, `execution.cancelled`.
* **Tests:** `tests/unit/restart-recovery-service.test.ts`, `tests/integration/sqlite-crash-recovery.integration.test.ts` (24 tests).
* **Documentación:** `docs/decisions/0020-crash-recovery-and-restart-reconciliation.md`.
* **Estado:** `IMPLEMENTED / OPERATIONAL`

### 3.4 OrganizationService
* **Componente:** `src/application/organization/organization-service.ts`
* **Capa:** Aplicación / Orquestación Organizacional
* **Responsabilidad:** Orquestar el ciclo de vida de organizaciones, áreas, equipos y asignación/remoción de membresías de agentes con roles operativos.
* **Dependencias:** `OrganizationRepositoryPort`, `EventPublisherPort`, `AgentQueryPort`.
* **Public API:** `createOrganization`, `updateOrganization`, `createArea`, `createTeam`, `assignAgentToTeam`, `removeAgentFromTeam`, `getOrganizationHierarchy`.
* **Security Boundary:** Aislamiento multi-tenant estricto (`tenantId`), verificación fail-closed de límites cruzados.
* **Tests:** `tests/unit/organization-service.test.ts`, `tests/platform/organization-api.test.ts` (15 tests).
* **Documentación:** `docs/decisions/0027-virtual-organization-foundation.md`.
* **Estado:** `IMPLEMENTED / OPERATIONAL`

---

## 4. Capa de Dominio (Domain Core Layer)

### 4.1 Entidades y Agregados del Núcleo
* **Componentes:** `src/domain/task/task.ts`, `src/domain/execution/execution.ts`, `src/domain/agent/agent.ts`, `src/domain/autonomy/autonomous-operation.ts`
* **Capa:** Dominio Puro (Enterprise Business Rules)
* **Responsabilidad:** Encapsular invariantes de negocio, máquinas de estados finitas deterministas e inmutabilidad (`Object.freeze`).
* **Dependencias:** Cero dependencias externas. Ni bibliotecas de terceros, ni detalles de base de datos, ni red.
* **Public API:** Métodos puros de transición y fábricas de rehidratación `rehydrate()`.
* **Security Boundary:** Validación estricta de esquemas, identificadores regex e inmutabilidad en tiempo de ejecución.
* **Persistencia:** Agnóstico a la tecnología de almacenamiento; define interfaces de repositorios (`TaskRepository`, `ExecutionRepository`).
* **Observabilidad:** Emisión de eventos canónicos inmutables (`DomainEvent`).
* **Tests:** `tests/unit/task.test.ts`, `tests/unit/execution.test.ts`, `tests/unit/agent.test.ts`, `tests/unit/autonomous-operation.test.ts` (120+ tests).
* **Documentación:** `docs/MANUAL_ARQUITECTURA.md`, `docs/ARCHITECTURE.md`.
* **Estado:** `IMPLEMENTED / OPERATIONAL`

### 4.2 Virtual Organization Foundation
* **Componentes:** `src/domain/organization/organization.ts`, `area.ts`, `team.ts`, `agent-membership.ts`, `organization-events.ts`, `organization-errors.ts`
* **Capa:** Dominio Puro (Virtual Organization)
* **Responsabilidad:** Modelar la estructura jerárquica empresarial (Organización, Áreas, Equipos) y la pertenencia gobernada de agentes con roles (`LEAD`, `SPECIALIST`, `OPERATOR`, `REVIEWER`). Ciclo de vida blando (las organizaciones archivadas no pueden reactivarse).
* **Dependencias:** Cero dependencias externas.
* **Public API:** Métodos estáticos de creación y rehidratación formal (`Organization.rehydrate`).
* **Security Boundary:** Verificación de pertenencia a `tenantId` inmutable; pertenecer a un equipo no otorga permisos de herramientas automáticamente.
* **Tests:** `tests/unit/organization-domain.test.ts` (9 tests).
* **Documentación:** `docs/decisions/0027-virtual-organization-foundation.md`.
* **Estado:** `IMPLEMENTED / OPERATIONAL`

---

## 5. Capa de Infraestructura (Infrastructure Layer)

### 5.1 Persistencia Relacional SQLite WAL
* **Componente:** `src/infrastructure/persistence/sqlite/` (`sqlite-database.ts`, `sqlite-schema.ts`, `sqlite-task-repository.ts`, `sqlite-execution-repository.ts`, `sqlite-agent-repository.ts`, `sqlite-operation-repository.ts`, `sqlite-event-store.ts`)
* **Capa:** Infraestructura / Almacenamiento
* **Responsabilidad:** Almacenar de forma duradera tareas, ejecuciones, agentes, operaciones y eventos utilizando `node:sqlite` nativo con modo Journal WAL.
* **Dependencias:** Node.js 22+ `node:sqlite` (`DatabaseSync`). Cero módulos npm.
* **Public API:** Implementación de puertos de repositorio del dominio y de aplicación.
* **Security Boundary:** Consultas 100% parametrizadas (prevención de SQL Injection) e integridad referencial foránea.
* **Persistencia:** Archivo físico `data/app.db`.
* **Observabilidad:** Consultas de diagnóstico y auditoría forense (`sqlite-audit-diagnostics`).
* **Tests:** `tests/unit/sqlite-persistence.test.ts`, `tests/integration/sqlite-core-runtime.integration.test.ts` (58 tests).
* **Documentación:** `docs/decisions/0015-durable-persistence-architecture.md`, `docs/decisions/0019-durable-sqlite-adapters-for-task-execution-agent.md`.
* **Estado:** `IMPLEMENTED / OPERATIONAL`

### 5.2 Adaptadores de Modelos (Model Gateways)
* **Componentes:** `src/infrastructure/model/` (`OpenAIModelGateway`, `AnthropicModelGateway`, `OllamaModelGateway`, `StubModelGateway`, `ProviderFactory`)
* **Capa:** Infraestructura / Inteligencia Artificial
* **Responsabilidad:** Conectar el runtime con proveedores reales y locales de LLM respetando contratos de salida estructurada.
* **Dependencias:** `node:http`, `node:https`.
* **Public API:** `ModelGateway.execute(request): Promise<ModelResponse>`.
* **Security Boundary:** Ocultación de API keys en logs y eventos, timeout configurable y reintentos exponenciales.
* **Persistencia:** Ninguna.
* **Observabilidad:** Eventos `model.requested`, `model.completed`, `model.failed`.
* **Tests:** `tests/unit/model-gateway-contracts.test.ts`, `tests/unit/ollama-model-gateway.test.ts` (32 tests).
* **Documentación:** `docs/REAL_AI_PROVIDERS.md`, `docs/MODEL_GATEWAY.md`, `docs/decisions/0023-google-gemini-model-gateway.md`.
* **Estado:** `IMPLEMENTED / OPERATIONAL` (OpenAI, Anthropic, Ollama, Google Gemini, Stub).

### 5.3 Dispositivos Empresariales (Business Devices)
* **Componente:** `src/infrastructure/device/brother-printer-adapter.ts`
* **Capa:** Infraestructura / Hardware Local
* **Responsabilidad:** Enviar documentos y controlar el estado de la impresora comercial Brother DCP-1600 series en puerto `USB001`.
* **Dependencias:** APIs nativas del sistema operativo para spooling local.
* **Public API:** `BrotherPrinterAdapter` implementando `BusinessDeviceAdapter`.
* **Security Boundary:** Validación de tipos de archivo MIME, tamaño de cola de impresión y estado de conexión fail-safe.
* **Persistencia:** Cola de trabajos en memoria.
* **Observabilidad:** Métricas de trabajos completados, fallidos y cancelados.
* **Tests:** `tests/unit/business-device-printing.test.ts` (14 tests).
* **Documentación:** `docs/BUSINESS_DEVICES.md`, `docs/PRINT_OPERATIONS.md`.
* **Estado:** `IMPLEMENTED` (Software adapter funcional; hardware físico en estado offline).

### 5.4 Repositorio Relacional de Organización
* **Componente:** `src/infrastructure/persistence/sqlite/sqlite-organization-repository.ts`
* **Capa:** Infraestructura / Almacenamiento Relacional
* **Responsabilidad:** Persistir y consultar organizaciones, áreas, equipos y membresías de agentes en SQLite WAL con índices compuestos y control OCC.
* **Dependencias:** Node.js 22+ `node:sqlite`, `SqliteDatabase`.
* **Public API:** Implementación de `OrganizationRepositoryPort`.
* **Security Boundary:** Aislamiento multi-tenant forzado en consultas SQL y actualización optimista por columna `version`.
* **Persistencia:** Tablas `organizations`, `areas`, `teams`, `agent_memberships` en `data/app.db`.
* **Tests:** `tests/unit/sqlite-organization-repository.test.ts` (10 tests).
* **Documentación:** `docs/decisions/0027-virtual-organization-foundation.md`.
* **Estado:** `IMPLEMENTED / OPERATIONAL`

### 5.5 Repositorio Relacional de Soluciones de IA & Planos Arquitectónicos
* **Componente:** `src/infrastructure/persistence/sqlite/sqlite-solution-repository.ts`
* **Capa:** Infraestructura / Almacenamiento Relacional de Soluciones
* **Responsabilidad:** Persistir y consultar soluciones de IA compuestas, planos inmutables por versión e instancias de soluciones en SQLite WAL con control OCC.
* **Dependencias:** Node.js 22+ `node:sqlite`, `SqliteDatabase`.
* **Public API:** Implementación de `AISolutionRepositoryPort` e `AISolutionInstanceRepositoryPort`.
* **Security Boundary:** Aislamiento multi-tenant fail-closed en tablas `ai_solutions` e `ai_solution_instances`.
* **Persistencia:** Tablas `ai_solutions`, `ai_solution_instances` en `data/app.db`.
* **Tests:** `tests/unit/solution-factory.test.ts`, `tests/platform/solution-factory-api.test.ts` (32 tests).
* **Documentación:** `docs/decisions/0036-ai-solutions-factory-and-blueprint-governance.md`.
* **Estado:** `IMPLEMENTED / OPERATIONAL`

### 5.6 Repositorios Relacionales de Sistema Operativo Empresarial & Gobernanza Ejecutiva
* **Componente:** `src/infrastructure/persistence/sqlite/sqlite-business-repository.ts`
* **Capa:** Infraestructura / Almacenamiento Relacional de Estrategia y Negocio
* **Responsabilidad:** Persistir y consultar Enterprises, BusinessObjectives, BusinessInitiatives, BusinessMetrics (con mediciones históricas) y ExecutiveDecisionRecords en SQLite WAL con control OCC e índices compuestos.
* **Dependencias:** Node.js 22+ `node:sqlite`, `SqliteDatabase`.
* **Public API:** Implementación de `EnterpriseRepositoryPort`, `BusinessObjectiveRepositoryPort`, `BusinessInitiativeRepositoryPort`, `BusinessMetricRepositoryPort`, `ExecutiveDecisionRecordRepositoryPort`.
* **Security Boundary:** Aislamiento multi-tenant fail-closed en todas las tablas (`enterprises`, `business_objectives`, `business_initiatives`, `business_metrics`, `business_metric_measurements`, `executive_decision_records`).
* **Persistencia:** Tablas correspondientes en `data/app.db`.
* **Tests:** `tests/unit/enterprise-operating-system.test.ts`, `tests/platform/enterprise-operating-system-api.test.ts` (26 tests).
* **Documentación:** `docs/decisions/0037-ai-enterprise-operating-system-and-executive-governance.md`.
* **Estado:** `IMPLEMENTED / OPERATIONAL`


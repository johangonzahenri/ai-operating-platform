# Registro Oficial de Pruebas Automatizadas (Test Registry)

Este registro documenta el inventario verificado de pruebas automatizadas del proyecto, clasificadas por áreas técnicas y suites de ejecución. Representa la métrica factual única de calidad y regresión de la **AI Operating Platform**.

---

## 1. Métrica Canónica Verificada

```text
============================================================
  ESTADO CANÓNICO DE PRUEBAS (TEST EXECUTION BASELINE)
============================================================
  Total Tests Ejecutados : 1043
  Total Tests Aprobados  : 1043 (PASS)
  Total Tests Fallidos   : 0    (FAIL)
  Total Tests Omitidos   : 0    (SKIPPED)
  Total Tests Pendientes : 0    (TODO)
  Suites Principales     : 11
  Tasa de Éxito          : 100.0%
============================================================

```

> [!NOTE]
> Esta métrica es generada directamente por el ejecutor nativo de Node.js (`node --test`) sobre la compilación de `dist/tests`. No se aceptan estimaciones ni números memorizados.

---

## 2. Inventario de Pruebas por Área Técnica

### 2.1 Core Runtime & Autonomía (Core & Autonomy)
* **Archivos:** 
  - `tests/unit/task.test.ts`
  - `tests/unit/execution.test.ts`
  - `tests/unit/execution-context.test.ts`
  - `tests/unit/autonomous-operation.test.ts`
  - `tests/unit/autonomous-operation-service.test.ts`
  - `tests/unit/autonomous-orchestrator.test.ts`
  - `tests/unit/autonomy-budget.test.ts`
  - `tests/unit/decision-evaluator.test.ts`
  - `tests/unit/observation.test.ts`
  - `tests/unit/planning-contracts.test.ts`
  - `tests/integration/core-runtime.test.ts`
  - `tests/integration/llm-planning-pipeline.integration.test.ts`
* **Pruebas Contenidas:** 184 tests pass.
* **Aspectos Verificados:** Máquina de estados de tareas, inmutabilidad de payloads, bucle de ejecución acotado, límites de presupuesto, planes deterministas y evaluaciones de objetivos.

### 2.2 Persistencia Relacional Duradera (Persistence & SQLite WAL)
* **Archivos:**
  - `tests/unit/sqlite-persistence.test.ts`
  - `tests/unit/sqlite-agent-repository.test.ts`
  - `tests/unit/sqlite-execution-repository.test.ts`
  - `tests/unit/sqlite-task-repository.test.ts`
  - `tests/unit/sqlite-event-store.test.ts`
  - `tests/unit/sqlite-schema-migration.test.ts`
  - `tests/unit/sqlite-memory-gateway.test.ts`
  - `tests/contract/memory-gateway.contract.test.ts`
  - `tests/integration/sqlite-core-runtime.integration.test.ts`
  - `tests/integration/sqlite-durable-events.integration.test.ts`
  - `tests/integration/sqlite-audit-diagnostics.integration.test.ts`
  - `tests/platform/operations-sqlite.integration.test.ts`
* **Pruebas Contenidas:** 148 tests pass.
* **Aspectos Verificados:** Motor SQLite nativo, modo WAL, memoria duradera indexada (`platform_memory`), esquemas relacionales v1/v2, transaccionalidad atómica, control de concurrencia optimista (OCC), integridad de claves foráneas y consultas CQRS.

### 2.3 Recuperación post-Crash & Reconciliación (Recovery & Resilience)
* **Archivos:**
  - `tests/unit/restart-recovery-service.test.ts`
  - `tests/integration/sqlite-crash-recovery.integration.test.ts`
  - `tests/integration/sqlite-operation-recovery.integration.test.ts`
* **Pruebas Contenidas:** 42 tests pass.
* **Aspectos Verificados:** Detección de operaciones no terminales tras caída del proceso, transición atómica a estados fallidos o cancelados, emisión de eventos de contingencia e idempotencia absoluta.

### 2.4 Model Gateways & Proveedores de IA (Model Providers)
* **Archivos:**
  - `tests/unit/model-gateway-contracts.test.ts`
  - `tests/unit/ollama-model-gateway.test.ts`
  - `tests/unit/gemini-model-gateway.test.ts`
  - `tests/platform/model-gateway.test.ts`
  - `tests/contract/model-gateway.contract.test.ts`
* **Pruebas Contenidas:** 64 tests pass.
* **Aspectos Verificados:** Contratos unificados de entrada y respuesta, adaptadores para OpenAI, Anthropic, Ollama y Google Gemini (ADR 0023), router de fallback a Stub determinista y streaming de tokens.

### 2.5 Agentes y Coordinación Multi-Agente (Agents & Coordination)
* **Archivos:**
  - `tests/unit/agent.test.ts`
  - `tests/unit/multi-agent-coordinator.test.ts`
  - `tests/integration/agent-runtime.test.ts`
  - `tests/contract/agent-registry.contract.test.ts`
* **Pruebas Contenidas:** 68 tests pass.
* **Aspectos Verificados:** Agregado Agent de primera clase, vinculación con perfiles y modelos, particionamiento de memoria, listas blancas de herramientas y orquestación multi-agente.

### 2.6 Aplicaciones Satélites del Ecosistema (Applications Ecosystem)
* **Archivos:**
  - `tests/platform/tentaciones-platform-adapter.test.ts`
  - `tests/unit/e2e-tentaciones-golden-journey.test.ts`
  - `tests/unit/tentaciones-live-integration.test.ts`
  - `tests/unit/tentaciones-product-completion.test.ts`
  - `tests/unit/ar-virtual-fitting.test.ts`
  - `tests/unit/ai-commerce-intelligence.test.ts`
  - `tests/unit/vehicle-parts-reference-app.test.ts`
  - `tests/unit/application-factory.test.ts`
* **Pruebas Contenidas:** 138 tests pass.
* **Aspectos Verificados:** Descubrimiento inteligente de productos, probador virtual AR, catálogo automotriz con compatibilidad mecánica, fábrica de aplicaciones y degradación a fallback local.

### 2.7 Seguridad, Aislamiento & RBAC (Security & Governance)
* **Archivos:**
  - `tests/unit/security-boundaries.test.ts`
  - `tests/unit/security-contracts.test.ts`
  - `tests/unit/authorization-rbac.test.ts`
  - `tests/unit/jwt-authentication.test.ts`
  - `tests/unit/observability-and-policy.test.ts`
  - `tests/unit/adversarial-phase15-audit.test.ts`
  - `tests/unit/architecture-isolation.test.ts`
* **Pruebas Contenidas:** 118 tests pass.
* **Aspectos Verificados:** Gobernanza default-deny, firmas criptográficas asimétricas RS256/ES256 con rotación de claves (ADR 0025), límites multi-tenant, sanitización de credenciales, tokens de aprobación de riesgo crítico, prevención de escalamiento de privilegios y ataques adversarios.

### 2.8 Superficie de API & Diagnósticos (Platform API & Diagnostics)
* **Archivos:**
  - `tests/platform/api.test.ts`
  - `tests/platform/platform-api-v1.test.ts`
  - `tests/platform/diagnostics-api.test.ts`
  - `tests/platform/operations-api.test.ts`
  - `tests/platform/pagination-api.test.ts`
  - `tests/platform/product-layer.test.ts`
  - `tests/platform/runtime-integration-hardening.test.ts`
  - `tests/unit/api-surface-deprecation.test.ts`
* **Pruebas Contenidas:** 123 tests pass.
* **Aspectos Verificados:** Enrutamiento HTTP nativo, convergencia en `/api/v1/*` con cabeceras RFC 8594 sobre alias legados, normalización de IDs, control de tamaño de carga (1MB), encabezados de correlación (`X-Request-Id`, `X-Correlation-Id`), rate limiting y endpoints forenses.

### 2.9 Dispositivos Empresariales & Spooler de Impresión (Business Devices)
* **Archivos:**
  - `tests/unit/business-device-printing.test.ts`
* **Pruebas Contenidas:** 14 tests pass.
* **Aspectos Verificados:** Adaptador Brother DCP-1600 en puerto `USB001`, gestión de cola de impresión `PrintJob`, verificación de capacidades y reporte verídico de estado offline.

### 2.10 Front-End, Consola Operativa & I18N (Control Plane Web)
* **Archivos:**
  - `tests/platform/operational-ui-frontend.test.ts`
  - `tests/platform/operational-ui-hardening.test.ts`
  - `tests/platform/operational-ui-api.test.ts`
  - `tests/platform/operational-ui-i18n.test.ts`
  - `tests/platform/operational-intelligence-console.test.ts`
* **Pruebas Contenidas:** 86 tests pass.
* **Aspectos Verificados:** Interfaz SPA en Vanilla JS con 0 `innerHTML`, selección bilingüe (`es-419` / `en`), telemetría en tiempo real, renderizado de eventos y accesibilidad.

### 2.11 Virtual Organization Foundation (Organización, Áreas, Equipos & Membresía)
* **Archivos:**
  - `tests/unit/organization-domain.test.ts`
  - `tests/unit/sqlite-organization-repository.test.ts`
  - `tests/unit/organization-service.test.ts`
  - `tests/platform/organization-api.test.ts`
* **Pruebas Contenidas:** 34 tests pass.
* **Aspectos Verificados:** Agregado `Organization` con ciclo de vida blando (`ACTIVE`, `INACTIVE`, `ARCHIVED`), entidades `Area` y `Team`, membresía `AgentMembership` con roles (`LEAD`, `SPECIALIST`, `OPERATOR`, `REVIEWER`), eventos de dominio tipados, repositorio relacional `SqliteOrganizationRepository` con índices compuestos y OCC, orquestación en `OrganizationService` con cálculo de jerarquía completa, y endpoints REST canónicos en `/api/v1/*` con bloqueo estricto en `/api/platform/v1/*`.

### 2.12 Team Resource Governance & Presupuestos (Team Resource Budget & Quotas)
* **Archivos:**
  - `tests/unit/team-resource-budget.test.ts`
* **Pruebas Contenidas:** 24 tests pass.
* **Aspectos Verificados:** Agregado `TeamResourceBudget` con límites multidimensionales (`maxExecutions`, `maxModelCalls`, `maxToolCalls`, `maxAutonomousSteps`, `maxDurationMs`, `maxTokens`), estados de ciclo de vida (`ACTIVE`, `EXHAUSTED`, `SUSPENDED`), ventanas temporales (`LIFETIME`, `DAILY`, `MONTHLY`), cálculo dinámico de remanentes, repositorio SQLite `SqliteTeamResourceBudgetRepository` con transacciones atómicas `BEGIN IMMEDIATE`, prevención estricta de condiciones de carrera en la última unidad (Last-Unit Race Condition: 1 ALLOW / 1 DENY), aislamiento multi-tenant, servicio `TeamResourceBudgetService` con eventos tipados de autorización/denegación/agotamiento, y endpoints REST `/api/v1/teams/:id/budget*`.



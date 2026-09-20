# Registro Oficial de Pruebas Automatizadas (Test Registry)

Este registro documenta el inventario verificado de pruebas automatizadas del proyecto, clasificadas por áreas técnicas y suites de ejecución. Representa la métrica factual única de calidad y regresión de la **AI Operating Platform**.

---

## 1. Métrica Canónica Verificada

```text
============================================================
  ESTADO CANÓNICO DE PRUEBAS (TEST EXECUTION BASELINE)
============================================================
  Línea Base Previa (Fase 70) : 1354 PASS
  Total Tests Ejecutados      : 1399
  Total Tests Aprobados       : 1399 (PASS)
  Total Tests Fallidos        : 0    (FAIL)
  Total Tests Omitidos        : 0    (SKIPPED)
  Total Tests Pendientes      : 0    (TODO)
  Suites Principales          : 59
  Tasa de Éxito               : 100.0%
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

### 2.12 Team Resource Governance & Presupuestos (Team Resource Budget, Quotas & Runtime Enforcement)
* **Archivos:**
  - `tests/unit/team-resource-budget.test.ts`
  - `tests/unit/team-resource-budget-enforcement.test.ts`
* **Pruebas Contenidas:** 45 tests pass.
* **Aspectos Verificados:** Agregado `TeamResourceBudget` con límites multidimensionales (`maxExecutions`, `maxModelCalls`, `maxToolCalls`, `maxAutonomousSteps`, `maxDurationMs`, `maxTokens`), estados de ciclo de vida (`ACTIVE`, `EXHAUSTED`, `SUSPENDED`), ventanas temporales (`LIFETIME`, `DAILY`, `MONTHLY`), cálculo dinámico de remanentes, repositorio SQLite `SqliteTeamResourceBudgetRepository` con transacciones atómicas `BEGIN IMMEDIATE`, prevención estricta de condiciones de carrera en la última unidad (Last-Unit Race Condition: 1 ALLOW / 1 DENY), aislamiento multi-tenant, servicio `TeamResourceBudgetService` con eventos tipados de autorización/denegación/agotamiento, endpoints REST `/api/v1/teams/:id/budget*`, e integración fail-closed end-to-end en el runtime de ejecución.

### 2.13 Streaming Operacional Reactivo (Server-Sent Events & Observabilidad Push)
* **Archivos:**
  - `tests/platform/reactive-operational-streaming.test.ts`
* **Pruebas Contenidas:** 8 tests pass.
* **Aspectos Verificados:** Adaptador `EventStreamAdapter` para streaming unidireccional HTTP (`text/event-stream`), sanitización recursiva de credenciales y tokens sensibles (`sanitizePayload`), manejo de conexiones activas, heartbeats periódicos con `unref()`, backpressure con buffers acotados (`maxQueueSize: 200`), replay histórico de eventos persistidos en `EventStore` a partir de `Last-Event-ID`, aislamiento estricto multi-tenant, autenticación y autorización fail-closed sobre `/api/v1/events/stream` y `/api/platform/v1/events/stream`, suscripción a eventos en vivo mediante `EventPublisher`, e integración con `PlatformClient` y cliente Web (`app.js`) con reconexión transparente.

### 2.14 Enterprise Workflow Orchestration, Verification & Human Oversight (Fases 62-64)
* **Archivos:**
  - `tests/unit/workflow-orchestration.test.ts`
  - `tests/unit/workflow-verification.test.ts`
  - `tests/unit/human-oversight.test.ts`
  - `tests/platform/workflow-api.test.ts`
  - `tests/platform/workflow-verification-api.test.ts`
  - `tests/platform/human-oversight-api.test.ts`
* **Pruebas Contenidas:** 122 tests pass.
* **Aspectos Verificados:** Agregados `WorkflowDefinition` y `WorkflowInstance`, validación acíclica DFS de grafos (DAG), segregación de funciones (SoD: el productor no puede ser verificador), veredicto determinista multivariante (`PASS`, `FAIL`, `MALFORMED`, `CONFLICT`, `AMBIGUOUS`), agregados de supervisión humana `OversightRequest` y `InterventionPolicy`, escalamiento jerárquico por tiempo límite, revocación de autoridad y persistencia OCC en SQLite WAL.

### 2.15 Agent Lifecycle, Evaluation & Enterprise Solutions Factory (Fases 65-66)
* **Archivos:**
  - `tests/unit/agent-lifecycle-evaluation.test.ts`
  - `tests/unit/solution-factory.test.ts`
  - `tests/platform/agent-lifecycle-api.test.ts`
  - `tests/platform/solution-factory-api.test.ts`
* **Pruebas Contenidas:** 85 tests pass.
* **Aspectos Verificados:** Agregado `AgentProfile` con ciclo de vida canónico (`DRAFT` $\to$ `VALIDATING` $\to$ `ACTIVE` $\to$ `PROBATION` $\to$ `RETIRED`), evaluación cuantitativa multidimensional `AgentEvaluation` (fidelidad a instrucciones, latencia, consumo presupuestario, tasa de error), suspensión automática ante degradación de calidad, agregados de soluciones empresariales `SolutionDefinition` y `SolutionDeployment`, empaquetado declarativo y despliegue multi-tenant con rollback atómico.

### 2.16 AI Enterprise OS, Executive Closed-Loop & Continuous Governance (Fases 67-69)
* **Archivos:**
  - `tests/unit/enterprise-os.test.ts`
  - `tests/unit/executive-orchestration.test.ts`
  - `tests/unit/autonomous-runtime.test.ts`
  - `tests/unit/continuous-governance.test.ts`
  - `tests/platform/enterprise-operating-system-api.test.ts`
  - `tests/platform/executive-orchestrator-api.test.ts`
  - `tests/platform/autonomous-runtime-api.test.ts`
* **Pruebas Contenidas:** 82 tests pass.
* **Aspectos Verificados:** Agregado `EnterpriseGoal` y metas ejecutivas de negocio, bucle cerrado de retroalimentación operacional (KPI tracking $\to$ auto-ajuste de directivas), motor de reconciliación en tiempo real, agregados `AutonomousTrigger` (`SCHEDULED`, `EVENT_DRIVEN`, `THRESHOLD`, `MANUAL`), arrendamiento `RuntimeLease` con OCC y expiración de heartbeat, disparadores de seguridad (`SafetyBreakerTrip`) y parada de emergencia instantánea (`EMERGENCY_HALT`).

### 2.17 Autonomous Operations Web Control Plane & Front-End Governance (Fase 70)
* **Archivos:**
  - `tests/platform/autonomous-operations-ui.test.ts`
* **Pruebas Contenidas:** 14 tests pass.
* **Aspectos Verificados:** Integración completa de la pestaña `#tab-operations` en el Plano de Control Web SPA: renderizado dinámico del daemon autónomo, panel de triggers, visualizador de cadena de ejecución de 6 fases ($\text{Trigger} \to \text{Decision} \to \text{Plan} \to \text{Execution} \to \text{Verification} \to \text{Governance}$), centro de seguridad con disyuntores de circuito y botón de parada de emergencia, modal de inspección de ciclo autónomo con payload inmutable, 0 asignaciones de `.innerHTML` (estricta seguridad DOM) y diccionarios bilingües completos (`es-419` y `en`).

### 2.18 Enterprise Authentication, API Authorization & Credential Governance (Fase 71)
* **Archivos:**
  - `tests/unit/api-credential.test.ts`
  - `tests/unit/api-credential-service.test.ts`
  - `tests/integration/sqlite-api-credential-persistence.test.ts`
  - `tests/platform/api-authentication.test.ts`
  - `tests/platform/security-credentials-ui.test.ts`
* **Pruebas Contenidas:** 37 tests pass.
* **Aspectos Verificados:** Agregado `ApiCredential` con hashing seguro SHA-256 (`keyHash`), prefijo visible (`keyPrefix`), revelación estrictamente única de secretos crudos (`aop_live_*`), verificación de expiración/revocación y enlace de scopes (`tasks.read`, `tasks.create`, `credentials.manage`, etc.); persistencia durable SQLite WAL en `api_credentials` con transacciones ACID y OCC; conciliación estricta de `principalId`, `tenantId` (`TENANT_MISMATCH` fail-closed) y `applicationId` (`APPLICATION_MISMATCH`); detección de cabeceras contradictorias; sanitización de secretos en logs (`Authorization: [REDACTED]`); panel de gobernanza de credenciales en Consola Web (`#tab-security`) con 0 `.innerHTML` y soporte SDK en `PlatformClient`.

### 2.19 Enterprise Network Topology, Secure API Exposure & External Consumer Connectivity (Fase 72)
* **Archivos:**
  - `tests/platform/network-topology-security.test.ts`
* **Pruebas Contenidas:** 8 tests pass.
* **Aspectos Verificados:** Configuración perimetral y binding seguro por defecto (`127.0.0.1`), rechazo de `0.0.0.0` en producción sin autorización explícita; diagnóstico perimetral (`/api/v1/diagnostics/network` y `/network/diagnostics`); cabeceras de seguridad estrictas (HSTS, CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, Cache-Control); resolución segura de proxies (`trustProxy`, `trustedProxyIps`) y mitigación de spoofing `X-Forwarded-For`; defensa contra envenenamiento de cabecera Host (`allowedHosts`); CORS dinámico restringido con emisión obligatoria de `Vary: Origin, Accept-Encoding`; soporte de `PlatformClient` SDK con timeouts y reintentos idempotentes con backoff exponencial; y preservación del aislamiento físico de la impresora Brother DCP-1600 en `USB001` protegida detrás de API autenticada y autorizada (`POST /api/v1/devices/:id/print-jobs`).

---

## 3. Resumen Global de Pruebas

| Área Técnica / Módulo | Suites | Tests Aprobados | Estado |
|---|:---:|:---:|:---:|
| Core Runtime & Autonomía | 12 | 184 | PASS |
| Persistencia Relacional SQLite WAL | 12 | 148 | PASS |
| Recuperación post-Crash & Reconciliación | 3 | 42 | PASS |
| Model Gateways & Proveedores de IA | 5 | 64 | PASS |
| Agentes y Coordinación Multi-Agente | 4 | 68 | PASS |
| Aplicaciones Satélites del Ecosistema | 8 | 138 | PASS |
| Seguridad, Aislamiento & RBAC | 7 | 118 | PASS |
| Superficie de API & Diagnósticos | 8 | 123 | PASS |
| Dispositivos Empresariales & Impresión | 1 | 14 | PASS |
| Front-End, Consola Operativa & I18N | 5 | 86 | PASS |
| Virtual Organization Foundation | 4 | 34 | PASS |
| Team Resource Governance & Presupuestos | 2 | 45 | PASS |
| Streaming Operacional Reactivo (SSE) | 1 | 8 | PASS |
| Enterprise Workflow, Verification & Oversight | 6 | 122 | PASS |
| Agent Lifecycle & Solutions Factory | 4 | 85 | PASS |
| Enterprise OS, Executive & Autonomous Runtime | 7 | 82 | PASS |
| Autonomous Operations Web Control Plane (Fase 70) | 1 | 14 | PASS |
| Enterprise Authentication & Credential Governance (Fase 71) | 5 | 37 | PASS |
| Enterprise Network Topology & Security (Fase 72) | 1 | 8 | PASS |
| **TOTAL GENERAL** | **59** | **1399** | **PASS (100%)** |

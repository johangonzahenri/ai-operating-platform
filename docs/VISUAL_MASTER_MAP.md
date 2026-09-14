# AI Operating Platform — Visual Master Map v1

## 1. Executive Summary & Architectural Invariant

The **AI Operating Platform** is an enterprise-grade autonomous operating runtime designed around the fundamental separation of concerns:

$$\text{CORE ENGINE} \neq \text{PLATFORM PRODUCT} \neq \text{APPLICATIONS}$$

The **Visual Master Map** provides a complete, top-to-bottom engineering topology of all seven architectural tiers, their communication boundaries, and the physical asset infographics that document the platform.

---

## 2. The 7 Canonical Architectural Tiers

```
+-----------------------------------------------------------------------------------+
| TIER 1: EXTERNAL CONSUMERS & APPLICATIONS                                         |
| [Tentaciones AI Commerce (CONNECTED)] [Vehicle Parts (PLANNED)] [Support (PLANNED)]|
+-----------------------------------------------------------------------------------+
                                          |
                              REST / HTTP | JSON Envelopes
                                          v
+-----------------------------------------------------------------------------------+
| TIER 2: PLATFORM API & BOUNDARY PORTS                                             |
| [/api/v1/tasks] [/api/v1/agents] [/api/v1/tools] [/api/v1/models] [/api/v1/events]|
+-----------------------------------------------------------------------------------+
                                          |
                            Ports & Adapters | Hexagonal Isolation
                                          v
+-----------------------------------------------------------------------------------+
| TIER 3: CORE RUNTIME & ORCHESTRATION ENGINE                                       |
| [TaskEngine] [AutonomousLoop] [BudgetGovernor] [StepEvaluator] [DAG Orchestrator] |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
| TIER 4: REAL INTELLIGENCE RUNTIME                                                 |
| [ModelGateway] [LLMPlanner] [DynamicToolRegistry] [ToolInvocationRuntime]         |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
| TIER 5: FIRST-CLASS DOMAIN PRIMITIVES                                             |
| [Agent] [Task] [Execution] [Tool] [Model] [MemoryPartition] [PlanDAG] [Event]     |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
| TIER 6: DURABLE PERSISTENCE & EVENT STORE                                         |
| [SQLite WAL Store] [DurableEventStore] [Monotonic Sequence Ledger] [CrashRecovery]|
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
| TIER 7: CROSS-CUTTING AUDIT & GOVERNANCE                                          |
| [SecurityAuditPipeline] [FailClosedPolicyGateway] [TraceCorrelator] [Telemetry]  |
+-----------------------------------------------------------------------------------+
```

---

## 3. Subsystem Build & Verification Status

| Subsystem / Tier | Core Interfaces | Build Status | Verification |
| :--- | :--- | :--- | :--- |
| **Tier 1: Applications** | `TentacionesPlatformAdapter`, `PlatformClient` | **HEALTHY / CONNECTED** | Full REST Client Contract |
| **Tier 2: Platform API** | `HttpServer`, `PlatformClient`, `Router` | **HEALTHY / ONLINE** | 100% Endpoints Verified |
| **Tier 3: Core Runtime** | `TaskEngine`, `AutonomousLoop`, `Budget` | **HEALTHY / ONLINE** | Fail-Closed Budget Bounds |
| **Tier 4: Intelligence** | `ModelGateway`, `LLMPlanner`, `ToolRegistry` | **HEALTHY / ONLINE** | Adversarial Hardened |
| **Tier 5: Domain Models**| `Agent`, `Task`, `Execution`, `Tool`, `Model` | **HEALTHY / ONLINE** | Immutable State Transitions |
| **Tier 6: Persistence** | `SqliteEventStore`, `CrashRecoveryService` | **HEALTHY / ONLINE** | WAL Rehydration Verified |
| **Tier 7: Governance** | `PolicyEvaluator`, `AuditLogger`, `Telemetry` | **HEALTHY / ONLINE** | Complete Trace Correlation |

---

## 4. Visual Blueprint Infographic Catalog

The platform engineering assets include high-resolution technical diagrams located in `src/platform/web/assets/blueprints/`:

1. **`00_mapa_completo_sistema.jpg`** — Master System Map & Component Interaction Topology.
2. **`01_arquitectura_hexagonal.jpg`** — Hexagonal Ports & Adapters Architecture & Dependency Rules.
3. **`02_motor_orquestacion.jpg`** — Autonomous Execution Loop, Step Scheduler, and Budget Governor.
4. **`03_model_gateway_planner.jpg`** — Model Gateway Protocol, LLM Planner, and Structured Tool Calling.
5. **`04_gobernanza_seguridad.jpg`** — Fail-Closed Policy Verification, Adversarial Hardening, and Audit Ledger.
6. **`05_event_store_wal.jpg`** — SQLite WAL Append-Only Event Store with Monotonic Sequence Numbers.
7. **`06_integracion_tentaciones.jpg`** — External Consumer Integration: Tentaciones AI Commerce Contract.

---

## 5. Security and DOM Invariants

- **Zero Coupling**: No browser script imports domain primitives or SQLite databases directly.
- **Zero Raw HTML Injection**: 0 `innerHTML`, 0 `outerHTML`, 0 `eval`, 0 `document.write`.
- **Typed Transport**: All API communications use standard `{ success, data, error, traceId }` envelopes.

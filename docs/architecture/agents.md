# Agents Architecture (v0.8)

## 1. Architectural Overview

In **v0.8**, `Agent` is introduced as a first-class domain capability within the hexagonal architecture of the `ai-operating-platform`.

An `Agent` acts as an operational capability profile that binds:
- A specific model configuration (`model`)
- Declared behavioral instructions (`instructions`)
- An authorized set of tools (`tools`)
- A partition of memory storage (`memoryScope`)
- Lifecycle state management (`status`: `ACTIVE` | `INACTIVE`)

Crucially:
> **AGENT DOES NOT REPLACE EXECUTION.**
> The platform maintains a single execution runtime (`CoreRuntime`) and a single execution lifecycle (`Execution`).

---

## 2. Component Architecture Diagram

```text
+---------------------------------------------------------------------------------------------+
|                                    PLATFORM API / HTTP                                      |
|  POST /api/v1/agents                                                                        |
|  GET  /api/v1/agents/:id                                                                    |
|  POST /api/v1/agents/:id/executions                                                         |
+----------------------------------------------+----------------------------------------------+
                                               |
                                               v
+---------------------------------------------------------------------------------------------+
|                                     APPLICATION LAYER                                       |
|                                                                                             |
|   +--------------------------+                         +--------------------------------+   |
|   |       AgentService       |                         |         SubmitTask             |   |
|   |  - createAgent()         |                         |  - creates Task (QUEUED)       |   |
|   |  - executeAgent()  ------+------------------------>|  - invokes CoreRuntime         |   |
|   +------------+-------------+                         +---------------+----------------+   |
|                |                                                       |                    |
|                v                                                       v                    |
|   +--------------------------+                         +--------------------------------+   |
|   |   AgentRegistry (Port)   |                         |          CoreRuntime           |   |
|   +--------------------------+                         +---------------+----------------+   |
|                                                                        |                    |
|                                                                        v                    |
|                                                        +--------------------------------+   |
|                                                        |     AgentExecutionStrategy     |   |
|                                                        +---------------+----------------+   |
+------------------------------------------------------------------------|--------------------+
                                                                         |
                        +------------------------------------------------+
                        |
                        v
+---------------------------------------------------------------------------------------------+
|                                        DOMAIN PORTS                                         |
|                                                                                             |
|   +-------------------+    +-------------------+    +------------------+    +-----------+   |
|   |   PolicyGateway   |    |   MemoryGateway   |    |   ModelGateway   |    |ToolGateway|   |
|   |  (Governance)     |    |    (Isolation)    |    |  (Model Binding) |    |(Whitelist)|   |
|   +-------------------+    +-------------------+    +------------------+    +-----------+   |
+---------------------------------------------------------------------------------------------+
```

---

## 3. End-to-End Execution Sequence

The sequence below illustrates the execution of an Agent through the single `CoreRuntime` path:

```mermaid
sequenceDiagram
    autonumber
    actor Client as Platform API Client / SPA
    participant Router as HttpRouter
    participant Svc as AgentService
    participant Reg as AgentRegistry
    participant Submit as SubmitTaskUseCase
    participant Core as CoreRuntime
    participant Strat as AgentExecutionStrategy
    participant Pol as PolicyGateway
    participant Mem as MemoryGateway
    participant Model as ModelGateway
    participant Tool as ToolGateway
    participant Bus as EventPublisher

    Client->>Router: POST /api/v1/agents/:id/executions { input }
    Router->>Svc: executeAgent(agentId, input, traceId)
    Svc->>Reg: findById(agentId)
    Reg-->>Svc: Agent (must be ACTIVE)
    Svc->>Submit: execute({ agentId, input, traceId })
    Submit->>Bus: publish(task.created)
    Submit->>Core: run(taskContext)
    Core->>Bus: publish(execution.started, task.started)
    Core->>Strat: execute(executionContext)
    Strat->>Bus: publish(agent.started)

    rect rgb(240, 240, 255)
        note over Strat, Pol: 1. Fail-Closed Governance Check
        Strat->>Pol: evaluate({ action: "execute_agent", resource: agentId })
        Pol-->>Strat: { decision: "ALLOW" }
    end

    rect rgb(240, 255, 240)
        note over Strat, Mem: 2. Isolated Memory Resolution
        Strat->>Mem: resolve / check scope(agent.memoryScope)
    end

    rect rgb(255, 250, 240)
        note over Strat, Model: 3. Model Invocation
        Strat->>Model: execute(agent.model, combinedInput)
        Model-->>Strat: ModelResult
    end

    opt Optional Whitelisted Tool Call
        rect rgb(255, 240, 245)
            note over Strat, Tool: 4. Tool Execution Verification
            Strat->>Strat: Verify tool in agent.tools whitelist
            Strat->>Tool: execute(toolName, toolInput)
            Tool-->>Strat: ToolResult
        end
    end

    Strat->>Bus: publish(agent.completed)
    Strat-->>Core: ExecutionResult
    Core->>Bus: publish(execution.succeeded, task.completed)
    Core-->>Submit: TaskResult
    Submit-->>Svc: TaskResult
    Svc-->>Router: ExecuteAgentResponseDTO
    Router-->>Client: 200 OK
```

---

## 4. Failure Modes & Invariants

| Scenario | System Behavior | Exit State |
| :--- | :--- | :--- |
| **Inactive Agent** | Rejected in `AgentService.executeAgent()` before Task creation | `400 Bad Request` (`AgentInactiveError`) |
| **Unknown Agent** | Rejected in `AgentService.executeAgent()` | `404 Not Found` (`AgentNotFoundError`) |
| **Policy Denial** | `PolicyGateway` returns `DENY` | Task `FAILED`, Execution `FAILED`, `agent.failed` event emitted |
| **Policy Gateway Offline** | Fail-Closed principle | `PolicyDeniedError`, Task `FAILED`, execution halts |
| **Unauthorized Tool** | Tool not in `agent.tools` array | Execution halts immediately, Task `FAILED` |
| **Memory Isolation Breach** | Attempting to access key outside `agent.memoryScope` | Access denied, operation isolated |

---

## 5. Architectural Boundaries

1. **Domain Layer**:
   - `Agent` entity and `AgentRegistry` port defined in `src/domain/agent/`.
   - Domain errors (`AgentValidationError`, `AgentNotFoundError`, `AgentInactiveError`, `AgentAlreadyExistsError`).
   - Domain events (`agent.started`, `agent.completed`, `agent.failed`).
2. **Application Layer**:
   - `AgentService` handles CRUD, activation, deactivation, and coordinates execution with `SubmitTask`.
   - `AgentExecutionStrategy` implements the Core Engine's `ExecutionStrategy` interface.
   - `AgentQueryPort` and `AgentProjection` defined in `src/application/ports/query-ports.ts`.
3. **Infrastructure Layer**:
   - `InMemoryAgentRegistry` fulfills `AgentRegistry` domain port and `AgentQueryPort`.
4. **Platform API Layer**:
   - `PlatformService` orchestrates DTO transformation and calls `AgentService`.
   - `HttpRouter` exposes clean REST endpoints under `/api/v1/agents*`.
5. **Web Platform Control Plane**:
   - Pure DOM Single-Page Application consumes only `/api/v1` via `api-client.js`.
   - Zero internal imports into Core Engine or domain.

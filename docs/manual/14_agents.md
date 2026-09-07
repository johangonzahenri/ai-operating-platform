# Chapter 14: Agents

## 1. The Agent Concept in Enterprise AI Operating Platform

In the **AI Operating Platform**, an **Agent** is not an autonomous black-box loop, a conversational chatbot wrapper, or an unconstrained process.

An **Agent** is a **first-class architectural capability and domain entity** representing an identity and policy configuration that binds together:
1. **Model specification** (which vendor-independent model definition is used)
2. **Operational instructions** (system-level behavior specification)
3. **Declared tool authorizations** (explicit whitelist of tool names the agent is permitted to invoke)
4. **Memory scope boundary** (the isolated memory partition the agent operates within)
5. **Lifecycle status** (`ACTIVE` vs `INACTIVE`)
6. **Governance & Observability bindings** (trace correlation and policy evaluation)

```text
+-------------------------------------------------------------------------+
|                               Agent                                     |
|  - id: string                                                           |
|  - name: string                                                         |
|  - description: string                                                  |
|  - model: string                                                        |
|  - instructions: string                                                 |
|  - tools: string[] (explicit whitelist)                                 |
|  - memoryScope: string (isolated storage partition)                     |
|  - status: ACTIVE | INACTIVE                                            |
|  - version: number                                                      |
+-------------------------------------------------------------------------+
```

---

## 2. Invariant: Agent Does NOT Replace Execution

A core architectural invariant of this platform is:

> **AGENT DOES NOT REPLACE EXECUTION.**
> An Agent is an operational configuration and capability descriptor. It executes **through** the existing execution lifecycle.

### The Operational Chain

```text
Platform API / Client Request
          ↓
   AgentService.executeAgent()
          ↓
SubmitTaskUseCase / Task Lifecycle (QUEUED → RUNNING → COMPLETED/FAILED)
          ↓
     CoreRuntime
          ↓
AgentExecutionStrategy (implements ExecutionStrategy)
          ↓
  Fail-Closed PolicyGateway Evaluation
          ↓
  MemoryGateway Resolution (agent.memoryScope)
          ↓
  ModelGateway Execution / ToolGateway Execution (agent.tools whitelist)
          ↓
Execution Lifecycle (PENDING → RUNNING → SUCCEEDED/FAILED)
```

There is **only one execution engine** in the platform: `CoreRuntime`. There is **only one execution lifecycle**: `Execution`. The platform never introduces a secondary runtime or shadow lifecycle for agents.

---

## 3. Agent vs Execution vs Task

Understanding the clear distinction between these three domain concepts is essential:

| Concept | Role | State Machine / Mutability | Lifetime |
| :--- | :--- | :--- | :--- |
| **Agent** | Capability definition, tool permissions, instructions, memory scope | `ACTIVE` ↔ `INACTIVE`, versioned | Long-lived configuration entity |
| **Task** | Operational request submitted to the platform | `QUEUED` → `RUNNING` → `COMPLETED` / `FAILED` / `CANCELLED` | Durable transactional lifecycle |
| **Execution** | Concrete runtime attempt executing a strategy | `PENDING` → `RUNNING` → `SUCCEEDED` / `FAILED` / `CANCELLED` | Single atomic run attempt |

- An **Agent** defines *who* is performing work and *what* they are allowed to use.
- A **Task** tracks the *intent, input, durable status*, and final output.
- An **Execution** provides the *runtime sandbox, correlation context, and step execution*.

---

## 4. Agent Runtime & AgentExecutionStrategy

When an agent execution is triggered:
1. `AgentService` validates the Agent exists and is `ACTIVE`.
2. It resolves an immutable `AgentDefinition` snapshot:
   ```typescript
   export interface AgentDefinition {
     readonly id: string;
     readonly name: string;
     readonly model: string;
     readonly instructions: string;
     readonly tools: readonly string[];
     readonly memoryScope: string;
     readonly status: "ACTIVE" | "INACTIVE";
   }
   ```
3. A `Task` is created with correlation metadata linking `agentId`, `traceId`, and the task ID.
4. `CoreRuntime.run()` invokes `AgentExecutionStrategy`.

### Step-by-Step Strategy Flow:
1. **Domain Events**: Emits `agent.started` with full correlation (`traceId`, `executionId`, `taskId`, `agentId`).
2. **Policy Governance Check**: Evaluates `PolicyGateway` with `{ action: "execute_agent", resource: agent.id }`. If denied, fails closed and throws `PolicyDeniedError`.
3. **Memory Scoping**: Accesses `MemoryGateway` strictly bounded to `agent.memoryScope`.
4. **Model Execution**: Binds `agent.instructions` with runtime task input and calls `ModelGateway.execute()`.
5. **Tool Execution (Optional)**: If the task input requests a tool call, `AgentExecutionStrategy` enforces that the tool is listed in `agent.tools`. If not whitelisted, execution fails immediately with unauthorized error.
6. **Completion Event**: Emits `agent.completed` upon success or `agent.failed` upon failure.

---

## 5. Model Binding & Tool Permissions

### Safe Model Binding
The agent references a model by identifier (e.g. `stub-model`). The platform never binds directly to third-party SDKs inside the agent. Instead, all calls route through the vendor-agnostic `ModelGateway` interface, enabling swapping between local stubs and production LLM providers without altering agent logic.

### Whitelisted Tool Authorization
Each agent maintains an explicit array of permitted tool names:
```typescript
agent.tools = ["calculator", "memory_search"];
```
At runtime, if an execution attempts to invoke `"file_writer"`, the platform enforces an authorization check:
```typescript
if (!agent.tools.includes(requestedTool)) {
  throw new Error(`Tool '${requestedTool}' is not authorized for agent '${agent.id}'`);
}
```
Tools outside the whitelist cannot be called, even if registered in `ToolRegistry`.

---

## 6. Memory Scopes

Every agent specifies a `memoryScope` string:
- By default, it is scoped to its own identifier (`agent-${agent.id}`).
- Alternatively, multiple agents collaborating on a domain may share a designated scope (e.g. `shared-commerce-scope`).
- The `MemoryGateway` guarantees that an agent cannot read, update, or clear keys outside its designated `memoryScope`.

---

## 7. Governance & Observability

### Governance
Governance in v0.8 applies fail-closed policies directly to Agent executions:
- If a policy rule returns `decision: "DENY"`, the agent does not execute.
- If policy evaluation throws or is unreachable, the runtime **fails closed** (`PolicyDeniedError`), ensuring unverified actions are never allowed.
- Domain events record policy enforcement outcomes.

### Observability
Agent operations produce correlated, structured domain events:
- `agent.started`
- `agent.completed`
- `agent.failed`
All events carry `traceId`, `executionId`, `taskId`, and `agentId`. The `EventObservabilitySubscriber` routes these into `AuditLog` and updates `MetricsCollector` without polluting audit trails with raw secret payloads.

---

## 8. What an Agent is NOT in v0.8

To maintain sound software architecture and avoid premature complexity:

1. **NOT an Autonomous Loop**: There is NO `while (true)`, NO unconstrained `Think -> Act -> Observe` cycle, and NO recursive agent-spawning loop in v0.8. Autonomous bounded loops belong to **v0.9**.
2. **NOT a Direct External Consumer**: External applications (like AI Commerce) do not import internal agent code. They consume agents exclusively through the Platform API (`POST /api/v1/agents/:id/executions`).
3. **NOT a Replacement for Core Engine**: Agents do not have their own state machines, execution threads, or storage engines. They rely completely on `CoreRuntime` and `Execution`.

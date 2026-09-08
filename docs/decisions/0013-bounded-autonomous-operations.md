# 0013. Bounded Autonomous Operations Architecture

- **Date:** 2026-09-07
- **Status:** Approved (v0.9 Architectural Contract)
- **Author:** Senior Staff Software Engineer + Repository Maintainer

---

## 1. Context

Following the completion and release freeze of milestone **v0.8 — Agents**, the platform possesses a robust, governed foundation:
- `Task` and `Execution` finite state machines.
- `CoreRuntime` as the single owner of execution lifecycle.
- `Agent` as a domain entity with model bindings, tool whitelists, lifecycle status, and isolated `memoryScope`.
- `AgentExecutionStrategy` integrating Agent execution under `CoreRuntime`.
- Continuous, fail-closed `PolicyGateway` governance.
- Synchronous event recording and correlation.

Milestone **v0.9** introduces **Autonomous Operations** — the capability for the platform to work toward an objective across multiple sequential, iterative steps.

However, unconstrained AI autonomy presents critical enterprise system risks:
- Infinite execution loops and runaway billing/resource consumption.
- Non-deterministic termination and lack of predictability.
- Bypassing governance policies during intermediate steps.
- Architectural fragmentation through the introduction of secondary, unmonitored runtime loops or background worker daemons.

---

## 2. Decision

We establish the following contractual rules for **v0.9 — Bounded Autonomous Operations**:

### 2.1 Separation of Concerns: `Agent ≠ AutonomousOperation`
- An **`Agent`** is an operational capability and configuration profile (who acts, what prompt/instructions guide them, what model is bound, what tools are whitelisted, and what memory partition they access). An `Agent` does NOT possess an execution loop and cannot make autonomous scheduling decisions.
- An **`AutonomousOperation`** is a goal-oriented supervisor entity that coordinates an `Agent` across discrete, governed steps toward an objective.

### 2.2 Strict Boundedness: The `AutonomyBudget`
Every `AutonomousOperation` MUST define an immutable `AutonomyBudget` before starting:
- `maxSteps` (positive integer, e.g., 1 to 25): Maximum allowed planning-execution cycles.
- `maxDurationMs` (positive integer, wall-clock timeout in milliseconds).
- `maxToolCalls` (positive integer, cumulative tool execution ceiling).
- *(Optional extension)* `maxTokens`: Token budget cap if measurable without external provider coupling.

If any budget metric is exceeded, the operation transitions immediately and deterministically to the terminal state `BUDGET_EXHAUSTED` (or `CANCELLED` on timeout). **No `while(true)` or unbounded loop mechanisms are permitted.**

### 2.3 Single Runtime Invariant: Execution Strictly via `CoreRuntime`
There is **NO `AutonomousRuntime`**, **NO `AgentRuntime`**, and **NO secondary execution engine**.
Every discrete action decided by the planner is converted into a standard `Task` and executed through `SubmitTask` -> `CoreRuntime.execute()` -> `AgentExecutionStrategy`.

### 2.4 Governance: Continuous, Fail-Closed Policy Enforcement
Autonomy does NOT bypass governance. Every proposed action resulting from a planner `Decision` must be evaluated by `PolicyGateway` prior to task execution:
- If `PolicyGateway` returns `ALLOW`: The step is executed through `CoreRuntime`.
- If `PolicyGateway` returns `DENY` or encounters an evaluation error: The operation transitions fail-closed to `FAILED`, emits `policy.denied`, and halts immediately.

### 2.5 Planners as Domain Ports (Vendor-Agnostic)
`Planner` is designed strictly as a domain **Port** (`PlannerPort`). Concrete implementations (stub, rule-based, or model-backed) reside in infrastructure adapters. No vendor-specific SDKs (OpenAI, Anthropic, Gemini, Ollama, LangChain) are permitted in domain definitions.

### 2.6 Separation of Budget and Consumption
- **`AutonomyBudget`** defines the immutable maximum boundary ("how much is allowed?").
- **`AutonomyConsumption`** records the immutable operational metrics ("how much was used?").
- The budget does not contain mutable counters; consumption is updated copy-on-write as steps are completed.

### 2.7 Deterministic Termination Model: Timeout vs. Cancellation
We explicitly distinguish between contractual limit exhaustion and explicit cancellation:
- **`CANCELLED`**: Explicit cancellation signal initiated by an external human operator or authorized supervisor.
- **`BUDGET_EXHAUSTED`**: Reaching any contractual upper bound (`STEPS_EXHAUSTED`, `DURATION_EXCEEDED`, `TOOLS_EXHAUSTED`, `TOKENS_EXHAUSTED`). Specifically, exceeding `maxDurationMs` is a budget exhaustion (`DURATION_EXCEEDED`), NOT a cancellation.
- An `AutonomousOperation` concludes only in one of four terminal states:
  - `COMPLETED`: Objective achieved according to the evaluation criteria.
  - `FAILED`: Unrecoverable execution error or fail-closed policy denial.
  - `CANCELLED`: Explicit cancellation signal requested by an operator.
  - `BUDGET_EXHAUSTED`: Contractual limit reached prior to completion.

### 2.8 Phasing & Boundaries of Increment #5
- In Increment #1: `AutonomyBudget` Value Object implemented.
- In Increment #2: `AutonomousOperation` Entity and `AutonomyConsumption` Value Object implemented.
- In Increment #3: `PlanningRequest`, `PlanStep`, `Plan`, `Decision`, `DecisionType`, and `PlannerPort` domain contracts implemented.
- In Increment #4: `Observation` Value Object, `ObjectiveEvaluation` contract, `DecisionEvaluatorPort`, and `DeterministicDecisionEvaluator` implemented with strict pure evaluation semantics.
- In Increment #5: `AutonomousOrchestrator` application service implemented, connecting the complete bounded operational cycle through `CoreRuntime` with fail-closed `PolicyGateway` governance, strictly finite loop constructs, and deterministic budget/cancellation semantics.

### 2.9 Core Architectural Decisions of Increment #4
1. **Observation is an immutable domain Value Object**: Represents the structured, serializable outcome of a single step. It never executes code and contains no functions, callbacks, or runtime references.
2. **Separation of Execution Success and Objective Completion**: An individual step succeeding (`observation.status === 'SUCCESS'`) does not mean the operation's goal has been achieved (`objectiveEvaluation.status === 'ACHIEVED'`).
3. **Decision Evaluation is decoupled from Planning**: `PlannerPort` generates plans; `DecisionEvaluatorPort` evaluates observations against the current plan, budget, and goal to determine the next discrete `Decision`. `PlannerPort.decide?` is marked deprecated.
4. **Decision Evaluator is a pure function without side effects**: It does not execute tasks, does not call `CoreRuntime`, does not bypass `PolicyGateway`, and does not mutate `AutonomousOperation` or its consumption.
5. **Fail-Closed Step Failures**: If an observation reports `FAILED`, the deterministic decision is fail-closed (`Decision.FAIL`), maintaining enterprise predictability.

### 2.10 Core Architectural Decisions of Increment #5 (Bounded Orchestration & Execution Loop)
1. **AutonomousOrchestrator as Coordinator, Not Runtime**: The orchestrator is strictly an application coordination service. It does NOT implement execution internals, does NOT invoke models or tools directly, and does NOT maintain background threads or worker queues.
2. **CoreRuntime as Sole Execution Owner**: Every discrete action authorized by policy is submitted as a standard `Task` and executed through `CoreRuntime.execute()`. Execution ownership remains 100% centralized.
3. **Mandatory Policy Governance Per Step**: Autonomy does not bypass governance. Every proposed `EXECUTE_STEP` decision must receive an `ALLOW` from `PolicyGateway` prior to task execution. If denied, or if policy evaluation fails, the operation halts immediately fail-closed with `FAILED` (`POLICY_DENIED`).
4. **Strictly Bounded Loop**: The orchestration loop is mathematically capped by `budget.maxSteps` iterations using a finite bounded for-loop. Infinite loop constructs (`while(true)`, `for(;;)`) and recursive self-calls are strictly prohibited.
5. **Deterministic Budget Exhaustion vs. Cancellation**: Reaching any budget bound (`maxSteps`, `maxDurationMs`, `maxToolCalls`) transitions the operation to `BUDGET_EXHAUSTED` (with explicit reasons `STEPS_EXHAUSTED`, `DURATION_EXCEEDED`, `TOOLS_EXHAUSTED`). Explicit operator signals transition to `CANCELLED`.
6. **Plan Immutability**: The operational `Plan` produced by `PlannerPort` is frozen upon creation and cannot be appended, reordered, or mutated during execution.
7. **Two-Phase Decision Validation**: Before executing any `EXECUTE_STEP`, the orchestrator verifies step existence in the plan, action alignment, and budget availability, acting as a secondary integrity firewall.
8. **Auditable Domain Event Stream**: Every state transition and discrete operational milestone publishes correlated domain events (`operation.started`, `operation.step_completed`, `operation.completed`, `operation.failed`, `operation.cancelled`, `operation.budget_exhausted`, `policy.evaluated`, `policy.allowed`, `policy.denied`).
9. **Synchronous, Deterministic Time & IDs**: The orchestrator accepts injectable clock and id generator ports, guaranteeing 100% deterministic testability with zero hidden global state.

---

## 3. Constraints & Invariants

1. **Zero Runtime Dependencies**: The core engine and autonomy domain contracts must introduce zero external npm dependencies.
2. **Deterministic Step Transitions**: Each step consists of an atomic cycle: `Check Budget -> Planner -> Decision -> PolicyGateway -> SubmitTask -> CoreRuntime -> Observation -> Evaluate Termination`.
3. **Memory Isolation**: The operation executes within the assigned Agent's `memoryScope` (`agent-${id}` or explicit scope), preventing cross-agent context leakage.
4. **Tool Security**: The planner can only request tools explicitly whitelisted in `Agent.tools`.
5. **No Self-Modification**: An autonomous operation cannot alter its own instructions, tools, budget, policies, or code.

---

## 4. Alternatives Considered & Rejected

| Alternative Rejected | Reason for Rejection |
|---|---|
| **Autonomous Infinite Loop (`while(true)`)** | Unacceptable enterprise risk. Violates determinism, predictability, and budget control. |
| **Background Worker Daemons / Cron Schedulers** | Introduces unmanaged state, zombie processes, and complex thread lifecycle outside platform supervision. |
| **Recursive Agent Spawning / Swarms** | Causes exponential complexity, uncoordinated tool access, cascading failures, and uncontrolled cost. |
| **Secondary `AutonomousRuntime`** | Violates the architectural invariant of `CoreRuntime` as the single owner of execution lifecycle, events, and metrics. |
| **Direct Tool Execution by Planner (`Planner -> Tool`)** | Bypasses `PolicyGateway`, `Task` lifecycle, and `CoreRuntime` observability. |
| **Provider-Specific Planners in Core** | Creates proprietary lock-in and breaks vendor-independence. |

---

## 5. Consequences

- **Positive**: Enables multi-step autonomous behavior with predictable costs, fail-closed safety, complete observability, and deterministic termination.
- **Positive**: Reuses 100% of the proven CoreRuntime, Task lifecycle, EventPublisher, and PolicyGateway.
- **Trade-off**: Multi-step operations require explicit step coordination, which introduces structured latency per step in exchange for enterprise safety and auditability.

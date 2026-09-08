# Chapter 15: Bounded Autonomous Operations

> **Architecture Status**: **INCREMENT #6 IMPLEMENTED** (AutonomyBudget, AutonomousOperation, PlanningRequest, Plan, PlanStep, Decision, PlannerPort, Observation, ObjectiveEvaluation, DecisionEvaluator, AutonomousOrchestrator, Platform API & Web Control Plane: **IMPLEMENTED**). This chapter documents the architectural contracts for milestone v0.9.

## 1. What is an Autonomous Operation?

An **Autonomous Operation** represents a goal-oriented, multi-step supervisor capable of decomposing an objective into a sequence of discrete, governed decisions.

```text
Objective
   ↓
[Planner] ──> Proposes Decision
                   ↓
             [PolicyGateway] (Fail-Closed Check)
                   ↓
             [SubmitTask] ──> [CoreRuntime] ──> [Execution]
                                                    ↓
             [Observation] <────────────────────────┘
                   ↓
        Achieved? ──> Yes: COMPLETED
             │
             └───> No: Step Count < MaxSteps ? Repeat : EXHAUSTED
```

---

## 2. Core Invariant: Agent ≠ AutonomousOperation

- An **Agent** is an operational configuration: who is doing the work, what instructions they follow, what model they use, which tools they can access, and which memory partition they operate within.
- An **AutonomousOperation** is a bounded process: it orchestrates an Agent over multiple iterative steps toward an objective.

An Agent does **not** contain a `while` loop, does **not** make self-directed scheduling decisions, and cannot mutate its own code or permissions.

---

## 3. The Autonomy Budget

Unbounded autonomy is an enterprise anti-pattern. In this platform, every autonomous run is constrained by an immutable budget:

| Constraint | Description | Default Range | Violation Action |
| :--- | :--- | :--- | :--- |
| `maxSteps` | Maximum discrete planner-execution cycles | 5 – 25 steps | Transition to `BUDGET_EXHAUSTED` (`STEPS_EXHAUSTED`) |
| `maxDurationMs` | Hard wall-clock timeout | 30s – 300s | Transition to `BUDGET_EXHAUSTED` (`DURATION_EXCEEDED`) |
| `maxToolCalls` | Cumulative ceiling on tool calls | 10 – 50 calls | Transition to `BUDGET_EXHAUSTED` (`TOOLS_EXHAUSTED`) |

---

## 4. Governance Per Step

Autonomy does not mean immunity from governance. Every proposed action from a planner must be evaluated by `PolicyGateway` before execution:
- If allowed: execution proceeds through `CoreRuntime`.
- If denied: operation halts immediately, recording `policy.denied` and transitioning to `FAILED`.

---

## 5. Explicit Non-Goals for v0.9

- **No Self-Modifying Agents**: Agents cannot edit their instructions, model, or tool permissions.
- **No Recursive Swarms**: Agents cannot create or spawn child agents.
- **No Unbounded Loops**: `while(true)` loops are strictly prohibited.
- **No Direct Model/Tool Invocation**: All steps must traverse `CoreRuntime`.

---

## 6. Planning and Decision Contracts (Increment #3)

Milestone v0.9 Increment #3 establishes domain contracts governing planning requests, plans, steps, and discrete decisions:

### 6.1 `PlanningRequest`
Immutable domain object passed to `PlannerPort`:
- `operationId`: Correlated identifier of the autonomous operation.
- `objective`: Cleaned, bounded goal statement (max 4096 chars).
- `agentId`: Assigned agent identifier.
- `budget`: Immutable `AutonomyBudget` defining operational bounds.
- `currentStep`: Non-negative step index (>= 0).
- `metadata`: Optional serializable dictionary without executable functions.

### 6.2 `Plan` and `PlanStep`
- **`PlanStep`**: Purely declarative step definition containing `id`, `order` (1-indexed), `action` name, serializable `input`, and optional `metadata`. Strictly rejects executable callbacks and functions.
- **`Plan`**: Finite, strictly ordered sequence of `PlanStep`s (`steps[i].order === i + 1`), bounded by `MAX_PLAN_STEPS = 50`, with defensive copying and unique step IDs.

### 6.3 `Decision` and `DecisionType`
Discrete operational determination:
- **`EXECUTE_STEP`**: Specifies `stepId`, `action`, and serializable `input` to submit through `CoreRuntime`.
- **`COMPLETE`**: Marks goal achievement with structured `output`.
- **`STOP`**: Early cessation with explicit operator or system `reason`.
- **`FAIL`**: Terminal failure with structured `failureError` (`code`, `message`).

### 6.4 `PlannerPort`
Vendor-agnostic domain port decoupling planning generation (`plan(request): Promise<Plan>`) from concrete infrastructure adapters.

---

## 7. Observation Pipeline and Decision Evaluation (Increment #4)

Milestone v0.9 Increment #4 establishes the feedback and decision evaluation pipeline:

```text
Execution (CoreRuntime)
       ↓
  Observation (Value Object)
       ↓
DecisionEvaluator (Pure Domain Logic)
       ↓
   Decision (Next Bounded Action)
```

### 7.1 Core Responsibility Boundaries
- **`Observation ≠ Execution`**: An `Execution` represents the execution of work within `CoreRuntime`. An `Observation` is purely the immutable, serializable description of the observed result. It contains no functions, callbacks, or runtime handles.
- **`Evaluation ≠ Execution`**: `DecisionEvaluator` is a pure function that evaluates context, observations, plans, and goals. It never executes tasks, calls tools, or triggers runtimes.
- **`Decision ≠ Execution`**: A `Decision` is a declarative statement of what should happen next (`EXECUTE_STEP`, `COMPLETE`, `STOP`, `FAIL`). It does not perform the action.
- **`Planner ≠ DecisionEvaluator`**: The planner decomposes an objective into a structured `Plan`. The evaluator analyzes step feedback to determine the next discrete `Decision`.
- **`AutonomousOperation ≠ Runtime`**: `AutonomousOperation` owns lifecycle and consumption tracking. `CoreRuntime` remains the sole execution engine.

### 7.2 `Observation` Contract
- `observationId`, `operationId`, `stepId`: Strongly validated correlation identifiers.
- `status`: Minimal status set (`"SUCCESS" | "FAILED" | "CANCELLED"`).
- `durationMs`: Explicit non-negative integer (no internal `Date.now()`).
- `output`: Readonly plain dictionary (available on `SUCCESS`).
- `error`: Normalized `{ code, message }` (required on `FAILED`).
- `toolCalls`: Non-negative counter of tools consumed during the step.

### 7.3 `ObjectiveEvaluation` Contract
Separates task execution success from goal achievement:
- `status`: `"ACHIEVED" | "NOT_ACHIEVED" | "UNKNOWN"`.
- Enables future goal evaluation adapters (heuristic, rule-based, or model-backed) without altering the decision engine.

### 7.4 `DecisionEvaluatorPort` and Deterministic Rules
`DeterministicDecisionEvaluator` provides pure, side-effect free decision derivation:
1. `stopRequested === true` ➔ `Decision.STOP`
2. `observation.status === "CANCELLED"` ➔ `Decision.STOP`
3. `observation.status === "FAILED"` ➔ `Decision.FAIL` (Fail-Closed)
4. `observation.status === "SUCCESS"` + `goal ACHIEVED` ➔ `Decision.COMPLETE`
5. `observation.status === "SUCCESS"` + `goal NOT_ACHIEVED`:
   - If budget exhausted or maxSteps reached ➔ `Decision.STOP`
   - If next step exists in `Plan` ➔ `Decision.EXECUTE_STEP`
   - If plan exhausted without goal achievement ➔ `Decision.STOP` (or `Decision.FAIL` when configured)

---

## 8. Bounded Orchestration & Execution Loop (Increment #5)

Milestone v0.9 Increment #5 implements the `AutonomousOrchestrator` application service, connecting the complete operational cycle:

```text
Operation Submitted
       ↓
Operation Running
       ↓
PlannerPort.plan()
       ↓
      Plan
       ↓
Initial Decision (Step 1)
       ↓
 ┌────────────────────────────────────────────────────────┐
 │ Bounded Execution Loop (Strictly <= budget.maxSteps)   │
 │                                                        │
 │ 1. Pre-execution checks (Cancellation & Budget)       │
 │ 2. PolicyGateway.evaluate() [FAIL-CLOSED]              │
 │ 3. Submit Task ➔ CoreRuntime.execute()                │
 │ 4. RuntimeResult ➔ Observation Mapping                │
 │ 5. AutonomousOperation.recordStep()                    │
 │ 6. DecisionEvaluatorPort.evaluate()                    │
 │ 7. Decision Branching:                                │
 │    ├─ COMPLETE     ➔ Operation.complete() [TERMINAL]   │
 │    ├─ FAIL         ➔ Operation.fail()     [TERMINAL]   │
 │    ├─ STOP         ➔ Exhaust / Cancel     [TERMINAL]   │
 │    └─ EXECUTE_STEP ➔ Next Step in Plan    [ITERATE]    │
 └────────────────────────────────────────────────────────┘
```

### 8.1 Key Guarantees and Invariants
1. **CoreRuntime is the Sole Execution Owner**: `AutonomousOrchestrator` coordinates the domain entities and ports; it delegates 100% of real execution to `CoreRuntime`.
2. **Fail-Closed Continuous Governance**: Every planned step passes through `PolicyGateway`. If denied, execution does NOT reach `CoreRuntime`, and the operation terminates immediately with `FAILED`.
3. **Mathematically Bounded Loop**: The loop construct is a finite for-loop bounded by `budget.maxSteps`. Unbounded `while` constructs, daemons, background workers, and infinite polling are strictly excluded.
4. **Distinct Termination Modes**:
   - `CANCELLED`: Explicit operator cancellation signal.
   - `BUDGET_EXHAUSTED`: Reaching any budget bound (`STEPS_EXHAUSTED`, `DURATION_EXCEEDED`, `TOOLS_EXHAUSTED`).
   - `COMPLETED`: Objective confirmed achieved by `DecisionEvaluator`.
   - `FAILED`: Execution error or policy denial.
5. **Auditable Correlated Events**: All transitions and milestones emit domain events correlated by `operationId` (`operation.started`, `operation.step_completed`, `operation.completed`, `operation.failed`, `operation.cancelled`, `operation.budget_exhausted`, `policy.evaluated`, `policy.allowed`, `policy.denied`).

---

## 9. Platform API & Web Control Plane Integration (Increment #6)

Milestone v0.9 Increment #6 integrates Autonomous Operations into the platform control plane:

```text
Browser / HTTP Client
       ↓
Platform HTTP REST API (/api/v1/operations)
       ↓
PlatformService ──> AutonomousOperationService
                         ↓
                AutonomousOrchestrator
                         ↓
            OperationRepositoryPort (InMemory)
```

### 9.1 REST API Endpoints
Endpoints are available under `/api/v1/` and backward-compatible `/api/` prefixes:
- `GET /api/v1/operations`: Lists all operations with summary projections and current status.
- `GET /api/v1/operations/:id`: Fetches complete operational detail including budget, consumption, plan steps, observations, and decisions.
- `POST /api/v1/operations`: Submits and synchronously runs a bounded autonomous operation. Returns `201 Created` with full execution detail upon completion or termination.
- `POST /api/v1/operations/:id/cancel`: Requests cancellation of an active or pending operation with an optional reason.

### 9.2 Repository & Query Port Decoupling
- **`OperationRepositoryPort`**: Persists domain aggregate roots (`AutonomousOperation`, `Plan`, `Observation[]`, `Decision[]`).
- **`OperationQueryPort`**: Provides read projections (`OperationProjection`, `OperationDetailProjection`) decoupled from domain internals.
- **`InMemoryOperationRepository`**: Zero-dependency implementation enforcing copy-on-write and `Object.freeze()` on all stored snapshots and projections.

### 9.3 Application Service Layer
- **`AutonomousOperationService`**: Validates agent status, creates domain instances, tracks active `CancellationToken`s, and invokes `AutonomousOrchestrator` synchronously.

### 9.4 Web Platform Control Plane (SPA)
- Dedicated **Autonomous Operations** navigation tab with responsive operational overview.
- Operation submission form supporting configurable budget parameters (`maxSteps`, `maxDurationMs`, `maxToolCalls`, `maxTokens`).
- Reactive operations table with status badges, budget consumption progress, and cancellation controls.
- Interactive Operation Inspector displaying step timelines, observation outputs/errors, and decision evaluation rationales.
- **Security Invariant**: Strictly zero `innerHTML` usage across the Web UI (100% pure DOM APIs).

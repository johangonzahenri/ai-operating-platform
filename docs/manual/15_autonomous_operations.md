# Chapter 15: Bounded Autonomous Operations (v0.9 Preview)

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
| `maxSteps` | Maximum discrete planner-execution cycles | 5 – 25 steps | Transition to `EXHAUSTED` |
| `maxDurationMs` | Hard wall-clock timeout | 30s – 300s | Transition to `CANCELLED` |
| `maxToolCalls` | Cumulative ceiling on tool calls | 10 – 50 calls | Transition to `EXHAUSTED` |

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

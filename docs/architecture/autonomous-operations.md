# Autonomous Operations Architecture (v0.9 Proposal)

## 1. Executive Purpose & Architectural Boundary

The objective of milestone **v0.9** is to introduce **Bounded Autonomous Operations** to the `ai-operating-platform`.

### The Cardinal Rule of v0.9
> **DO NOT CONVERT AGENT INTO AN AUTONOMOUS LOOP.**
> An **Agent** remains a pure capability profile (identity, instructions, model binding, tool permissions, and memory partition).
> An **AutonomousOperation** is an independent, bounded operational supervisor that utilizes an Agent to achieve an objective across multiple governed steps.

---

## 2. Conceptual Component Architecture

```text
+-------------------------------------------------------------------------------+
|                             AUTONOMOUS OPERATION                              |
|  - id: string                                                                 |
|  - objective: string                                                          |
|  - agentId: string                                                            |
|  - budget: { maxSteps: number, maxDurationMs: number, maxToolCalls: number }  |
|  - status: PENDING | RUNNING | COMPLETED | FAILED | CANCELLED | EXHAUSTED      |
+---------------------------------------+---------------------------------------+
                                        |
                                        v
+-------------------------------------------------------------------------------+
|                                    PLANNER                                    |
|  (Vendor-agnostic abstraction: decomposes objective into next bounded action) |
+---------------------------------------+---------------------------------------+
                                        |
                                        v
+-------------------------------------------------------------------------------+
|                                   DECISION                                    |
|  (Explicit, structured action proposal: STOP, CALL_TOOL, QUERY_MODEL)         |
+---------------------------------------+---------------------------------------+
                                        |
                                        v
+-------------------------------------------------------------------------------+
|                                POLICY GATEWAY                                 |
|  (Mandatory Fail-Closed governance evaluation PER STEP)                       |
+---------------------------------------+---------------------------------------+
                                        |
                                        v
+-------------------------------------------------------------------------------+
|                                     TASK                                      |
|  (Single discrete step submitted to CoreRuntime)                              |
+---------------------------------------+---------------------------------------+
                                        |
                                        v
+-------------------------------------------------------------------------------+
|                                  CORE RUNTIME                                 |
|  (Single operational lifecycle: Task -> Execution -> AgentExecutionStrategy) |
+---------------------------------------+---------------------------------------+
                                        |
                                        v
+-------------------------------------------------------------------------------+
|                                  OBSERVATION                                  |
|  (Controlled, structured feedback from execution evaluated by Planner)        |
+-------------------------------------------------------------------------------+
```

---

## 3. Bounded Execution Limits (Autonomy Budget)

Under no circumstances will the platform implement unconstrained execution loops (`while(true)`). Every `AutonomousOperation` must declare an immutable budget:

1. `maxSteps`: Maximum number of discrete planning and execution cycles (e.g. 5 to 20).
2. `maxDurationMs`: Hard wall-clock timeout.
3. `maxToolCalls`: Hard cap on cumulative tool invocations.

### State Transitions:
```text
PENDING -> RUNNING -> COMPLETED (Objective achieved)
                   -> FAILED (Unrecoverable error or policy denial)
                   -> CANCELLED (Aborted by external operator)
                   -> EXHAUSTED (Budget limit reached before completion)
```

---

## 4. Policy Per Step (Continuous Fail-Closed Governance)

Autonomous operations do NOT bypass governance:
- A planner proposes a `Decision`.
- Before that decision is translated into a `Task`, `PolicyGateway` evaluates the proposed action.
- If policy returns `DENY` or policy evaluation fails, the operation immediately halts and enters `FAILED`.

---

## 5. Non-Goals for v0.9 (Explicit Exclusions)

The following capabilities are explicitly out of scope for v0.9:
1. **NO Self-Modifying Agents**: An agent cannot alter its own instructions, model, tools, or memory scope.
2. **NO Recursive Agent Spawning**: Agent A cannot instantiate Agent B, and Agent B cannot instantiate Agent C.
3. **NO Agent Swarms / Mesh Coordination**: Collaborative multi-agent negotiation belongs to future milestones.
4. **NO Background Unattended Daemons**: All operations are bound by synchronous or pollable execution contexts with active cancellation tokens.
5. **NO Provider SDK Coupling**: Planners and decision models must continue to interact through vendor-agnostic gateways.

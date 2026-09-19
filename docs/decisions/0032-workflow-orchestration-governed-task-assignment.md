# 0032. Workflow Orchestration & Governed Task Assignment

## Status

Accepted

## Context

Following the establishment of Virtual Organization Foundation (ADR 0027), Team Resource Governance (ADR 0028), Organizational Coordination Foundation (ADR 0030), and Agent Role, Responsibility & Capability Governance (ADR 0031), the AI Operating Platform requires a formal Workflow Orchestration layer connecting high-level business objectives to governed agent executions.

Key architectural invariants must be guaranteed:
1. **Separation of Concepts ($\text{Workflow} \neq \text{Task} \neq \text{Execution}$)**:
   - `WorkflowDefinition`: Structural declarative plan (DAG of steps, dependencies, required responsibilities/capabilities, retry policies).
   - `WorkflowInstance`: Runtime state machine tracking progression, step status, and data payload passing across the workflow DAG.
   - `Task`: Governed executable work unit dispatched to a specific assigned agent.
   - `Execution`: Concrete runtime execution instance monitored with distributed tracing.
2. **Canonical Governance Chain**:
   $$\text{Objective} \to \text{Workflow} \to \text{Steps} \to \text{Responsibility / Capability} \to \text{Agent Discovery} \to \text{PolicyGateway} \to \text{TeamResourceBudget} \to \text{Coordination} \to \text{Task} \to \text{Execution} \to \text{Event} \to \text{SSE} \to \text{Control Plane}$$
3. **Dynamic Governed Task Assignment**:
   Steps specify target functional criteria (`responsibility`, `requiredCapabilities`, `requiredRole`, or static `assignedAgentId`). If no static agent is specified, the system performs dynamic matching via `AgentProfileService.matchAgentForCoordination()`, evaluating against verified capabilities and team membership.
4. **Fail-Closed Security & Atomic Budgeting**:
   Every step execution strictly checks `PolicyGateway` (fail-closed) and pre-consumes from `TeamResourceBudgetService` before dispatching the underlying `Task` to `Runtime`.
5. **DAG Validation & Cycle Detection**:
   Workflow steps form a Directed Acyclic Graph (DAG) verified via Depth-First Search (DFS). Circular dependencies ($A \to B \to C \to A$) and self-references ($A \to A$) are rejected at creation and update time.
6. **Optimistic Concurrency Control (OCC) & Multi-Tenant Isolation**:
   Both `WorkflowDefinition` and `WorkflowInstance` enforce OCC version incrementing and prevent cross-tenant discovery, execution, or modification.

## Decision

We introduce **Workflow Orchestration & Governed Task Assignment** under `src/domain/workflow/`, `src/application/workflow/`, and persistence adapters in `src/infrastructure/persistence/`:

1. **Domain Models**:
   - `WorkflowDefinition`: Manages DAG validation, step ordering, lifecycle states (`DRAFT` -> `ACTIVE` -> `ARCHIVED`), and immutable step definitions.
   - `WorkflowInstance`: Manages execution lifecycle (`PENDING` -> `RUNNING` -> `PAUSED` -> `COMPLETED`/`FAILED`/`CANCELLED`), step states (`PENDING`, `ASSIGNING`, `DISPATCHED`, `RUNNING`, `COMPLETED`, `FAILED`, `SKIPPED`), bounded step retries, and data payload passing.
   - `WorkflowErrors`: Dedicated error hierarchy (`WorkflowValidationError`, `WorkflowNotFoundError`, `WorkflowInstanceNotFoundError`, `WorkflowConcurrencyConflictError`, `WorkflowCycleError`, `WorkflowStateTransitionError`, `WorkflowExecutionError`, `NoEligibleAgentFoundError`).
2. **Application Service (`WorkflowOrchestratorService`)**:
   - Definition management: `createDefinition()`, `updateDefinition()`, `activateDefinition()`, `archiveDefinition()`, `getDefinition()`, `listDefinitions()`, `deleteDefinition()`.
   - Instance orchestration: `startWorkflow()`, `advanceWorkflow()`, `pauseWorkflow()`, `resumeWorkflow()`, `cancelWorkflow()`, `getInstance()`, `listInstances()`.
   - Governed step execution loop integrating `AgentProfileService`, `PolicyGateway`, `TeamResourceBudgetService`, and `Runtime`.
3. **Domain Events & Observability**:
   - 9 registered event types: `workflow.created`, `workflow.updated`, `workflow.started`, `workflow.step.started`, `workflow.step.completed`, `workflow.step.failed`, `workflow.completed`, `workflow.failed`, `workflow.cancelled`.
4. **Persistence Repositories**:
   - `InMemoryWorkflowDefinitionRepository` & `InMemoryWorkflowInstanceRepository` with OCC.
   - `SqliteWorkflowDefinitionRepository` & `SqliteWorkflowInstanceRepository` backed by SQLite WAL tables `workflow_definitions` and `workflow_instances`.
5. **Platform REST API & Client SDK**:
   - Full REST endpoints under `/api/v1/workflows*`.
   - Typed client SDK `client.workflows.*` in `@ai-platform/client` and web API client.
   - Localization dictionaries (`es-419` / `en`).

## Consequences

- Bridges high-level objectives and low-level agent tasks through structured, governable workflows.
- Dynamic agent matching assigns tasks based on declared and verified functional capabilities rather than hardcoded agent IDs.
- Fail-closed security and resource budgets are preserved across complex multi-step pipelines.
- 0 runtime dependencies outside `node:*` and full backwards compatibility preserved.

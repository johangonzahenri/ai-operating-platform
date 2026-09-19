# 0033. Workflow Verification & Result Validation

## Status

Accepted

## Context

Following Workflow Orchestration & Governed Task Assignment (ADR 0032), the AI Operating Platform introduces a formal verification and result validation subsystem.

A central design principle governs this subsystem:

$$\text{Execution Status} \neq \text{Verification Verdict}$$

Technically completing an execution (`status === "COMPLETED"`) does **not** imply that the result produced is semantically valid, structurally compliant, or invariant-preserving. An execution may succeed while producing empty, corrupted, out-of-bounds, conflicting, or maliciously poisoned outputs.

Key architectural invariants must be guaranteed:
1. **Separation of Execution and Verification**:
   $$\text{Execution} \to \text{Result} \to \text{Verification} \to \text{Verdict} \to \text{Workflow Transition}$$
2. **Canonical Verdicts**:
   - `PASS`: The result strictly satisfies all presence, schema, range, and invariant rules.
   - `FAIL`: The result explicitly violates one or more specified validation rules.
   - `MISSING`: The expected output payload is absent or empty.
   - `MALFORMED`: The output payload does not conform to the expected schema or field types.
   - `CONFLICT`: Contradictory evidence or mutually exclusive fields detected.
   - `AMBIGUOUS`: Output is underspecified or satisfies multiple incompatible interpretations.
3. **Producer-Verifier Segregation (Segregation of Duties)**:
   An agent or principal that produced the result **cannot** self-certify:
   $$\text{producerPrincipalId} \neq \text{verifierPrincipalId}$$
   Any attempt by an agent or user to verify its own execution fails closed with `SelfVerificationError`.
4. **Deterministic & Rule-Based Verification**:
   Verification operates first on deterministic assertions (schema checks, required fields, allowed enum values, numeric bounds, structural invariants) without non-deterministic or open-ended LLM judges.
5. **Workflow Step Transition Blocking**:
   Dependent workflow steps cannot execute unless their preceding prerequisite steps have achieved `verificationVerdict === "PASS"`. If verification produces any non-PASS verdict (`FAIL`, `MISSING`, `MALFORMED`, `CONFLICT`, `AMBIGUOUS`), the dependent steps remain unexecutable and the workflow transitions to `FAILED`.
6. **Optimistic Concurrency Control (OCC) & Multi-Tenant Isolation**:
   `VerificationResult` enforces strict tenant scoping and monotonic OCC versioning. Cross-tenant access is rejected fail-closed.

## Decision

We introduce **Workflow Verification & Result Validation** under `src/domain/workflow/`, `src/application/workflow/`, and persistence adapters in `src/infrastructure/persistence/`:

1. **Domain Models**:
   - `VerificationResult`: Aggregate root tracking `id`, `tenantId`, `workflowId`, `workflowInstanceId`, `workflowStepId`, `taskId`, `executionId`, `producerPrincipalId`, `verifierPrincipalId`, `verifierSource` (`SYSTEM` | `AGENT` | `HUMAN` | `RULE_ENGINE`), `verdict` (`PASS` | `FAIL` | `MISSING` | `MALFORMED` | `CONFLICT` | `AMBIGUOUS`), `method` (`DETERMINISTIC_RULES` | `SCHEMA_VALIDATION` | `INVARIANT_CHECK` | `CROSS_AGENT_ATTESTATION` | `HUMAN_IN_THE_LOOP`), `evidence`, `reason`, `verifiedAt`, and `version`.
   - `WorkflowStepVerificationRule`: Verification policy embedded in `WorkflowStepDefinition` specifying required fields, schema definition, allowed values, value ranges, and invariant checks (`non-empty-object`, `no-null-fields`, `conflict`, `ambiguous`).
   - `VerificationErrors`: Dedicated error hierarchy (`VerificationError`, `VerificationValidationError`, `VerificationNotFoundError`, `SelfVerificationError`, `VerificationConcurrencyConflictError`, `VerificationPolicyDeniedError`).
2. **Application Services**:
   - `DeterministicVerifier`: Pure validation engine evaluating outputs against presence, schema types, allowed values, bounds, and invariants.
   - `WorkflowVerificationService`: Orchestrates step verification, enforces producer $\neq$ verifier separation, queries `PolicyGateway`, persists `VerificationResult`, updates `WorkflowInstance` step state (`verificationVerdict`, `verificationId`), and emits domain events.
3. **Workflow Orchestration Integration**:
   - `WorkflowOrchestratorService` integrates automatic step verification on step completion when a step specifies `verificationRule`.
   - `WorkflowInstance.getNextRunnableStepIds()` checks `verificationVerdict === "PASS"` on dependency steps requiring verification before enabling downstream steps.
4. **Domain Events & Observability**:
   - 3 registered event types: `workflow.step.verification.requested`, `workflow.step.verification.completed`, `workflow.step.verification.failed`.
5. **Persistence Repositories**:
   - `InMemoryVerificationResultRepository` with OCC and tenant filtering.
   - `SqliteVerificationResultRepository` backed by SQLite WAL table `verification_results` with indices on tenant, instance, execution, step, and verdict.
6. **Platform REST API & Client SDK**:
   - REST endpoints: `POST /api/v1/verifications`, `GET /api/v1/verifications`, `GET /api/v1/verifications/:id`, `GET /api/v1/workflows/instances/:instanceId/verifications`, `GET /api/v1/executions/:executionId/verifications`.
   - Typed client SDK `client.verifications.*` and Web client methods.
   - UI and localization dictionaries (`es-419` / `en`).

## Consequences

- Formally decouples technical execution status from factual and structural result validity.
- Prevents cascade failures where subsequent workflow steps operate on corrupted or unverified outputs.
- Segregation of duties prevents agents from validating their own output, eliminating self-collusion and single-agent hallucination leakage.
- Strict 0 external runtime dependencies preserved (`node:*` only).

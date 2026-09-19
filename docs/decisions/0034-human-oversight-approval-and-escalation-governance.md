# 0034. Human Oversight, Approval & Escalation Governance

## Status

Accepted

## Context

Following Workflow Verification & Result Validation (ADR 0033), the AI Operating Platform introduces a formal, governed subsystem for human oversight, approval, and escalation.

Human oversight is governed by fundamental architectural invariants:

$$\text{Workflow} \to \text{Step} \to \text{Execution} \to \text{Verification} \to \text{Verdict} \to \text{Human Oversight} \to \text{Decision} \to \text{Resume / Reject / Escalate / Expire}$$

$$\text{Human Oversight} \neq \text{Authorization Bypass}$$

Key architectural invariants enforced:
1. **Human Oversight is Not a Universal Bypass**:
   Human decisions remain subject to `PolicyGateway` rules, tenant isolation, RBAC role validation, explicit authority scope, audit recording, and replay protection. A human decision cannot authorize an action globally denied by security policy ($\text{POLICY DENY} + \text{HUMAN APPROVED} = \text{DENY}$).
2. **Segregation of Duties**:
   A requester or producer cannot approve their own request or output:
   $$\text{requesterPrincipalId} \neq \text{approverPrincipalId} \quad \text{and} \quad \text{producerPrincipalId} \neq \text{approverPrincipalId}$$
   Self-approval attempts are rejected fail-closed with `SelfApprovalError`.
3. **Approval State Machine & Monotonic Terminal Transitions**:
   Valid lifecycle: `REQUESTED` $\to$ `REVIEWING` $\to$ `APPROVED` | `REJECTED` | `ESCALATED` | `EXPIRED` | `CANCELLED`.
   Terminal states are monotonic and cannot be reversed or re-decided.
4. **Approval Authority Representation**:
   Approval authority is explicit and scoped by tenant, organization, area, team, and required role (`REVIEWER`, `LEAD`), preventing arbitrary administrator overrides.
5. **Multi-Tenant Isolation**:
   Cross-tenant approval viewing or decision making is strictly rejected fail-closed at domain and persistence layers (`ApprovalTenantMismatchError`).
6. **Optimistic Concurrency Control (OCC) & Idempotency**:
   Simultaneous reviewer decisions are mediated deterministically via OCC version checks. Double-decision submissions fail closed with `ApprovalConcurrencyConflictError`.

## Decision

We introduce **Human Oversight, Approval & Escalation Governance** across `src/domain/workflow/`, `src/application/workflow/`, `src/infrastructure/persistence/`, and `src/platform/`:

1. **Domain Models**:
   - `ApprovalRequest`: Aggregate Root managing approval lifecycle, purpose, authority, requester/producer/reviewer/approver identities, decision metadata, expiration, and OCC versioning.
   - `ApprovalAuthority`: Interface declaring required tenant, organization, team, role, and permission scope.
   - `ApprovalErrors`: Dedicated error hierarchy (`ApprovalError`, `ApprovalValidationError`, `ApprovalNotFoundError`, `SelfApprovalError`, `ApprovalExpiredError`, `ApprovalConcurrencyConflictError`, `ApprovalPolicyDeniedError`, `ApprovalTenantMismatchError`, `ApprovalInvalidStateTransitionError`, `UnauthorizedApproverError`).
2. **Domain Events & Observability**:
   - 7 registered event types: `approval.requested`, `approval.reviewing`, `approval.approved`, `approval.rejected`, `approval.expired`, `approval.cancelled`, `approval.escalated`.
3. **Application Services**:
   - `HumanOversightService`: Orchestrates the lifecycle of approval requests, enforces PolicyGateway preflight and decision evaluation, checks reviewer team/role authority, enforces segregation of duties, updates workflow step state upon decision, and publishes domain events.
   - Integration with `WorkflowOrchestratorService` to trigger approval requests when `stepDef.requiresApproval === true` or verification returns `AMBIGUOUS`/`CONFLICT`.
4. **Persistence Repositories**:
   - `ApprovalRequestRepositoryPort`: Abstract repository port.
   - `InMemoryApprovalRequestRepository`: In-memory implementation with OCC and tenant filtering.
   - `SqliteApprovalRequestRepository`: Durable SQLite WAL repository creating table `approval_requests` with indexes on tenant, instance, step, status, and expiration.
5. **Platform REST API & Client SDK**:
   - REST endpoints: `POST /api/v1/approvals`, `GET /api/v1/approvals`, `GET /api/v1/approvals/:id`, `POST /api/v1/approvals/:id/review`, `POST /api/v1/approvals/:id/approve`, `POST /api/v1/approvals/:id/reject`, `POST /api/v1/approvals/:id/cancel`, `POST /api/v1/approvals/:id/escalate`, `GET /api/v1/workflows/instances/:instanceId/approvals`.
   - Typed SDK methods on `client.approvals.*` and Web `api-client.js`.
   - Localization in `locale-en.js` and `locale-es-419.js`.

## Consequences

- Workflows can safely pause and request human authorization for critical, ambiguous, or high-risk steps without sacrificing security or auditability.
- Segregation of duties prevents self-approval collusion.
- Multi-tenant boundary guarantees complete isolation of oversight requests.
- Preserves zero external runtime dependencies (`node:*` only) and zero DOM security vulnerabilities (0 `.innerHTML`).

# 0009. Observability and governance boundaries

Date: 2026-09-06
Status: Accepted

## Decision

Observability is implemented as an isolated event subscriber that maps correlated events to `AuditLog` observations and `MetricsCollector` values. Governance is a separate `PolicyGateway` evaluated at the orchestration-operation boundary before Model or Tool invocation.

## Consequences

Audit/metrics failure cannot fail a valid execution because the event publisher isolates subscribers. Policy denial stops the operation with `PolicyDeniedError`; policy evaluation failure is fail-closed through `PolicyEvaluationError`. Policies use generic operation type/resource IDs, not provider or tool implementation details. No authentication, RBAC, policy DSL, distributed metrics or platform UI is introduced.

# Observability and governance

**Observability asks “what happened?”** Events retain trace, execution, task and operation correlations. `EventObservabilitySubscriber` maps them to structured `Observation` records in `AuditLog` and bounded-name counters in `MetricsCollector`. In-memory adapters provide timeline and correlation queries for v0.6. Observations record IDs, types and metadata—not full prompts, model output or memory contents.

**Governance asks “what was allowed?”** Before a declared orchestration operation invokes a Model or Tool gateway, `PolicyGateway` evaluates generic `PolicyContext`. Allow continues execution; deny produces `PolicyDeniedError` and stops the sequence. If policy evaluation is unavailable, the engine fails closed instead of assuming allow.

Observability does not make policy decisions. Governance does not own audit storage. Memory, context, tools and models remain separate capabilities. Authentication, RBAC and Platform API/UI are future work.

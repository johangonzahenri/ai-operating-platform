# ADR-004: Default-Deny Authorization and Application Capability Scoping

## Status
Accepted

## Context
External applications and callers must only access explicitly permitted capabilities and tools.

## Decision
Enforce default-deny across the platform:
- Applications must be registered with an explicit list of allowedCapabilities.
- Unregistered operations or unauthenticated requests fail immediately with 401 Unauthorized or 403 Forbidden.
- Tool invocations require explicit RBAC permissions and approval gates for critical risk levels.

## Alternatives Considered
- Permissive default with blacklist: rejected due to security risk of omission.

## Consequences
- Predictable and auditable security perimeter.
- Fail-closed behavior on all unrecognized actions.

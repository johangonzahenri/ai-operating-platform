# ADR-003: SecurityContext and Trusted Principal Identification

## Status
Accepted

## Context
Multi-tenant and multi-role operations require trusted principal identification without caller tampering or permission escalation.

## Decision
Implement an immutable SecurityContext containing a verified Principal (USER, SERVICE, SYSTEM, ANONYMOUS), roles, tenant binding, and correlation identifiers. All security boundary checks evaluate against this context fail-closed.

## Alternatives Considered
- Passing raw HTTP headers directly to domain handlers: rejected as insecure and unverified.

## Consequences
- Prevents cross-tenant leaks and privilege escalation.
- Full traceability of caller identities in audit logs.

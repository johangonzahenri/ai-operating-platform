# ADR 0040: Enterprise API Authentication, Authorization & Credential Governance

## Status
ACCEPTED

## Context
As the **AI Operating Platform (AOP)** matures into a multi-tenant enterprise operating system powering multiple distinct applications (Tentaciones AI Commerce, Vehicle Parts Platform, Enterprise Support Agent), external consumers and services must be authenticated, authorized, and governed under zero-trust principles.

Prior milestones utilized role-based authorization and simple API key records. However, enterprise deployment requires:
1. Strong cryptographic binding between external credentials, verified `Principal` identities (`SERVICE`, `HUMAN`, `AGENT`, `TOOL`), `tenantId`, `applicationId`, and explicit capability `scopes`.
2. Zero-plaintext credential storage where raw API keys are presented strictly once and persisted only as SHA-256 hashes with timing-safe comparison.
3. Server-side fail-closed authorization with header reconciliation (rejecting tenant/application spoofing).
4. Full credential lifecycle management (generation, rotation with grace period, revocation, deletion) via REST API, SDK, and Web Control Plane.

Fundamental invariants:
$$\text{Authentication} \neq \text{Authorization}$$
$$\text{Identity} \neq \text{Authority}$$
$$\text{Autonomy} \neq \text{Authority}$$
$$\text{Default-Deny} + \text{Timing-Safe Equality} + \text{Zero-Plaintext Storage} + \text{Tenant Isolation}$$

## Decision
We implemented Enterprise Authentication, Authorization & Credential Governance across the domain, application, infrastructure, API, SDK, and Web Control Plane layers.

Key architectural elements:
1. **Aggregate Root (`ApiCredential`)**:
   - Manages credential lifecycle (`ACTIVE`, `EXPIRED`, `REVOKED`), timing-safe secret verification (`crypto.timingSafeEqual`), scope evaluation with wildcard hierarchy, immutable usage tracking (`recordUsage`), rotation, and revocation.
2. **Zero-Plaintext Storage (`ApiCredentialRepositoryPort` & `SqliteApiCredentialRepository`)**:
   - Raw keys (`aop_live_<id>_<entropy>`) generated with 256-bit cryptographically secure entropy.
   - Persisted strictly as `keyHash` (SHA-256) and `keyPrefix` (`aop_live_<id_prefix>`) in durable SQLite WAL with composite indices `(tenant_id, status)` and `(principal_id, tenant_id)`.
3. **Fail-Closed Header & Identity Reconciliation**:
   - Protected endpoints require `Authorization: Bearer <API_KEY>` or `X-API-Key: <API_KEY>`.
   - Contradictory auth headers are rejected (`CONTRADICTORY_AUTH_HEADERS`).
   - Client-provided `X-Tenant-Id` and `X-Application-Id` are reconciled against authenticated `SecurityContext`, rejecting mismatches with `403 FORBIDDEN` (`TENANT_MISMATCH`, `APPLICATION_MISMATCH`).
   - Secrets are redacted in all server logging (`Authorization: [REDACTED]`).
4. **Scope-Based Capability Authorization**:
   - Operations require granular capability scopes (`tasks.read`, `tasks.create`, `devices.print`, `autonomous.operations.execute`, `credentials.manage`, `*`).
5. **Rotation with Grace Period**:
   - `rotateCredential` allows instantaneous replacement or configurable zero-downtime grace periods where the old credential remains active for a window before automatic expiration.
6. **PlatformClient SDK & Web Control Plane**:
   - `client.credentials` namespace (`list`, `create`, `get`, `rotate`, `revoke`, `delete`).
   - Web Control Plane `#tab-security` provides an interactive Credential Governance console with one-time raw key revelation and zero `innerHTML` (strict DOM APIs).

## Consequences
### Positive
- Enterprise-grade zero-trust authentication and capability authorization across all platform consumers.
- Complete elimination of plaintext secret exposure in databases, logs, or UI reloads.
- Seamless, zero-downtime credential rotation for distributed enterprise services.
- Resilient multi-tenant boundary isolation.

### Invariants Maintained
- Zero runtime external npm dependencies (`node:*` standard library only).
- Strict DOM generation in UI (**0 `.innerHTML`**).
- Full backwards compatibility with health checks and public whitelisted endpoints.

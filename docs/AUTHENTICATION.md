# Phase 13 — Security: Identity & Authentication Architecture

## 1. Overview

The AI Operating Platform enforces strict verification of caller identity prior to authorizing execution. Authentication operates as the first gateway in the security pipeline:

```text
CREDENTIALS (API Key / Bearer JWT)
                ↓
    AUTHENTICATION SERVICE
                ↓
       VERIFIED PRINCIPAL
                ↓
        SECURITY CONTEXT
                ↓
      FAIL-CLOSED AUTHORIZATION
                ↓
         POLICY GATEWAY
```

---

## 2. Core Concepts & Boundaries

### 2.1 Principal
A `Principal` represents an authenticated or anonymous actor in the platform:
- **`HUMAN`**: User or operator.
- **`SERVICE`**: Background service, microservice, or integration.
- **`AGENT`**: Autonomous AI agent operating within the platform.
- **`TOOL`**: Specialized tool adapter.
- **`SYSTEM`**: Internal trusted platform runtime.

> **Security Invariant**: External API keys and Bearer JWTs are explicitly blocked from claiming the `SYSTEM` principal type to prevent privilege escalation.

### 2.2 SecurityContext
The `SecurityContext` encapsulates the verified `Principal`, authentication status, `traceId`/`correlationId`, and optional tenant isolation identifier.
- Authenticated requests yield `authenticated: true`.
- Requests lacking credentials resolve deterministically to `SecurityContext.anonymous()`, which has `authenticated: false` and minimal roles/permissions.

---

## 3. Supported Credential Providers

### 3.1 API Key Provider (`ApiKeyAuthenticationProvider`)
- **Key Storage & Hashing**: API keys are stored hashed with SHA-256 (`crypto.createHash('sha256')`). Raw secrets are never stored at rest.
- **Verification**: Verifies secret using timing-safe comparisons (`crypto.timingSafeEqual`) on byte buffers to eliminate timing side-channel attacks.
- **Accepted Formats**:
  - `keyId.secret`
  - `ak_<keyId>_<secret>`
  - `keyId:secret`
- **Supported Headers**:
  - `X-API-Key: keyId.secret`
  - `Authorization: ApiKey keyId.secret`
- **Lifecycle Checks**:
  - `ACTIVE`: Key is valid and active.
  - `REVOKED`: Key is immediately rejected with code `KEY_REVOKED`.
  - `EXPIRED`: Key past `expiresAt` or status `EXPIRED` is rejected with code `KEY_EXPIRED`.

### 3.2 Bearer Token Provider (`BearerTokenAuthenticationProvider`)
- **Format**: Standard JSON Web Token (JWT) `header.payload.signature`.
- **Algorithm Enforcement**:
  - Strictly allows configured algorithms (`HS256`, `RS256`).
  - Rejects `alg: none` or missing algorithms fail-closed.
- **Signature Verification**:
  - `HS256`: Verified with HMAC SHA-256 and `crypto.timingSafeEqual`.
  - `RS256`: Verified with RSA-SHA256 asymmetric public keys.
- **Claims Verification**:
  - `exp`: Token expiration checked against runtime clock with optional tolerance.
  - `nbf`: Not-before timestamp verification.
  - `iss`: Issuer verification when configured.
  - `aud`: Audience verification when configured.
  - `sub`: Principal ID mapping.
- **Supported Headers**:
  - `Authorization: Bearer <jwt>`
  - `X-Agent-Token: <jwt>`

---

## 4. Separation of Authentication vs Authorization

- **Authentication** answers: *"Who are you, and is your credential authentic and active?"*
- **Authorization** answers: *"Are you permitted to execute this action on this resource in this scope?"*

An authenticated principal (`authenticated: true`) will still be denied by the Policy Gateway if it lacks the required fine-grained permissions (e.g. `tool.calculator` or `agent.spawn`).

---

## 5. Security & Observability

### 5.1 Secret Sanitization
Raw secrets and tokens are never included in error messages, logs, or domain event payloads.

### 5.2 Domain Events
Authentication emits auditable domain events:
- `auth.succeeded`: Authenticated successfully.
- `auth.failed`: Invalid secret, bad JWT format, unsupported algorithm, or key not found.
- `auth.revoked`: Revoked API key access attempt.
- `auth.expired`: Expired API key or JWT access attempt.

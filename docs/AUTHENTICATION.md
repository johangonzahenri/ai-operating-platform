# Enterprise API Authentication Architecture (`AOP-AUTH-01`)

## 1. Overview & Architectural Principles

The **AI Operating Platform (AOP)** implements enterprise-grade, zero-trust API authentication for all external consumers, services, operators, and autonomous subsystems.

```text
                                  AUTHENTICATION PIPELINE
                                  
  External Client                                                  Platform API Gateway
┌───────────────────────┐                                       ┌─────────────────────────┐
│ Authorization: Bearer │                                       │ 1. Header Validation    │
│ aop_live_cred1_...    │ ─── (1) HTTP Request ────────────────>│   - Check format        │
└───────────────────────┘                                       │   - Redact from logs    │
                                                                │ 2. Contradiction Check  │
                                                                │ 3. Timing-Safe Hash     │
                                                                │ 4. Expiration & Status  │
                                                                │ 5. Tenant Match Check   │
                                                                │ 6. Principal Binding    │
                                                                └────────────┬────────────┘
                                                                             │
                                                                 (2) Populated SecurityContext
                                                                             │
                                                                             ▼
                                                                ┌─────────────────────────┐
                                                                │  Fail-Closed Execution  │
                                                                └─────────────────────────┘
```

### Core Invariants
1. **$Authentication \neq Authorization$**: Establishing cryptographic proof of caller identity does not grant authority to perform operations or access arbitrary resources.
2. **$Identity \neq Authority$**: Identity verifies who is calling (`Principal`, `tenantId`, `applicationId`); authority governs what capabilities are granted (`scopes`, `RBAC`).
3. **$Autonomy \neq Authority$**: Autonomous agents and triggers operate strictly within bounded capability envelopes.
4. **Zero Plaintext Storage**: Raw API keys (`aop_live_<credId>_<secret>`) are generated cryptographically and presented strictly once to the client. Only timing-safe SHA-256 hashes (`keyHash`) and safe display prefixes (`keyPrefix`) are persisted.
5. **Fail-Closed Boundary**: Any unauthenticated, expired, revoked, malformed, or cross-tenant request to protected endpoints is rejected immediately.

---

## 2. Supported Authentication Schemes

The platform natively supports the following header schemes over HTTP loopback (127.0.0.1:3000):

| Header Scheme | Format | Description |
| :--- | :--- | :--- |
| `Authorization: Bearer <API_KEY>` | `Bearer aop_live_<credId>_<secret>` | Standard OAuth2/OIDC Bearer format for service-to-service calls |
| `X-API-Key: <API_KEY>` | `aop_live_<credId>_<secret>` | Direct API key header for SDK clients and automated consumers |
| `X-Agent-Token: <TOKEN>` | JWT / HMAC Signed Token | Internal token exchange for subagent dispatch and worker nodes |

### Contradictory Header Rejection
If a request supplies multiple contradictory authentication headers (e.g., `Authorization: Bearer keyA` and `X-API-Key: keyB` pointing to conflicting credentials), the gateway rejects the request with `400 BAD_REQUEST` (`CONTRADICTORY_AUTH_HEADERS`) to prevent ambiguous identity delegation.

---

## 3. Public vs. Protected Endpoints Whitelist

### Public Routes (No Authentication Required)
- `GET /api/v1/health`, `GET /health`
- `GET /api/v1/health/live`, `GET /health/live`, `GET /liveness`
- `GET /api/v1/health/ready`, `GET /health/ready`, `GET /readiness`
- `GET /api/v1/status`, `GET /status`
- `GET /api/v1/diagnostics`
- Static Web Control Plane assets (`/`, `/index.html`, `/app.js`, `/styles.css`, `/i18n/*`)

### Protected Routes (Strict Authentication & Capability Verification)
All `/api/v1/*` business and control plane endpoints require authenticated credentials:
- Tasks (`/api/v1/tasks`, `/api/v1/tasks/:id/execute`, `/api/v1/tasks/:id/cancel`)
- Executions (`/api/v1/executions/*`)
- Autonomous Operations (`/api/v1/operations/*`, `/api/v1/autonomous/*`)
- Devices & Hardware Printing (`/api/v1/devices/*`, `/api/v1/printing/*`)
- Organization & Virtual Teams (`/api/v1/organizations/*`, `/api/v1/teams/*`)
- Workflows & Solutions (`/api/v1/workflows/*`, `/api/v1/solutions/*`)
- Credential Governance (`/api/v1/credentials/*`)
- Events & Audit Streams (`/api/v1/events/*`, `/api/v1/audit/*`)

---

## 4. Tenant & Application Reconciliation

External callers often provide contextual routing headers (`X-Tenant-Id`, `X-Application-Id`).
The platform gateway strictly reconciles these headers against the verified `SecurityContext`:

- If `X-Tenant-Id` differs from the authenticated `credential.tenantId`, the gateway returns `403 FORBIDDEN` (`TENANT_MISMATCH`).
- If `X-Application-Id` differs from the authenticated `credential.applicationId`, the gateway returns `403 FORBIDDEN` (`APPLICATION_MISMATCH`).

```json
{
  "error": "Authenticated tenant does not match X-Tenant-Id header",
  "status": 403,
  "code": "TENANT_MISMATCH",
  "requestId": "req_88a91c0b",
  "correlationId": "corr_229f0a",
  "timestamp": "2026-09-19T20:30:00.000Z"
}
```

---

## 5. Security Context & Principal Model

Upon successful authentication, the gateway instantiates an immutable `SecurityContext`:

```typescript
export interface SecurityContext {
  readonly principal: Principal;
  readonly authenticated: boolean;
  readonly tenantId: string;
  readonly correlationId: string;
  readonly requestId?: string;
  readonly metadata?: {
    readonly credentialId: string;
    readonly applicationId: string;
    readonly keyPrefix: string;
    readonly scopes: readonly string[];
  };
}
```

This context is propagated downstream across all use cases, audit loggers, and policy evaluators.

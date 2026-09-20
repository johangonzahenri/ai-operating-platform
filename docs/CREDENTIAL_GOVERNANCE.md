# API Credential Governance & Zero-Plaintext Storage (`AOP-AUTH-03`)

## 1. Overview & Security Posture

The **API Credential Governance Subsystem** manages the complete cryptographic lifecycle of platform credentials.

```text
                           CREDENTIAL LIFECYCLE STATE MACHINE
                           
                                  ┌────────────────┐
                                  │    CREATED     │
                                  └───────┬────────┘
                                          │
                                          ▼
                                  ┌────────────────┐
                   ┌─────────────>│     ACTIVE     │──────────────┐
                   │              └───────┬────────┘              │
                   │                      │                       │
     (Rotate with grace period)    (TTL Exceeded)          (Explicit Revocation /
                   │                      │                 Compromise Event)
                   │                      ▼                       │
                   │              ┌────────────────┐              ▼
                   └──────────────│    EXPIRED     │      ┌────────────────┐
                                  └────────────────┘      │    REVOKED     │
                                                          └────────────────┘
```

---

## 2. Zero-Plaintext Storage Model

To prevent secret leakage via database dumps, logs, or debugging outputs, raw API keys are never stored on disk:

1. **Key Generation**:
   - `credentialId`: `cred_<16_hex_entropy>`
   - `secretEntropy`: `crypto.randomBytes(32).toString('hex')` (256 bits)
   - `rawKey`: `aop_live_<credentialId>_<secretEntropy>`
   - `keyPrefix`: `aop_live_<credentialId_first_8>`
   - `keyHash`: `SHA-256(rawKey)` (hex encoded)
2. **One-Time Presentation**:
   - The `rawKey` is returned in the response payload strictly once at initial creation or rotation.
3. **Storage**:
   - The durable persistence engine (SQLite WAL) stores strictly: `id`, `principalId`, `principalType`, `tenantId`, `applicationId`, `name`, `keyPrefix`, `keyHash`, `status`, `scopes`, `createdAt`, `expiresAt`, `revokedAt`, `lastUsedAt`, `version`.
4. **Verification**:
   - Verification extracts the ID/hash from the inbound request and performs timing-safe hash comparison via `crypto.timingSafeEqual()`.

---

## 3. Rotation Strategies & Zero-Downtime Migration

The platform supports seamless credential rotation:

- **Immediate Revocation (`gracePeriodMs: 0`)**: Instantly revokes the old credential and activates the new one. Recommended for suspected key compromise.
- **Grace Period Migration (`gracePeriodMs > 0`)**: Retains the old key in an active grace state for a defined duration (e.g. 1 hour, 24 hours, 7 days) while activating the new key immediately. Allows distributed consumers to roll keys without service downtime.

---

## 4. Audit Trail & Domain Events

Every credential lifecycle event publishes durable domain events to SQLite WAL:

| Event Type | Aggregate | Payload |
| :--- | :--- | :--- |
| `auth.credential.created` | `credentialId` | `principalId`, `tenantId`, `applicationId`, `keyPrefix`, `scopes`, `expiresAt` |
| `auth.credential.used` | `credentialId` | `principalId`, `tenantId`, `applicationId`, `requestId` |
| `auth.credential.rotated` | `credentialId` | `oldCredentialId`, `newCredentialId`, `gracePeriodMs` |
| `auth.credential.revoked` | `credentialId` | `principalId`, `tenantId`, `reason`, `revokedAt` |
| `auth.authentication.failed` | `credentialId` | `code`, `reason`, `requestId` |

---

## 5. Web Control Plane Governance Console

Operators can view, create, rotate, and revoke credentials directly in the **Web Control Plane** under **Security Center** (`#tab-security`):
- Real-time display of key status, last usage, and scopes.
- Safe modal for one-time key copying.
- Instant revocation with confirmation modals.
- Strict DOM safety: zero `innerHTML` across all rendering pipelines.

# 0025. Asymmetric JWT Token Verification and Key Rotation

## Status

Accepted

## Context

Prior to Phase 55, bearer token authentication in the platform used development scaffolding (`DevScaffoldTokenVerifier`) limited to symmetric HMAC-SHA256 (`HS256`). There was no native mechanism for asymmetric cryptographic signatures (RS256, ES256), public key verification, or dynamic key rotation (**GAP-03**).

In enterprise cloud deployments, authentication tokens are issued by external identity providers (OIDC / OAuth2 / Okta / Azure AD / Keycloak) signing tokens with asymmetric private keys.

## Decision

We implement `JwtTokenVerifier` in `src/infrastructure/security/jwt-token-verifier.ts` implementing `BearerTokenVerifier`:

1. **Cryptographic Standards via `node:crypto`**:
   - `RS256`: RSA-SHA256 asymmetric signature verification with PEM/SPKI public keys.
   - `ES256`: ECDSA (P-256) SHA256 asymmetric signature verification.
   - `HS256`: Symmetric HMAC-SHA256 fallback with timing-safe comparison.
2. **KeyStore with Rotation**:
   - In-memory key store supporting multiple keys indexed by `kid` (Key ID).
   - Dynamic revocation (`revokeKey(kid)`), immediately invalidating tokens signed with compromised or retired keys.
3. **Claim Validation & Boundary Enforcement**:
   - Enforces clock skew tolerance (`clockToleranceSec`).
   - Validates `exp` (expiration), `nbf` (not-before), `iss` (issuer), and `aud` (audience).
   - Rejects `alg: "none"` and algorithm mismatch attacks.
   - Maps `sub`, `roles`, and `tenantId` into typed domain `BearerTokenClaims`.

## Consequences

- **GAP-03 is permanently resolved**.
- Enterprise OIDC tokens can be verified directly without third-party heavy dependencies.
- Zero breaking changes to `BearerTokenAuthenticationProvider` contract.

# ADR 0041: Enterprise Network Topology, Controlled Transport Binding & Secure API Exposure

## Status
ACCEPTED

## Context
As the **AI Operating Platform (AOP)** reaches version 1.3.0 with multi-tenant capabilities, continuous autonomous runtimes, and external client applications (Tentaciones AI Commerce, Vehicle Parts Platform, Enterprise Support Agent, and future n8n/external integrations), the platform must define an explicit and secure network topology.

Prior milestones focused on internal engine, agent orchestration, persistence, authentication, and credential governance. However, exposing the platform API safely to real external consumers requires:
1. Clear network boundaries and defense-in-depth:
   $$\text{External Consumer} \rightarrow \text{Network Boundary} \rightarrow \text{Reverse Proxy / Gateway / Controlled Bind} \rightarrow \text{TLS Termination} \rightarrow \text{Authentication} \rightarrow \text{Authorization} \rightarrow \text{Tenant / Application Resolution} \rightarrow \text{Platform API}$$
2. Strict transport defaults (`HOST=127.0.0.1`), preventing accidental public binding (`0.0.0.0`) in production without explicit configuration (`ALLOW_PUBLIC_BINDING=true`).
3. Explicit reverse proxy trust model (`TRUST_PROXY` + `TRUSTED_PROXY_IPS`) to prevent IP/protocol spoofing and cache poisoning via unverified `X-Forwarded-*` headers.
4. Production dynamic CORS allowlists (`CORS_ORIGINS`) with `Vary: Origin` and absolute prohibition of wildcard (`*`) origins with credentials.
5. Mandatory modern security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `Content-Security-Policy`, and conditional `Strict-Transport-Security` under verified HTTPS).
6. Total isolation of business hardware interfaces (e.g. Brother DCP-1600 on local USB/Spooler) behind the engine.

Fundamental invariant:
$$\text{Network} \neq \text{Identity} \neq \text{Authority}$$
$$\text{Network Accessibility} \not\Rightarrow \text{Authentication / Authorization Bypass}$$

## Decision
We implemented an Enterprise Network Topology and Secure API Exposure layer across the infrastructure, HTTP router, platform service, SDK client, web control plane, and operational documentation.

Key architectural elements:
1. **Infrastructure Configuration (`config.ts` & `.env.example`)**:
   - `host` defaults safely to `127.0.0.1`.
   - In production (`NODE_ENV=production`), binding to `0.0.0.0` throws a fail-closed configuration error unless `ALLOW_PUBLIC_BINDING=true` is explicitly provided.
   - `trustProxy` (boolean), `trustedProxyIps` (string array), `corsOrigins` (string array), `allowedHosts` (string array), `publicBaseUrl` (optional string).
   - Standard Node.js HTTP server timeouts (`requestTimeoutMs: 30000`, `headersTimeoutMs: 35000`, `keepAliveTimeoutMs: 5000`).
2. **Reverse Proxy Trust & Forwarded Headers**:
   - Socket remote address is evaluated against `trustedProxyIps`.
   - When trusted, client IP is resolved from `X-Forwarded-For`, protocol from `X-Forwarded-Proto`, and host from `X-Forwarded-Host`.
   - When untrusted or `trustProxy=false`, all forwarded headers are strictly ignored, mitigating header spoofing.
3. **Host Header Poisoning Defense**:
   - In production with `allowedHosts` configured, requests with unrecognized `Host` headers are rejected with `400 Bad Request` (`INVALID_HOST`).
4. **Dynamic CORS with Strict Allowlists**:
   - Emits `Access-Control-Allow-Origin: <origin>` and `Vary: Origin` when the request origin is in `corsOrigins`.
   - Preflight `OPTIONS` requests from unlisted origins in production are rejected with `403 Forbidden` (`CORS_ORIGIN_FORBIDDEN`).
   - Wildcard `*` is prohibited when credentials/authorization are transmitted.
5. **Security Headers & Conditional HSTS**:
   - Injects `nosniff`, `DENY`, `strict-origin-when-cross-origin`, restrictive `Permissions-Policy`, and strict `Content-Security-Policy`.
   - Emits `Strict-Transport-Security` (`max-age=31536000; includeSubDomains`) only when the effective connection protocol is `https` (either native TLS or verified trusted `X-Forwarded-Proto: https`).
6. **Network Diagnostics & Telemetry**:
   - Implemented `GET /api/v1/diagnostics/network` and public `/network/diagnostics` exposing `NetworkDiagnosticsDTO`.
   - Updated `PlatformClient` SDK with `tenantId`, `applicationId`, `timeoutMs`, `retryPolicy` (for idempotent requests), and `client.diagnostics.network()`.
   - Integrated a live Network & Perimeter Security telemetry card into Web Control Plane `#tab-security` with strict **0 `.innerHTML`**.

## Consequences
### Positive
- Enterprise-grade perimeter protection, preventing IP spoofing, host poisoning, and insecure public bindings.
- Reliable, observable network posture across local development, staging reverse proxies, and production ingress gateways.
- Business devices (Brother printer) remain completely isolated behind authenticated platform API boundaries.
- Zero external runtime npm dependencies (`node:*` standard library only).

### Invariants Maintained
- Network != Identity != Authority.
- Safe default bind `127.0.0.1`.
- Brother DCP-1600 Printer on local `USB001` remains strictly local and unreachable from the internet.
- Strict DOM safety in Web Control Plane (**0 `.innerHTML`**).

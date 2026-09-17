# 0026. Production Reverse Proxy, TLS Termination & Perimeter Network Topology

## Status

Accepted

## Context

The native Node.js HTTP server (`src/platform/server.ts`) listens on loopback (`127.0.0.1:3000`) over cleartext HTTP. While suitable for internal processes, exposing the application directly to the public internet or external networks without TLS termination, rate limiting, and defensive HTTP headers creates severe security vulnerabilities (**GAP-04**).

## Decision

We establish an official perimeter reverse proxy architecture and publish production-grade deployment manifests under `deploy/` and documentation in `docs/PRODUCTION_NETWORK_TOPOLOGY.md`:

1. **Perimeter Reverse Proxy (Caddy & Nginx)**:
   - `deploy/nginx/nginx.conf`: Nginx configuration supporting TLS 1.2/1.3, modern ciphers, perimetric rate limiting (50 req/sec per IP, burst 30), and SSE streaming.
   - `deploy/caddy/Caddyfile`: Modern Caddy v2 configuration with automated Let's Encrypt ACME certificate issuance and renewal.
2. **Container Orchestration**:
   - `deploy/docker-compose.prod.yml`: Multi-container composition uniting the reverse proxy (Caddy/Nginx) and the core platform container with healthchecks and isolated Docker bridge network (`platform_internal`).
3. **Defense-in-Depth Security Headers**:
   - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
   - `X-Frame-Options: DENY`
   - `X-Content-Type-Options: nosniff`
   - `Content-Security-Policy: default-src 'self' ...`
   - `Referrer-Policy: strict-origin-when-cross-origin`
4. **Traceability Pass-Through**:
   - Propagates `X-Request-Id`, `X-Real-IP`, and `X-Forwarded-For` into the platform server.

## Consequences

- **GAP-04 is permanently resolved**.
- Platform server never requires direct public internet exposure.
- Standardized production manifests eliminate configuration guesswork for cloud deployments.

# Security Controls — AI Operating Platform

## Important Clarification

This document lists **concrete security controls** implemented in the platform.
We do NOT claim "XSS immunity" — we implement **active controls against XSS**.

## DOM Security Controls
| Control | Evidence | Verification |
|:---|:---|:---|
| Zero `innerHTML` | `scripts/docs-check.mjs` scans `app.js` | VERIFIED |
| Zero `outerHTML` | Static analysis | VERIFIED |
| Zero `eval()` | Code search | VERIFIED |
| Zero `Function()` constructor | Code search | VERIFIED |
| Zero `document.write()` | Code search | VERIFIED |
| Zero inline scripts | No `<script>` tags with inline code | VERIFIED |
| DOM construction via `document.createElement` + `textContent` | Source review | VERIFIED |

## HTTP Security Headers
| Header | Value | Purpose |
|:---|:---|:---|
| Content-Security-Policy | `default-src 'self'; script-src 'self'` | Prevent XSS via external scripts |
| Strict-Transport-Security | `max-age=31536000; includeSubDomains` | Force HTTPS |
| X-Content-Type-Options | `nosniff` | Prevent MIME sniffing |
| X-Frame-Options | `DENY` | Prevent clickjacking |
| Vary | `Origin` | Proper CORS caching |

## Authentication Controls
| Control | Implementation | Status |
|:---|:---|:---|
| API Key hashing | SHA-256 with key prefix | VERIFIED |
| JWT verification | RS256/ES256 native `node:crypto` | VERIFIED |
| JWKS key rotation | Dynamic fetch with TTL cache | VERIFIED |
| Clock tolerance | Configurable for exp/nbf | VERIFIED |

## Authorization Controls  
| Control | Implementation | Status |
|:---|:---|:---|
| Fail-closed default | PolicyGateway DENY on any error | VERIFIED |
| RBAC evaluation | Role-permission matching | VERIFIED |
| Tenant isolation | CrossTenantOrganizationError | VERIFIED |
| Tool whitelist | Agent.tools strict check | VERIFIED |
| Memory isolation | Agent.memoryScope partitioning | VERIFIED |

## Network Controls
| Control | Implementation | Status |
|:---|:---|:---|
| Loopback binding | `127.0.0.1:3000` | VERIFIED |
| Host header validation | allowedHosts check | VERIFIED |
| Payload size limit | 1MB (HTTP 413) | VERIFIED |
| Media type enforcement | application/json (HTTP 415) | VERIFIED |
| Path traversal prevention | Static file serving sanitization | VERIFIED |
| Rate limiting | Sliding window per route | VERIFIED |

## Open Gaps
| Gap | Description | Target |
|:---|:---|:---|
| GAP-SEC-01 | OIDC/JWKS live IdP connection | v1.4 |
| GAP-INF-01 | TLS termination on live host | v1.4 |
| Trusted Types | Not yet implemented | v1.5 |

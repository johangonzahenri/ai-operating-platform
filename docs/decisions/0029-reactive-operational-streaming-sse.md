# 0029. Reactive Operational Streaming via Server-Sent Events (SSE)

## Status

Accepted

## Context

Prior to Phase 59, the AI Operating Platform Web Control Plane relied exclusively on client-side polling (`setInterval(..., 5000)`) against `/api/v1/*` endpoints (`/status`, `/health`, `/executions`, `/events`, `/operations`, etc.) to update UI widgets, counters, execution timelines, and diagnostic tables.

While effective as a simple baseline, periodic polling introduces architectural limitations:
1. **Telemetry Latency**: Domain events occurring immediately after a poll cycle wait up to 5 seconds before appearing in the operational dashboard.
2. **Superfluous Server Load**: Recurring polling generates repeated HTTP handshakes, header decoding, authentication evaluations, and database queries even during system idle periods.
3. **Bandwidth Inefficiency**: Full JSON payloads are fetched repeatedly even when no new domain events have been persisted.
4. **Disconnection Opacity**: Polling cannot distinguish instantaneous network interruptions from normal inter-request quiet periods.

The platform requires reactive, push-based operational streaming while strictly preserving its architectural invariants:
- Zero external runtime dependencies (`node:http`, `node:events`, standard browser primitives only).
- Strict multi-tenant isolation and fail-closed security.
- Reconnection resilience with replay from the durable event store.
- Zero DOM manipulation risk (`0 .innerHTML`).
- Backward compatibility: HTTP polling must remain functional as a graceful fallback.

### Protocol Evaluation: SSE vs WebSocket

An architectural evaluation of communication protocols was conducted:
- **WebSocket (`RFC 6455`)**: Full-duplex, bidirectional communication over a single TCP connection.
  - *Analysis*: The Control Plane operational telemetry flow is strictly **unidirectional** (Server -> Client). Client commands (create task, execute, cancel, reconfigure budget) are already securely handled via HTTP REST endpoints with RBAC, schema validation, rate limiting, and idempotency guarantees. Introducing WebSockets would require custom framing, ping/pong heartbeat handling, protocol multiplexing, complex proxy configuration, and increased attack surface.
- **Server-Sent Events (`SSE / EventSource`)**: Unidirectional HTTP streaming from Server to Client over standard HTTP/1.1 or HTTP/2.
  - *Analysis*: SSE natively supports text-based streaming (`text/event-stream`), automatic reconnection with browser-managed backoff, monotonic event ordering via `Last-Event-ID`, transparent edge proxy compatibility (`nginx`, `caddy`), and zero additional runtime dependencies.

Therefore, SSE is the optimal architectural choice. WebSockets are explicitly rejected as unnecessary complexity for operational telemetry.

## Decision

We introduce **Reactive Operational Streaming using Server-Sent Events (SSE)** through the following components:

1. **`EventStreamAdapter` (`src/application/observability/event-stream-adapter.ts`)**:
   - Manages active client connections with HTTP headers:
     - `Content-Type: text/event-stream; charset=utf-8`
     - `Cache-Control: no-cache, no-transform, no-store`
     - `Connection: keep-alive`
     - `X-Accel-Buffering: no` (disables buffering in Nginx and edge reverse proxies)
   - Emits periodic heartbeat comments (`: heartbeat\n\n`) at configurable intervals (default: 15s) to detect stale or terminated client sockets.
   - Enforces bounded buffer backpressure (`maxQueueSize: 200`) and connection limits per tenant and globally (`maxGlobalConnections: 100`, `maxTenantConnections: 20`).
   - Replays historical domain events from `EventStore` when `Last-Event-ID` header or query parameter is provided.
   - Listens to live domain events via `EventPublisher` and broadcasts matching events to subscribed clients in real time.
   - Sanitizes sensitive secrets, tokens, and credentials (`sanitizePayload`) using recursive masking (`[REDACTED]`).
   - Enforces strict tenant isolation: events belonging to other tenants are never dispatched to unauthorized clients.

2. **HTTP Streaming Routes (`src/platform/api/http-router.ts`)**:
   - `GET /api/v1/events/stream` and canonical alias `GET /api/platform/v1/events/stream`.
   - Authentication via `Authorization: Bearer <token>`, `X-API-Key: <key>`, or URL query parameters (`?apiKey=` / `?token=`) for browser `EventSource` compatibility.
   - Enforces `events.read` RBAC authorization on `API` resource `events`.
   - Rejects cross-tenant mismatches with HTTP `403 Forbidden`.

3. **Platform Client SDK & Web API Client (`src/platform-client/index.ts` & `src/platform/web/api-client.js`)**:
   - Exposes `events.stream(criteria, callbacks)` and `connectEventStream(options)`.
   - Uses native `EventSource` where available, with fetch/stream reader fallback.

4. **Web Control Plane Integration (`src/platform/web/app.js`)**:
   - Auto-connects to SSE stream upon initialization (`initEventStreaming()`).
   - Dynamically updates the sidebar connection indicator (`.pulse-dot`) with dedicated states: `CONNECTING` (amber), `CONNECTED` (green), `RECONNECTING` (yellow), `DISCONNECTED` (red).
   - Dynamically prepends incoming events into the durable events table and updates counters without page reload.
   - Maintains periodic polling as an unobtrusive fallback safety check at longer intervals (15s).
   - Zero DOM injection: adheres strictly to `0 .innerHTML` DOM purity.
   - Symmetrical i18n support in `locale-es-419.js` and `locale-en.js`.

## Consequences

- Real-time observability: latency between domain event occurrence and dashboard visualization is reduced from seconds to sub-millisecond local network dispatch.
- Server load and network overhead are significantly decreased during idle periods.
- Full reconnection resilience: clients reconnecting after temporary disconnections resume event streaming seamlessly via `Last-Event-ID` replay without duplicate processing or event loss.
- Zero runtime dependencies constraint maintained (100% native Node.js and browser APIs).

# Implementation Plan — Phase 59: Reactive Operational Streaming

Evolve the AI Operating Platform's Control Plane observability from periodic HTTP polling (5000ms timer) to Reactive Operational Streaming using Server-Sent Events (SSE), maintaining strict tenant isolation, fail-closed security, Last-Event-ID resumption, bounded buffering, 0 innerHTML, and 0 runtime dependencies.

## Architecture Decisions & Principles
1. **SSE vs WebSocket**:
   - Audit establishes that Control Plane observability is strictly unidirectional (Server -> Client streaming of events, telemetry, execution transitions, budget updates, and agent status).
   - Client commands (starting operations, canceling tasks, updating budgets) already have hardened REST endpoints (`/api/v1/*`) with standard JSON schemas, idempotency keys, and RBAC evaluations.
   - SSE uses standard HTTP, native Node.js streams, respects existing TLS/Nginx/Caddy configurations without special protocol upgrade handshakes, and provides automatic browser-level reconnection via `EventSource`.
   - **Decision**: SSE is the minimal, correct, and sufficient architecture for Phase 59. No WebSockets needed.
2. **Event Filtering & Tenant Isolation**:
   - Authentication context (`SecurityContext`) extracted via headers or query parameters (API key / Bearer token).
   - If security is enforced, connections without valid authentication are rejected with HTTP 401.
   - Filter criteria: `tenantId` (strictly bound to caller's tenant; cannot be spoofed), optional `organizationId`, `teamId`, `agentId`, `executionId`, `traceId`, `eventType`.
3. **Reconnect & Replay (Last-Event-ID)**:
   - Client sends `Last-Event-ID` header (or query param `lastEventId`).
   - If provided and sequence number > 0, `EventStreamAdapter` queries `EventStore.query({ afterSequence, limit: 100 })` to replay missed events before attaching to live event stream.
4. **Heartbeat & Connection Limits**:
   - Periodic heartbeat comment (`: heartbeat\n\n`) every 15 seconds to prevent connection drops.
   - Explicit connection limits (max 100 concurrent SSE streams per server, max 10 per tenant) and per-connection outbound buffer queue.
   - Clean disconnection handler removing subscribers on socket `close` / `error`.
5. **No Secret Leakage**:
   - Sensitive fields redacted prior to serialization (`[REDACTED]`).
6. **Zero Runtime Dependencies & Zero DOM Injection**:
   - Native Node.js `http` and `events`.
   - Frontend updates strictly using `textContent` and DOM nodes (`0 innerHTML`).

## Proposed Changes
### Backend & Application Layer
- [NEW] `src/application/observability/event-stream-adapter.ts`:
  Manages client stream subscriptions, filtering, replay from `EventStore`, live dispatch from `EventPublisher`, bounded queueing, and heartbeats.
- [MODIFY] `src/platform/api/platform-service.ts`:
  Wire `EventStreamAdapter` and expose stream subscription method.
- [MODIFY] `src/platform/api/http-router.ts`:
  Implement `/api/v1/events/stream` and `/api/platform/v1/events/stream` with `text/event-stream` headers, authentication, and query parsing.
- [MODIFY] `src/interfaces/composition.ts`:
  Initialize `EventStreamAdapter` and provide it to `PlatformService`.

### Client SDK & Frontend Control Plane
- [MODIFY] `src/platform-client/index.ts`:
  Add `connectEventStream(options)` returning an abortable stream subscriber.
- [MODIFY] `src/platform/web/api-client.js`:
  Export `connectEventStream(options)` wrapper around native `EventSource` or streaming fetch.
- [MODIFY] `src/platform/web/app.js`:
  Connect to SSE stream on startup, update live execution badges, diagnostic counts, budgets, and append to events table in real-time. Update pulse-dot with states: `CONNECTING`, `CONNECTED`, `RECONNECTING`, `DISCONNECTED`. Maintain polling as fallback.
- [MODIFY] `src/platform/web/i18n/locale-es-419.js` & `locale-en.js`:
  Add translations for SSE connection states.

### Documentation & Governance
- [NEW] `docs/decisions/0029-reactive-operational-streaming-sse.md`:
  ADR 0029 documenting SSE adoption, tenant isolation, replay semantics, and why WebSocket was not required.
- [MODIFY] `docs/DECISIONS.md`:
  Index ADR 0029.
- [MODIFY] `docs/ROADMAP_MASTER.md`:
  Update Phase 59 (`AOP-STREAMING-SSE`) to `DONE`.
- [MODIFY] `DOCUMENTACION/KANBAN_TABLERO_MAESTRO.md`:
  Add Phase 59 card `PLT-08` as `DONE`.
- [MODIFY] `docs/TEST_REGISTRY.md`:
  Document new reactive streaming tests.
- [MODIFY] `docs/PROMPT_TRACEABILITY.md`:
  Add Prompt 108 entry.

### Tests
- [NEW] `tests/platform/reactive-operational-streaming.test.ts`:
  Comprehensive suite with 20+ tests covering authentication, tenant isolation, event replay with Last-Event-ID, live event delivery, heartbeat, bounded buffers, disconnect cleanup, load/concurrency, and failure recovery.

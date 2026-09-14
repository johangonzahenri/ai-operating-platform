# AI Operating Platform — Platform API Contract (/api/v1)

## Overview

The Platform API (`/api/v1`) provides a decoupled, secure, production-grade HTTP REST interface over the AI Operating Platform Core. It bridges external client platforms, workflow runners, and application adapters (such as Tentaciones) to the underlying execution engine without coupling to platform internals or bypassing security guarantees.

---

## Architecture & Security Boundary

```text
                  ┌──────────────────────────────┐
                  │ External Platforms / Clients │
                  └──────────────┬───────────────┘
                                 │ HTTP (Bearer / API Key)
                                 ▼
                  ┌──────────────────────────────┐
                  │      /api/v1 HTTP Router     │
                  └──────────────┬───────────────┘
                                 │ Authentication Middleware
                                 ▼
                  ┌──────────────────────────────┐
                  │    AuthenticationService     │
                  └──────────────┬───────────────┘
                                 │ Verified Principal
                                 ▼
                  ┌──────────────────────────────┐
                  │       SecurityContext        │
                  └──────────────┬───────────────┘
                                 │ Authorization (RBAC)
                                 ▼
                  ┌──────────────────────────────┐
                  │    PlatformService / Core    │
                  └──────────────┬───────────────┘
                                 │ Safe DTOs / Projections
                                 ▼
                  ┌──────────────────────────────┐
                  │     Standardized Response    │
                  └──────────────────────────────┘
```

Every incoming request to a protected endpoint must undergo:
1. **Authentication**: Credentials extracted from `Authorization` header (`Bearer <token>` or `ApiKey <keyId>.<secret>`) or `X-API-Key` header. Validated via `AuthenticationService`.
2. **Context Establishment**: A verified `SecurityContext` containing `principalId`, `roles`, `tenantId`, `correlationId`, and timestamps is constructed.
3. **Authorization**: Evaluated via `RbacAuthorizationEvaluator` against required permissions (e.g., `public.read`, `agent.read`, `task.create`, `task.read`, `task.cancel`).
4. **Tenant Isolation**: Tasks are created with and filtered by the caller's verified `tenantId`. Cross-tenant data access is strictly rejected.
5. **Caller Identity Binding**: `callerId` is automatically bound from `SecurityContext.principal.id` and cannot be spoofed in task payloads.
6. **Error Sanitization & Safe DTOs**: Internal stack traces, raw system errors, and sensitive agent parameters (e.g., environment secrets) are redacted before serialization.

---

## Response Envelope Standard

All responses from `/api/v1` adhere to a uniform structure:

### Success Response (`200 OK` / `201 Created`)
```json
{
  "success": true,
  "data": { ... },
  "correlationId": "req-1726265000000-abc123"
}
```

### Error Response (`4xx` / `5xx`)
```json
{
  "error": "Access denied: missing task.create permission",
  "status": 403,
  "code": "SECURITY_DEFAULT_DENY",
  "requestId": "req-1726265000000-abc123"
}
```

---

## Endpoint Reference

### 1. Health Probe (Public)
- **Method & Path**: `GET /api/v1/health`
- **Authentication**: None (Public)
- **Permissions**: None
- **Description**: Lightweight health, liveness, readiness, and uptime check for load balancers and container orchestrators.
- **Success Status**: `200 OK`
- **Response**:
```json
{
  "status": "HEALTHY",
  "version": "1.0.0",
  "uptime": 123.456,
  "timestamp": "2026-09-13T22:00:00.000Z",
  "liveness": "UP",
  "readiness": "READY"
}
```

---

### 2. Platform Capabilities & Metadata (Protected)
- **Method & Path**: `GET /api/v1/platform`
- **Authentication**: Required
- **Required Permission**: `public.read` / `platform:read`
- **Description**: Returns non-sensitive platform capabilities, registered model providers, tool names, agent counts, and operational status.
- **Success Status**: `200 OK`
- **Response**:
```json
{
  "version": "1.0.0",
  "environment": "production",
  "capabilities": {
    "multiAgent": true,
    "streaming": false,
    "durability": true,
    "rbac": true
  },
  "registeredAgentsCount": 12,
  "availableTools": ["calculator"],
  "supportedModels": ["stub-model", "gpt-4o", "claude-3-5-sonnet"]
}
```

---

### 3. List Safe Agents (Protected)
- **Method & Path**: `GET /api/v1/agents`
- **Authentication**: Required
- **Required Permission**: `agent.read` / `agents:read`
- **Description**: Returns registered agents with redacted/sanitized metadata. Internal instructions, secrets, and system prompts are omitted.
- **Success Status**: `200 OK`
- **Response**:
```json
[
  {
    "id": "foundation-agent",
    "name": "Foundation Agent",
    "description": "Default general-purpose operational agent",
    "status": "ACTIVE",
    "model": "stub-model",
    "tools": ["calculator"]
  }
]
```

---

### 4. Create Task (Protected)
- **Method & Path**: `POST /api/v1/tasks`
- **Authentication**: Required
- **Required Permission**: `task.create` / `tasks:create`
- **Headers**:
  - `Idempotency-Key` (Optional): Unique idempotency key. Repeating a request with the same key returns the cached completed task result without re-executing.
  - If a concurrent request is already in-flight with the same key, HTTP `409 Conflict` (`code: IDEMPOTENCY_CONCURRENT_EXECUTION`) is returned.
  - If a repeated request provides a payload differing from the initial request, HTTP `409 Conflict` (`code: IDEMPOTENCY_PAYLOAD_MISMATCH`) is returned.
- **Body**:
```json
{
  "agentId": "foundation-agent",
  "input": {
    "message": "Calculate total"
  },
  "traceId": "trace-uuid-1234"
}
```
- **Description**: Creates and schedules a new platform execution task. `callerId` is automatically bound from the verified `SecurityContext.principal.id` and `tenantId` is bound from the principal's tenant.
- **Success Status**: `201 Created` (or `200 OK` if returning existing cached idempotent task)
- **Response**:
```json
{
  "task": {
    "id": "task-uuid-1234",
    "agentId": "foundation-agent",
    "status": "COMPLETED",
    "input": {
      "message": "Calculate total",
      "metadata": {
        "callerPrincipalId": "service-tentaciones",
        "callerTenantId": "tenant-tentaciones",
        "idempotencyKey": "idemp-001"
      }
    }
  },
  "execution": {
    "id": "exec-uuid-5678",
    "status": "COMPLETED",
    "result": { "total": 42 }
  }
}
```

---

### 5. Get Task by ID (Protected)
- **Method & Path**: `GET /api/v1/tasks/:id`
- **Authentication**: Required
- **Required Permission**: `task.read` / `tasks:read`
- **Description**: Retrieves detailed task state. Rejects cross-tenant access with `404 Not Found` to prevent enumeration attacks.
- **Success Status**: `200 OK`

---

### 6. Cancel Task (Protected)
- **Method & Path**: `POST /api/v1/tasks/:id/cancel`
- **Authentication**: Required
- **Required Permission**: `task.cancel` / `tasks:cancel`
- **Body**:
```json
{
  "reason": "User cancelled request via dashboard"
}
```
- **Description**: Signals cancellation for an in-flight or pending task. Non-cancellable terminal tasks return `409 Conflict`.
- **Success Status**: `200 OK`

---

### 7. Get Task Event Timeline (Protected)
- **Method & Path**: `GET /api/v1/tasks/:id/events`
- **Authentication**: Required
- **Required Permission**: `task.read` / `tasks:read`
- **Description**: Returns durable audit trail events associated with the specified task stream.
- **Success Status**: `200 OK`

---

## TypeScript Client SDK (`PlatformClient`)

The platform exports an official Node.js / TypeScript client in `src/platform-client`:

```typescript
import { PlatformClient } from "@platform/client";

const client = new PlatformClient({
  baseUrl: "http://localhost:3000",
  apiKey: "key_service.secret_xyz123"
});

// Health check
const health = await client.health();

// Get platform capabilities
const meta = await client.platform.get();

// List safe agents
const agents = await client.agents.list();

// Create and execute task
const result = await client.tasks.create({
  agentId: "foundation-agent",
  input: { message: "AI Safety" },
  idempotencyKey: "uuid-v4-client-key"
});

// Query task status
const task = await client.tasks.get(result.task.id);

// Cancel task
await client.tasks.cancel(task.id, "Aborted by client");

// Read audit event stream
const events = await client.tasks.events(task.id);
```

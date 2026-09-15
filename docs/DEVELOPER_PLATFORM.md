# AI Developer Platform Specification & Guide

## 1. Overview
The **AI Developer Platform** exposes the AI Operating Platform's runtime capabilities (task orchestration, autonomous agents, multi-model gateway, deterministic tool execution, memory, and observability) to external application builders via a governed, type-safe developer experience.

$$\text{Developer} \longrightarrow \text{Application Factory} \longrightarrow \text{Application Contract} \longrightarrow \text{Platform SDK} \longrightarrow \text{Platform API} \longrightarrow \text{Core AI Runtime}$$

---

## 2. Quick Start Guide (7 Steps)

1. **Define Identity & Manifest**: Create an `application.json` declaring unique `applicationId`, `tenantId`, and required `capabilities`.
2. **Validate Manifest**: Pass the manifest through `ApplicationValidator.validate()`.
3. **Register Application**: Register into `ApplicationRegistry` scoped to your assigned Tenant.
4. **Configure Authentication**: Initialize the official `PlatformClient` with your API key or Bearer token.
5. **Verify Health**: Call `client.connect()` to ensure end-to-end platform reachability.
6. **Execute Governed Tasks**: Dispatch tasks using `client.createTask()` with correlation tracing.
7. **Inspect Execution & Audit Events**: Query durable telemetry via `client.executions.get()` and `client.getTaskEvents()`.

---

## 3. Official Platform Client SDK Methods

```typescript
import { createPlatformClient } from "@ai-platform/sdk";

const client = createPlatformClient({
  baseUrl: "http://localhost:3000",
  apiKey: process.env.PLATFORM_API_KEY,
  defaultHeaders: { "x-tenant-id": "tenant-default" },
});

// Platform Health & Connectivity
await client.connect();
await client.getHealth();

// Task Orchestration
const task = await client.createTask({
  agentId: "foundation-agent",
  input: { capability: "product.discovery", query: "..." },
});
const execution = await client.tasks.execute(task.taskId);

// Observability & Auditing
const events = await client.getTaskEvents(task.taskId);
const status = await client.executions.get(execution.executionId);

// Application Lifecycle & Analytics
const analytics = await client.applications.analytics("my-app-id");
await client.applications.updateLifecycle("my-app-id", "OPERATIONAL", "Deployed to production");

// Application Factory
const skeleton = await client.factory.generate({ ... });
```

---

## 4. API Explorer Reference

| Method | Route | Description | Required Scope / Capability |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/health` | Live platform health, component readiness & uptime | Public |
| `POST` | `/api/v1/tasks` | Create task with tenant isolation & idempotency | `task.create` |
| `POST` | `/api/v1/orchestrate` | Synchronous task execution pipeline | `orchestrate` |
| `GET` | `/api/v1/executions/:id`| Query execution steps, tool calls & duration | `execution.read` |
| `GET` | `/api/v1/events` | Query durable tamper-evident audit events | `audit.read` |
| `POST` | `/api/v1/factory/generate` | Generate application boilerplate & manifest | `application.manage` |
| `POST` | `/api/v1/factory/register` | Register validated application entity | `application.manage` |
| `GET` | `/api/v1/applications/:id/analytics` | Retrieve application operational telemetry | `application.read` |

---

## 5. Error Explorer

| HTTP Status | Error Code | Root Cause | Recommended Developer Action |
| :--- | :--- | :--- | :--- |
| `400` | `INVALID_INPUT` | Malformed payload or unfulfilled schema constraints | Validate parameters against DTO schema definition. |
| `401` | `UNAUTHENTICATED` | Missing, expired, or invalid API key | Check `Authorization` header format (`Bearer <key>`). |
| `403` | `PERMISSION_DENIED` | Tenant unentitled to capability or RBAC violation | Verify tenant plan capabilities in SaaS Control Plane. |
| `404` | `NOT_FOUND` | Target task, execution, or application does not exist | Verify IDs in correlation metadata. |
| `409` | `IDEMPOTENCY_CONFLICT` | Task with identical idempotency key already executed | Reuse previous response or generate new idempotency key. |
| `429` | `RATE_LIMIT_EXCEEDED` | Request volume exceeds tenant quota | Implement exponential backoff and inspect quota reset headers. |
| `500` | `INTERNAL_ERROR` | Unhandled runtime exception | Check platform diagnostics and server event logs. |

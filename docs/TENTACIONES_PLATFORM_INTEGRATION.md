# Tentaciones AI Commerce — Platform Live Integration Guide

## 1. Executive Summary & Integration Architecture

**Tentaciones AI Commerce** is the primary real-world consumer application of the **AI Operating Platform**.

### Fundamental Architectural Boundary

$$\text{CORE ENGINE} \neq \text{PLATFORM PRODUCT} \neq \text{APPLICATIONS}$$

```
┌──────────────────────────────────────────────────────────────────┐
│                   TENTACIONES AI COMMERCE                        │
│                                                                  │
│   User Intent: "Quiero unas zapatillas negras para correr"       │
│                                ↓                                 │
│                      Shopping Assistant Agent                    │
│                                ↓                                 │
│                   TentacionesPlatformAdapter                     │
└────────────────────────────────┼─────────────────────────────────┘
                                 │
                                 │  HTTP REST / SDK
                                 │  X-API-Key: key-tentaciones.secret...
                                 │  X-Tenant-ID: tenant-tentaciones
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│                      PLATFORM API / RUNTIME                      │
│                                                                  │
│  1. Authentication & Scoped Identity (tentaciones-commerce)      │
│  2. Default-Deny Scope Enforcement (product.discovery)           │
│  3. Task Lifecycle (CREATED → RUNNING → COMPLETED)               │
│  4. Foundation Agent Runtime & Model Gateway                     │
│  5. Immutable SQLite WAL Event Store                             │
└────────────────────────────────┼─────────────────────────────────┘
                                 │
                                 │  Structured Discovery Result
                                 │  { intent: ["zapatillas", "negras"], ... }
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│                   TENTACIONES COMMERCE DOMAIN                    │
│                                                                  │
│  • Catalog Search & Inventory Matching                           │
│  • Product Pricing, Variants & 3D/AR Asset Attachment            │
│  • UI Result Presentation (Source: AI Operating Platform)        │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. Separation of Domain Ownership

| Domain Concern | Owner | Responsibility |
| :--- | :--- | :--- |
| **Catalog & Products** | **Tentaciones** | Owns product models, SKUs, inventory, descriptions, and media. |
| **Pricing & Cart** | **Tentaciones** | Owns multi-item cart resolution, discounts, checkout, and taxes. |
| **User Experience (UX)** | **Tentaciones** | Owns frontend rendering, brand design, and shopping interface. |
| **Intelligent Orchestration**| **Platform** | Coordinates planning, agent execution, and deterministic task DAGs. |
| **Model Gateway** | **Platform** | Routes prompts, manages context windows, and parses intents safely. |
| **Tool Governance** | **Platform** | Enforces schemas, risk levels, and approval gates on tool calls. |
| **Event Store & Audit** | **Platform** | Immutably persists sequence-numbered execution events and traces. |

---

## 3. Application Identity & Authentication

1. **Application ID**: `tentaciones-commerce`
2. **Principal Identity**: `service-tentaciones` (Type: `SERVICE`, Tenant: `tenant-tentaciones`, Roles: `["service", "application"]`)
3. **Authentication Mode**: `API_KEY` (`key-tentaciones.<secret>`)
4. **Allowed Capabilities (Default-Deny)**:
   - `product.discovery`
   - `orchestrate`
   - `tasks.create`
   - `tasks.read`
   - `tasks.execute`
   - `tasks.cancel`
   - `health.check`

---

## 4. Product Discovery Request & Response Flow

### Client Request via Adapter

```typescript
import { createPlatformClient } from "@ai-platform/client";
import { TentacionesPlatformAdapter } from "./tentaciones-platform-adapter.js";

const client = createPlatformClient({
  baseUrl: "http://127.0.0.1:3000",
  apiKey: "key-tentaciones.secret-tentaciones-live",
  defaultHeaders: { "X-Tenant-ID": "tenant-tentaciones" },
});

const adapter = new TentacionesPlatformAdapter({
  client,
  applicationVersion: "1.4.0",
  applicationId: "tentaciones-commerce",
  tenantId: "tenant-tentaciones",
});

const result = await adapter.discoverProducts("Quiero zapatillas negras para correr");
```

### Result Schema

```json
{
  "status": "COMPLETED",
  "source": "AI Operating Platform",
  "applicationId": "tentaciones-commerce",
  "taskId": "a24f0c91-b384-48fe-bc55-e9df8bca0194",
  "executionId": "8f8303e2-da72-4623-aaef-e98fc66258ef",
  "traceId": "trace-tentaciones-001",
  "query": "Quiero zapatillas negras para correr",
  "intent": {
    "terms": ["zapatillas", "negras", "correr"]
  },
  "products": [],
  "fallback": "NONE"
}
```

---

## 5. Resilience & Fallback Matrix

When the platform is unavailable or rejects the request, Tentaciones degrades gracefully to local commerce logic:

| Platform Condition | HTTP / Error Code | Adapter Status | Fallback Strategy | Displayed Source |
| :--- | :--- | :--- | :--- | :--- |
| **Platform Online** | `200 OK` / `201 Created` | `COMPLETED` | `NONE` | `AI Operating Platform` |
| **Connection Refused** | `NETWORK_ERROR` | `PLATFORM_UNAVAILABLE` | `TRADITIONAL_COMMERCE` | `Traditional Commerce` |
| **Unauthenticated** | `401 Unauthorized` | `UNAUTHORIZED` | `LOCAL_FALLBACK` | `Local AI Engine` |
| **Forbidden Scope** | `403 Forbidden` | `FORBIDDEN` | `LOCAL_FALLBACK` | `Local AI Engine` |
| **Internal Error** | `500 Platform Error` | `FAILED` | `LOCAL_FALLBACK` | `Local AI Engine` |

---

## 6. Local Development & Verification

### 1. Start Platform API

```bash
npm run build
npm start # Starts Platform HTTP Server on 127.0.0.1:3000
```

### 2. Verify Platform Health & Application Registration

```bash
curl http://127.0.0.1:3000/api/v1/health
curl http://127.0.0.1:3000/api/v1/applications/tentaciones-commerce
```

### 3. Run Tentaciones Live Demo

```bash
npm run demo:tentaciones
```

# ADR 0010: Platform API and Web UI (v0.7 Product Boundary)

## Status
Accepted

## Context
Milestones v0.1 through v0.6 established the domain, application, and infrastructure layers of the Core Engine (Runtime, Models, Tools, Sequential Orchestration, Context/Memory, and Observability/Governance).

However, the engine remained an embedded TypeScript library without an external interface or presentation layer. In order to fulfill the product vision defined in `docs/product/PRODUCT_MODEL.md`, the platform requires:
1. An external boundary exposing Core Engine capabilities through stable, typed DTO contracts.
2. A visual Control Plane (Web UI) allowing operators to inspect executions, monitor policy governance in real-time, and trigger coordinated workflows.
3. Full operational independence from external npm dependencies to remain completely functional in constrained network environments (such as corporate/institutional networks with TLS interception).

## Decision
1. **Facade-Driven Platform Service:** We introduced `PlatformService` as the official boundary facade wrapping `createPlatform()` and `SequentialOrchestrator`. It consumes and produces strictly typed Data Transfer Objects (`PlatformDTOs`).
2. **Native Node.js HTTP Server:** The REST API and static asset server are implemented using Node.js built-in modules (`node:http`, `node:fs`, `node:path`, `node:url`) with zero npm package dependencies.
3. **Single-Page Application Control Plane:** A lightweight, dark-mode SPA (`index.html`, `styles.css`, `app.js`) served directly from the embedded HTTP server provides an interactive dashboard with Overview metrics, an Execution Explorer with correlated timeline reconstruction, a Governance audit viewer, and an interactive execution Playground.
4. **Correlated Timeline Reconstruction:** Timeline events are queried through `/api/executions/:id/timeline` by aggregating observations from `InMemoryAuditLog` filtered by `executionId`.

## Consequences
### Positive
- Zero external dependencies: instantaneous startup with `node dist/src/platform/server.js`, resilient to network/TLS download restrictions.
- Strict architecture boundary: the Web UI has no knowledge of internal aggregate structures or memory adapters.
- Complete operational observability: all user actions trigger domain events and update metrics collectors identically to internal API calls.

### Negative / Trade-offs
- The native HTTP router handles route matching manually with regex instead of relying on third-party frameworks like Express or Fastify.
- In-memory persistence resets upon server restart (durable disk/database persistence is scheduled for future milestones).

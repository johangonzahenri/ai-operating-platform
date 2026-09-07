# Product Specification: Web Platform Control Plane (v0.7)

## Purpose

The **Web Platform Control Plane** serves as the graphical management and observability interface for the AI Operating Platform. It transforms the internal Core Engine into an accessible, observable, and testable enterprise software platform.

## Target Personas

1. **System Operators & SREs:**
   - Monitor platform health, operational uptime, and execution volume.
   - Inspect fail-closed policy enforcement and audit observation streams.

2. **AI Engineers & Developers:**
   - Inspect available capabilities (models and tools).
   - Test workflows and test scenarios directly in the Playground.
   - Trace end-to-end execution timelines and debug failure causes.

3. **Product & Application Architects:**
   - Understand how external applications (e.g., AI Commerce) consume platform capabilities.
   - Verify boundary contracts and ensure strict decoupling between application domains and AI infrastructure.

## Key Feature Modules

| Module | Purpose | Source Endpoint | Status |
|---|---|---|---|
| **Dashboard** | System overview, operational telemetry, counter cards | `GET /api/v1/status` | Live |
| **Agents** | Agent management roadmap & architecture preview | N/A (Mock/Preview) | Preview (v0.8) |
| **Models** | Catalog of registered model gateways and capabilities | `GET /api/v1/models` | Live |
| **Tools** | Catalog of registered operational tools and parameter schemas | `GET /api/v1/tools` | Live |
| **Executions** | Historical log of task executions with status and filters | `GET /api/v1/executions` | Live |
| **Execution Detail** | Reconstructed event timeline for a specific execution trace | `GET /api/v1/executions/:id/timeline` | Live |
| **Playground** | Interactive runner for direct tasks and sequential pipelines | `POST /api/v1/executions`, `POST /api/v1/orchestrate` | Live |
| **Applications** | Integration showcase for external consumers (AI Commerce) | `POST /api/v1/orchestrate` | Live |
| **Settings** | Platform version, operational health, governance configuration | `GET /api/v1/status` | Live |
| **Governance** | Audit observation stream with policy allow/deny tracking | `GET /api/v1/audit` | Live |

# Web Platform Architecture (v0.7)

## Overview

The **Web Platform Control Plane** is a lightweight, zero-dependency, browser-based Single Page Application (SPA) designed to observe, inspect, and interact with the AI Operating Platform.

Located in `src/platform/web/`, it consists of:
- `index.html`: The structural markup hosting the 9 operational modules.
- `styles.css`: Modern enterprise dark-mode design system with responsive grid layout and CSS custom properties.
- `api-client.js`: A dedicated HTTP API client encapsulating all `/api/v1` REST calls.
- `app.js`: Reactive controller managing UI state, DOM rendering, forms, and polling.

## Hexagonal Boundary Rule

To preserve clean architecture and ensure proper enterprise boundaries:
- The Web Platform **never** imports TypeScript/JavaScript modules from `src/domain/`, `src/application/`, or `src/infrastructure/`.
- All interactions occur strictly over HTTP JSON REST APIs via `api-client.js`.
- The Web Platform is fully decoupled from the internal implementation details of the Core Engine.

## The 9 Control Plane Modules

1. **Dashboard:**
   - Real-time telemetry: total executions count, task count, available tools count, connected models count.
   - Live uptime counter and system counter metrics table.
   - Core engine health status indicator.

2. **Agents (Preview for v0.8):**
   - Displays clear informational banner: *"No agents configured yet. Agent management will be available in v0.8."*
   - Explains the architectural roadmap from caller identities in v0.7 to autonomous personas and coordination in v0.8.
   - Previews planned agent types: Foundation Agent, Sequential Orchestrator, AI Commerce Assistant.

3. **Models:**
   - Live query of registered models via `GET /api/v1/models`.
   - Displays model ID, name, provider (e.g. `stub`), status, and capabilities (`text-generation`, `structured-output`).

4. **Tools:**
   - Live query of registered capabilities via `GET /api/v1/tools`.
   - Displays tool ID, human-readable name, description, and parameter expectations.

5. **Executions:**
   - Real-time tabular explorer of all persisted execution projections via `GET /api/v1/executions`.
   - Displays execution ID, task ID, trace ID, status badge, start time, and direct link to timeline inspection.

6. **Execution Detail:**
   - Deep inspection and lifecycle reconstruction via `GET /api/v1/executions/:id` and `GET /api/v1/executions/:id/timeline`.
   - Chronological visualization of domain audit events (`context.created`, `execution.started`, `policy.allowed`, `operation.completed`, `execution.completed`, etc.).
   - Displays payload details and correlation identifiers.

7. **Playground:**
   - Interactive testing interface for developers and operators.
   - Form for direct task/execution dispatch via `POST /api/v1/executions`.
   - Form for sequential pipeline orchestration with preset scenarios via `POST /api/v1/orchestrate`.
   - Live syntax-highlighted JSON output preview with status badge.

8. **Applications (AI Commerce):**
   - Architecture showcase of external application consumers.
   - Explains how external systems integrate using Platform API contracts without internal engine dependencies.
   - Interactive order calculation simulation triggering multi-step operations (tax calculation + receipt synthesis).

9. **Settings:**
   - Comprehensive metadata review: platform version (`0.7.0`), engine status (`HEALTHY`), governance mode (`FAIL-CLOSED`), host binding (`127.0.0.1`), zero npm runtime dependencies.

## Security Posture

1. **Zero `innerHTML` Usage:**
   - All DOM updates are performed exclusively using `document.createElement()`, `element.textContent`, and DOM node manipulation.
   - Eliminates Cross-Site Scripting (XSS) attack vectors from unsanitized model or tool outputs.

2. **Loopback Only:**
   - Binds exclusively to `127.0.0.1`.
   - Cross-Origin Resource Sharing (CORS) strictly restricted to localhost origins.

3. **Static Path Traversal Immunity:**
   - File serving resolves paths safely within `WEB_DIR` and prohibits directory traversal (`..`).

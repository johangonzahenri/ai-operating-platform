# Chapter 5: Web Platform Control Plane

## 1. Architectural Philosophy

The Web Platform Control Plane is an operator-facing graphical console served directly by the platform HTTP server.

Key Architectural Guarantees:
- **Zero Third-Party Frontend Dependencies:** Vanilla ES modules, standard DOM APIs, and CSS custom properties.
- **Hexagonal Isolation:** Never imports internal TypeScript or JavaScript source files from the domain or application layers.
- **Strict API Decoupling:** Interacts exclusively through `api-client.js` invoking `/api/v1` endpoints.
- **XSS Immunity:** Zero usage of `innerHTML` or string-based HTML injection. All elements are created and populated via `document.createElement()` and `element.textContent`.

## 2. Navigational Modules

1. **Dashboard:** High-level platform health, aggregate execution counters, and operational metrics.
2. **Agents:** Roadmap preview for v0.8 autonomous agent management.
3. **Models:** Registry of connected AI model providers and inference capabilities.
4. **Tools:** Registry of tool capabilities, names, and operational parameters.
5. **Executions:** Searchable table of past and ongoing executions with statuses and timestamps.
6. **Execution Detail:** Deep inspection view displaying reconstructed event timelines for any execution ID.
7. **Playground:** Interactive testing runner supporting both direct task execution and multi-step pipeline orchestration.
8. **Applications:** Architecture showcase and live simulation for external consumers (e.g., AI Commerce).
9. **Settings:** Platform metadata, host binding, security properties, and engine configuration.
10. **Governance:** Dedicated audit log viewer showing fail-closed policy evaluations and authorization outcomes.

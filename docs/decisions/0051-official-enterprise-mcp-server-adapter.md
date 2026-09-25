# 0051. Official Model Context Protocol (MCP) TypeScript SDK v2 Integration

Date: 2026-09-25
Status: Accepted

## Context

Prior to Track 4 (GAP-07), the platform lacked standard Model Context Protocol (MCP) server capabilities. In an initial pass, a custom JSON-RPC transport and server was created. However, architectural standards require adopting the official `@modelcontextprotocol/server` TypeScript SDK (v2.1.0) while preserving:
1. Strict Hexagonal Architecture (Driving Adapter in `src/platform/mcp/`).
2. Zero third-party runtime dependencies in Core Engine (`src/domain/` and `src/application/`).
3. Enterprise multi-tenancy, RBAC, Rate Limiting, Idempotency, Schema Governance, Taint Tracking, and HITL with Segregation of Duties (SoD).
4. Dual-era protocol support: Modern `2026-07-28` (`server/discover`, request-scoped `_meta`) and Legacy `2024-11-05` (`initialize`).

## Decision

1. **Adopt Official SDK in Platform Perimeter (`src/platform/mcp/`)**:
   - Add `@modelcontextprotocol/server@2.1.0` in `dependencies` for the platform driving adapter.
   - Core and Application layers remain 100% free of external runtime dependencies.
2. **Project Governed Capabilities**:
   - `McpServer` instances are constructed on-demand or per-request from `ToolRegistry` safe definitions.
   - Tool execution is strictly dispatched through `ToolInvocationRuntime` respecting all 10 governance gates.
   - Human-in-the-loop approvals are intercepted and suspended into `HITLBridgePort`, returning structured suspension metadata without crashing.
3. **Dual Transport Support**:
   - `serveMcpStdio` over standard I/O for IDE clients (Antigravity, Cursor, Claude Desktop).
   - `handleMcpHttpRequest` bridging `node:http` to Web Standard `createMcpHandler` from the SDK.

## Consequences

- **GAP-07 is permanently closed** with the official TypeScript MCP SDK v2.
- Full compliance with modern `2026-07-28` and legacy `2024-11-05` clients.
- Invariant Principle #2 is respected: Core Engine maintains zero third-party dependencies, and platform adapter dependencies are explicitly bounded and governed.

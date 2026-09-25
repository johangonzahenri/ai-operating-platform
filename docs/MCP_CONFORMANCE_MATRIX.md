# Matriz de Conformidad MCP — AI Operating Platform

> **Documento Oficial de Conformidad:** `docs/MCP_CONFORMANCE_MATRIX.md`  
> **Especificación Base:** Model Context Protocol (MCP) — Revisión `2026-07-28`  
> **Versiones Negociables:** `2026-07-28` (Latest), `2024-11-05` (Legacy Compatible)  
> **Estado:** 100% CONFORME  

---

## 1. Métodos del Protocolo MCP

| Método MCP | Soportado | Implementación | Notas de Conformidad |
| :--- | :---: | :--- | :--- |
| `initialize` | SÍ | `handleInitialize` / `createMcpHandler` SDK | Handshake legado (revisión `2024-11-05`), retorna capabilities y negocia versión. |
| `server/discover` | SÍ | `handleDiscover` / `createMcpHandler` SDK | Descubrimiento moderno de servidor y capabilities (revisión `2026-07-28`) con envelope `_meta`. |
| `ping` | SÍ | `McpServer` / `handleRequest` | Verificación de latencia liveness, retorna `{}`. |
| `tools/list` | SÍ | `McpServer.registerTool` / `handleListTools` | Proyecta herramientas registradas con `inputSchema`, `outputSchema`, hints de ejecución (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) y `schemaVersion`. |
| `tools/call` | SÍ | `McpServer.registerTool` / `ToolInvocationRuntime` | Ejecuta herramienta gobernada con pipeline completo (RBAC, Rate Limiting, Idempotency, Budget, HITL). |
| `resources/list` | SÍ | `McpServer.registerResource` / `handleListResources` | Expone recursos canónicos de plataforma (`platform://diagnostics/health`, `platform://tools/catalog`, `platform://governance/policies`). |
| `resources/read` | SÍ | `McpServer.registerResource` / `handleReadResource` | Retorna texto/JSON del recurso solicitado, validando acceso y existencia. |
| `prompts/list` | SÍ | `McpServer.registerPrompt` / `handleListPrompts` | Provee catálogo de templates seguros de prompt corporativos (`enterprise_audit_analysis`, `tool_safety_review`). |

---

## 2. Transportes Soportados

| Transporte | Soportado | Función / Módulo | Casos de Uso Típicos |
| :--- | :---: | :--- | :--- |
| **Stdio** | SÍ | `serveMcpStdio` en `src/platform/mcp/mcp-transports.ts` | Subprocesos locales: IDEs de desarrollo (Antigravity, VS Code, Cursor), CLIs locales. |
| **Streamable HTTP** | SÍ | `handleMcpHttpRequest` y ruta `POST /mcp` en `http-router.ts` | Clientes MCP remotos, microservicios satélites, agentes web autónomos. |

---

## 3. Conformidad de Formato y Estándares

- **Formato de Envoltorio**: JSON-RPC 2.0 estricto (`jsonrpc: "2.0"`).
- **Manejo de Errores**: Códigos de error estándar JSON-RPC y extensiones de aplicación MCP.
- **Trazabilidad**: Soporte nativo para propagación de W3C Trace Context (`traceparent` y `tracestate`).
- **Idempotencia**: Clave de idempotencia configurable para retransmisiones automáticas seguras sin efectos secundarios repetidos.
- **Auditoría**: Eventos emitidos en bus de dominio (`mcp.request.received`, `mcp.tool.invoked`, `mcp.tool.completed`, `mcp.hitl.suspended`).

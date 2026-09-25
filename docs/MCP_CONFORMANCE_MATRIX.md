# Matriz de Conformidad MCP — AI Operating Platform

> **Documento Oficial de Conformidad:** `docs/MCP_CONFORMANCE_MATRIX.md`  
> **Especificación Base:** Model Context Protocol (MCP) — Revisión `2026-07-28`  
> **Versiones Negociables:** `2026-07-28` (Latest), `2024-11-05` (Legacy Compatible)  
> **Estado:** 100% CONFORME  

---

## 1. Métodos del Protocolo MCP

| Método MCP | Soportado | Implementación | Notas de Conformidad |
| :--- | :---: | :--- | :--- |
| `initialize` | SÍ | `handleInitialize` en `platform-mcp-server.ts` | Retorna capabilities (`tools`, `resources`, `prompts`) y negocia versión de protocolo. |
| `ping` | SÍ | `handlePing` en `platform-mcp-server.ts` | Verificación de latencia liveness, retorna `{}`. |
| `tools/list` | SÍ | `handleListTools` en `platform-mcp-server.ts` | Proyecta herramientas registradas con `inputSchema`, `outputSchema`, hints de ejecución (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) y `schemaVersion`. |
| `tools/call` | SÍ | `handleCallTool` en `platform-mcp-server.ts` | Ejecuta herramienta gobernada con pipeline completo (RBAC, Rate Limiting, Idempotency, Budget, HITL). |
| `resources/list` | SÍ | `handleListResources` en `platform-mcp-server.ts` | Expone recursos canónicos de plataforma (`docs://architecture`, `docs://security`, `health://status`). |
| `resources/read` | SÍ | `handleReadResource` en `platform-mcp-server.ts` | Retorna texto/JSON del recurso solicitado, validando acceso y existencia. |
| `prompts/list` | SÍ | `handleListPrompts` en `platform-mcp-server.ts` | Provee catálogo de templates seguros de prompt corporativos. |

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

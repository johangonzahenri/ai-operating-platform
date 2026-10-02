# ADR 0051: Integración Oficial del SDK TypeScript v2 de MCP

Fecha: 2026-09-25

## Estado
ACEPTADA

## Contexto
Antes de la Vía 4 (GAP-07), la plataforma carecía de capacidades estándar de servidor Model Context Protocol (MCP). En un paso inicial, se creó un transporte y servidor JSON-RPC personalizado. Sin embargo, los estándares de arquitectura requieren adoptar el SDK oficial de TypeScript `@modelcontextprotocol/server` (v2.1.0) manteniendo:
1. Arquitectura Hexagonal estricta (Adaptador Conductor en `src/platform/mcp/`).
2. Cero dependencias de tiempo de ejecución de terceros en Core Engine (`src/domain/` y `src/application/`).
3. Multi-inquilino empresarial, RBAC, limitación de tasa, idempotencia, gobernanza de esquemas, seguimiento de manchas y HITL con Segregación de Funciones (SoD).
4. Soporte de protocolo de doble era: Moderno `2026-07-28` (`server/discover`, `_meta` con alcance de solicitud) y Legado `2024-11-05` (`initialize`).

## Decisión
1. **Adoptar SDK Oficial en el Perímetro de la Plataforma (`src/platform/mcp/`)**:
   - Agregar `@modelcontextprotocol/server@2.1.0` en `dependencies` para el adaptador conductor de la plataforma.
   - Las capas Core y Application permanecen 100% libres de dependencias de tiempo de ejecución externas.
2. **Proyectar Capacidades Gobernadas**:
   - Las instancias de `McpServer` se construyen a pedido o por solicitud a partir de definiciones seguras de `ToolRegistry`.
   - La ejecución de herramientas se despacha estrictamente a través de `ToolInvocationRuntime` respetando las 10 puertas de gobernanza.
   - Las aprobaciones de humanos en el ciclo (HITL) son interceptadas y suspendidas en `HITLBridgePort`, devolviendo metadatos de suspensión estructurados sin fallar.
3. **Soporte de Transporte Dual**:
   - `serveMcpStdio` sobre E/S estándar para clientes IDE (Antigravity, Cursor, Claude Desktop).
   - `handleMcpHttpRequest` conectando `node:http` al Estándar Web `createMcpHandler` del SDK.

## Consecuencias
- **GAP-07 se cierra permanentemente** con el SDK TypeScript oficial de MCP v2.
- Cumplimiento total con clientes modernos `2026-07-28` y heredados `2024-11-05`.
- Se respeta el Principio Invariante #2: Core Engine mantiene cero dependencias de terceros, y las dependencias del adaptador de plataforma están explícitamente delimitadas y gobernadas.

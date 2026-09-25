# Arquitectura del Servidor Enterprise MCP — AI Operating Platform

> **Documento Oficial de Arquitectura:** `docs/MCP_SERVER_ARCHITECTURE.md`  
> **Iniciativa:** `AOP-MULTIAGENT-HARDENING` (GAP-07 / Track 4)  
> **Revisión MCP Conforme:** `2026-07-28` (con fallback de negociación `2024-11-05`)  
> **Estado Técnico:** `DONE` | **Línea Base:** v1.4.0 / v1.5.0 Candidate  

---

## 1. Propósito y Frontera Hexagonal

El **Official Enterprise MCP Server** expone las capacidades operativas, el catálogo de herramientas y recursos gobernados de la **AI Operating Platform** a clientes compatibles con el estándar **Model Context Protocol (MCP)** (tales como IDEs de desarrollo: Antigravity, VS Code, Cursor; y agentes de inteligencia artificial autónomos externos).

Para garantizar la integridad y estabilidad a largo plazo del sistema, el servidor se implementa como un **Driving Adapter** perimetral en la capa de Plataforma (`src/platform/mcp/`), respetando la regla sagrada de desacoplamiento:

```
[ Cliente MCP Externo (IDE / Agente Remoto) ]
                     │
       ┌─────────────┴─────────────┐
       ▼                           ▼
[ Stdio Transport ]     [ HTTP Transport (POST /mcp) ]
       │                           │
       └─────────────┬─────────────┘
                     ▼
       [ PlatformMcpServer (Driving Adapter) ]
                     │
       ┌─────────────┴────────────────────────┐
       ▼                                      ▼
[ ToolInvocationRuntime ]           [ HITLBridgePort ]
       │                                      │
       ▼                                      ▼
[ Core Pipeline / Gobernanza ]      [ Aprobación Asíncrona (SoD) ]
```

### Invariantes Arquitectónicas No Negociables:
1. **Cero Dependencias en Core/Domain**: Ni el motor de inferencia ni el dominio de negocio importan código del servidor MCP.
2. **Sin Acceso Directo a Base de Datos**: El adaptador MCP jamás ejecuta consultas SQLite directas, manipula tablas ni altera agregados saltándose los casos de uso.
3. **Fail-Closed Default**: Toda invocación sin contexto de seguridad autenticado, con tenant mismatch o permisos insuficientes es rechazada de inmediato.
4. **Cero Fuga de Secretos o Trazas**: Todo error interno es interceptado y sanitizado por `McpErrorMapper`, omitiendo stack traces y exponiendo únicamente códigos estándar MCP y correlation IDs (`traceId`).

---

## 2. Componentes del Servidor MCP

El adaptador modular reside íntegramente en `src/platform/mcp/`:

1. **`mcp-dto.ts`**:
   - DTOs canónicos tipados de JSON-RPC 2.0 y la especificación MCP 2026-07-28.
   - Declaración de constantes de versión (`MCP_PROTOCOL_VERSION = "2026-07-28"`).
   - Catálogo de errores estándar (`McpErrorCodes`).
2. **`mcp-error-mapper.ts`**:
   - Mapeador de excepciones de dominio y runtime a códigos JSON-RPC / MCP (`-32600`, `-32601`, `-32602`, `-32001`, `-32002`, `-32003`, `-32004`, `-32603`).
3. **`platform-mcp-server.ts`**:
   - Clase central `PlatformMcpServer` y factory `createPlatformMcpServer`.
   - Dispatcher de métodos: `initialize`, `ping`, `tools/list`, `tools/call`, `resources/list`, `resources/read`, `prompts/list`.
   - Enlace directo con `ToolInvocationRuntime` y `HITLBridgePort`.
4. **`mcp-transports.ts`**:
   - `serveMcpStdio`: Manejador de comunicación por entrada/salida estándar para subprocesos locales (IDEs).
   - `handleMcpHttpRequest`: Manejador para llamadas HTTP stateless vía `POST /mcp` integrado en `http-router.ts`.
5. **`index.ts`**:
   - Exportaciones públicas del módulo de plataforma.

---

## 3. Métodos MCP Soportados y Semántica

| Método MCP | Función en AI Operating Platform | Gobernanza Aplicada |
| :--- | :--- | :--- |
| `initialize` | Negocia versión del protocolo (`2026-07-28` o `2024-11-05`) y expone capabilities del servidor. | Solo versiones seguras soportadas. |
| `ping` | Verificación de latencia y disponibilidad operativa liveness. | Responde `{}` determinista. |
| `tools/list` | Descubre herramientas registradas en `ToolRegistry`. Proyecta `inputSchema`, `outputSchema`, hints de ejecución y versiones de esquema. | Filtra secretos (`discoverSafeDefinitions`). |
| `tools/call` | Ejecuta la herramienta solicitada a través de `ToolInvocationRuntime`. | Ejecuta el pipeline de 10 compuertas (RBAC, Rate Limit, Presupuestos, Validación, Idempotencia, Timeout, Taint boundary). |
| `resources/list` | Lista recursos documentales (`docs://*`) y métricas de salud (`health://status`). | Solo URIs autorizadas de plataforma. |
| `resources/read` | Lee el contenido seguro de un recurso gobernado. | Validación de URI, fail-closed ante URIs no existentes o restringidas. |
| `prompts/list` | Provee plantillas de prompt corporativas pre-aprobadas para asistentes y agentes. | Redacción de directivas sensibles. |

---

## 4. Integración con el Pipeline de Gobernanza (Track 1, 2 y 3)

Cuando un cliente MCP invoca `tools/call`:
1. **W3C Trace Context**: Extrae `traceparent` y `tracestate` si se envían en metadatos, o genera un nuevo `traceId` en formato W3C.
2. **Contexto de Seguridad**: Exige un `SecurityContext` válido. Comprueba el aislamiento multi-tenant (`tenantId`) fail-closed.
3. **Evaluación RBAC y SoD**: Comprueba que el principal posea el permiso requerido antes de ejecutar (`McpErrorCodes.Forbidden` / `-32002`).
4. **Rate Limiting**: Consulta `AgentRateLimiterPort`. Si el agente o principal excede su cuota o ráfaga, devuelve `RateLimited` (`-32004`) con `retryAfterMs`.
5. **Replay Idempotente**: Si la herramienta es idempotente y se provee `idempotencyKey`, consulta `ToolIdempotencyStorePort`. Las respuestas cacheadas se devuelven instantáneamente sin re-ejecutar.
6. **Suspensión HITL No Bloqueante**: Si la herramienta tiene riesgo `CRITICAL` o requiere aprobación humana, el error `ToolApprovalRequiredError` es interceptado:
   - Se crea una suspensión en `HITLBridgePort`.
   - Se retorna `isError: false` con estado `SUSPENDED_WAITING_FOR_APPROVAL`, `suspensionId` y `resumptionToken`.
7. **Taint Tracking**: Las herramientas marcadas con `openWorldHint: true` tienen su salida encapsulada en envoltorios manchados (`TaintedValue`), evitando inyección indirecta en el cliente MCP.
8. **Eventos de Auditoría**: Emite eventos `mcp.request.received`, `mcp.tool.invoked`, `mcp.tool.completed`, `mcp.hitl.suspended`, auditables en tiempo real.

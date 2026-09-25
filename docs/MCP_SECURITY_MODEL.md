# Modelo de Seguridad y Gobernanza MCP — AI Operating Platform

> **Documento Oficial de Seguridad:** `docs/MCP_SECURITY_MODEL.md`  
> **Iniciativa:** `AOP-MULTIAGENT-HARDENING` (GAP-07 / Track 4)  
> **Revisión:** 2026-09-25  

---

## 1. Principios de Seguridad del Servidor MCP

La exposición de capacidades operativas mediante el **Model Context Protocol (MCP)** introduce una superficie de contacto externa. Para neutralizar cualquier vector de ataque o riesgo de fuga, el adaptador implementa los siguientes controles de seguridad de grado enterprise:

### 1.1. Default-Deny (Fail-Closed)
- Todo request JSON-RPC que carezca de `SecurityContext` o credenciales válidas es rechazado con error `-32001` (`Unauthenticated`).
- El servidor MCP nunca asume identidad anónima con privilegios elevados.

### 1.2. Aislamiento Multi-Tenant Estricto
- Si el servidor MCP está configurado para un tenant específico (`tenantId: "tenant-acme"`), cualquier solicitud con un `SecurityContext` perteneciente a otro tenant es denegada con `-32003` (`TenantMismatch`).
- No es posible la ejecución cruzada de herramientas ni la inspección de recursos entre inquilinos.

### 1.3. Control de Acceso Basado en Roles (RBAC) y Segregación de Funciones (SoD)
- Cada herramienta define sus permisos requeridos (`definition.permissions`).
- El runtime evalúa los roles y permisos del principal antes de la ejecución. Si faltan permisos, retorna `-32002` (`Forbidden`).
- En herramientas de alto riesgo o destructivas, se impone Segregación de Funciones (SoD): el solicitante no puede auto-aprobarse (`SelfApprovalError`).

### 1.4. Blindaje contra Inyección de Prompts y Taint Tracking (GAP-01)
- Los parámetros de invocación de herramientas (`tools/call`) se validan contra esquemas JSON estrictos (`additionalProperties: false`, verificación contra prototipos contaminados `__proto__`, `constructor`).
- Las herramientas de mundo abierto (`openWorldHint: true`) o fuentes externas manchan su resultado con `TaintedValue`. El adaptador MCP no permite que datos externos no confiables dicten tokens de aprobación ni parámetros de control.

### 1.5. Prevención de Ataques de Denegación de Servicio (DoS) y Fuerza Bruta (GAP-03)
- Cada llamada es filtrada por `AgentRateLimiterPort`.
- Se aplican cuotas por ventana de tiempo (`windowMs`) y límites de ráfaga (`burstCapacity`).
- Si se excede la velocidad permitida, el servidor devuelve `-32004` (`RateLimited`) con el tiempo de espera sugerido (`retryAfterMs`).

### 1.6. Sanitización Total de Errores y Cero Fuga de Secretos
- Errores internos de motor, excepciones de base de datos o fallos de red son interceptados por `McpErrorMapper`.
- Queda terminantemente prohibido incluir trazas de pila (`stack traces`), rutas del sistema de archivos local (`/src/...`, `node_modules`) o credenciales en los mensajes devueltos al cliente MCP.
- Todo error reporta un `traceId` único para auditoría interna correlacionada.

---

## 2. Matriz de Códigos de Error MCP

| Código JSON-RPC / MCP | Nombre Canónico | Significado de Seguridad |
| :--- | :--- | :--- |
| `-32700` | `ParseError` | Payload no es JSON válido. |
| `-32600` | `InvalidRequest` | JSON-RPC 2.0 malformado o sin campos obligatorios. |
| `-32601` | `MethodNotFound` | Método desconocido o no expuesto. |
| `-32602` | `InvalidParams` | Esquema de argumentos inválido o falta de propiedad requerida. |
| `-32603` | `InternalError` | Error inesperado interno sanitizado. |
| `-32001` | `Unauthenticated` | Contexto de seguridad ausente o token inválido. |
| `-32002` | `Forbidden` | Permisos insuficientes (RBAC) o violación de política de seguridad. |
| `-32003` | `TenantMismatch` | Solicitud cruzada entre tenants denegada. |
| `-32004` | `RateLimited` / `ResourceNotFound` | Límite de velocidad excedido o recurso inexistente. |
| `-32005` | `ApprovalRequired` | Operación requiere aprobación humana para continuar. |

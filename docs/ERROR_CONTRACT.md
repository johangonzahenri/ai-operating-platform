# Standard API Error Contract (Contrato de Errores de API)
## Estructura Uniforme de Respuestas de Error y Códigos Canónicos (v1.1.0)

Todas las respuestas de error emitidas por la **Platform API** se ajustan estrictamente al estándar RFC 7807 (Problem Details for HTTP APIs).

---

## 1. Esquema JSON de Error

```json
{
  "error": {
    "code": "POLICY_VIOLATION",
    "message": "La operación solicitada viola la política de seguridad default-deny.",
    "statusCode": 403,
    "details": {
      "policyId": "allow-only-whitelisted-tools",
      "requiredPermission": "tools:execute:write"
    },
    "traceId": "trace-err-771a",
    "timestamp": "2026-09-16T18:40:00.000Z"
  }
}
```

---

## 2. Códigos de Error Canónicos

| Código de Error | HTTP Status | Racional Técnico |
| :--- | :--- | :--- |
| `VALIDATION_FAILED` | 400 | El esquema de entrada no cumple con la especificación JSON Schema / Zod. |
| `UNAUTHORIZED` | 401 | Credenciales de autenticación ausentes, inválidas o expiradas. |
| `POLICY_VIOLATION` | 403 | La política de seguridad *default-deny* denegó la operación solicitada. |
| `TASK_NOT_FOUND` | 404 | El `taskId` provisto no existe en el repositorio durable. |
| `OPTIMISTIC_CONCURRENCY_ERROR` | 409 | Colisión de versión OCC al intentar actualizar un registro con versión obsoleta. |
| `QUOTA_EXHAUSTED` | 429 | El inquilino ha superado su presupuesto mensual de tokens o llamadas. |
| `CRASH_RECOVERY_RECONCILED` | 500 | Tarea reconciliada como fallida tras un reinicio inesperado del servidor. |
| `INTERNAL_ERROR` | 500 | Excepción no contemplada en la infraestructura del servidor. |

# Standard API Error Contract (Contrato de Errores de API)
## Estructura Uniforme de Respuestas de Error y Códigos Canónicos (v1.3.0)

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
    "timestamp": "2026-09-19T20:30:00.000Z"
  }
}
```

---

## 2. Códigos de Error Canónicos

| Código de Error | HTTP Status | Racional Técnico |
| :--- | :--- | :--- |
| `VALIDATION_FAILED` | 400 | El esquema de entrada no cumple con la especificación JSON Schema / Zod. |
| `CONTRADICTORY_AUTH_HEADERS` | 400 | Se enviaron múltiples encabezados de autenticación con credenciales contradictorias. |
| `UNAUTHORIZED` | 401 | Credenciales de autenticación ausentes, inválidas o expiradas. |
| `KEY_NOT_FOUND` | 401 | La clave de API no existe en el registro seguro. |
| `INVALID_SECRET` | 401 | El secreto de la clave de API no coincide en la verificación timing-safe. |
| `KEY_EXPIRED` | 401 | La credencial de API ha superado su fecha límite de expiración. |
| `KEY_REVOKED` | 401 | La credencial de API ha sido revocada de forma explícita. |
| `FORBIDDEN` | 403 | Acceso denegado por políticas de autorización o RBAC. |
| `TENANT_MISMATCH` | 403 | El inquilino autenticado no coincide con el encabezado `X-Tenant-Id`. |
| `APPLICATION_MISMATCH` | 403 | La aplicación autenticada no coincide con el encabezado `X-Application-Id`. |
| `INSUFFICIENT_SCOPE` | 403 | La credencial autenticada carece del alcance de capacidad requerido (e.g. `tasks.create`). |
| `POLICY_VIOLATION` | 403 | La política de seguridad *default-deny* denegó la operación solicitada. |
| `NOT_FOUND` | 404 | El recurso solicitado no existe en el repositorio durable. |
| `CREDENTIAL_NOT_FOUND` | 404 | La credencial de API solicitada no existe dentro del límite del inquilino. |
| `CONFLICT` | 409 | Conflicto de estado o regla de unicidad en la entidad. |
| `CONCURRENCY_CONFLICT` | 409 | Colisión de versión OCC al intentar actualizar un registro con versión obsoleta. |
| `RATE_LIMIT_EXCEEDED` | 429 | El llamador ha excedido el límite de peticiones por segundo/minuto. |
| `QUOTA_EXHAUSTED` | 429 | El inquilino ha superado su presupuesto de tokens o llamadas. |
| `INTERNAL_SERVER_ERROR` | 500 | Excepción no contemplada en la infraestructura del servidor. |

# Standard API Error Contract

## 1. Overview

The **Enterprise API Gateway** enforces a deterministic, uniform error contract across all endpoints. Errors are sanitized to prevent secret leaks, internal filesystem disclosure, and stack trace exposure.

---

## 2. Standard Error Payload Schema

Every error response (`4xx` and `5xx`) adheres to the JSON schema:

```json
{
  "error": {
    "code": "VALIDATION | AUTHENTICATION | AUTHORIZATION | NOT_FOUND | CONFLICT | RATE_LIMITED | DEPENDENCY_UNAVAILABLE | DEVICE_UNAVAILABLE | CAPABILITY_UNSUPPORTED | INTERNAL",
    "message": "Human-readable sanitized error description.",
    "requestId": "req-9b8c-4f12",
    "correlationId": "corr-req-9b8c-4f12",
    "details": {
      "field": "Optional sanitized metadata without secrets"
    }
  },
  "status": 400
}
```

For backwards compatibility with v1 clients, top-level `error`, `status`, and `code` properties are maintained in HTTP JSON bodies.

---

## 3. Error Codes & HTTP Status Mapping

| Error Code | HTTP Status | Description |
|---|---|---|
| `VALIDATION` | 400 | Malformed JSON, invalid identifier format, missing required parameters |
| `AUTHENTICATION` | 401 | Missing or invalid API key, bearer token, or expired credentials |
| `AUTHORIZATION` | 403 | Insufficient RBAC permissions or tenant boundary violation |
| `NOT_FOUND` | 404 | Requested entity, task, device, application, or route does not exist |
| `CONFLICT` | 409 | Resource state conflict or idempotency key mismatch |
| `RATE_LIMITED` | 429 | Request rate exceeded tier limit (Global, Tenant, App, Principal, Device) |
| `DEVICE_UNAVAILABLE` | 503 | Hardware device is disconnected or offline |
| `CAPABILITY_UNSUPPORTED`| 400 | Requested capability is not supported by target hardware |
| `INTERNAL` | 500 | Unhandled server exception (stack trace omitted in production) |

---

## 4. Secret Scrubbing Guarantee

The gateway automatically intercepts error detail objects and scrubs sensitive parameters matching `/(secret|password|key|token|auth|bearer|private)/i`, replacing them with `[REDACTED]` to ensure zero token leakage in logs or responses.

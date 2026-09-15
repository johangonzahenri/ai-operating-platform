# SAAS & SECURITY HARDENING SPECIFICATION

## 1. Principio de Autoridad y Aislamiento Multi-Tenant

- **Aislamiento Estricto (Default-Deny)**: Ninguna solicitud puede acceder ni alterar datos de otro `tenantId`.
- **Derivación de Contexto Confiable**: El `tenantId` se deriva exclusivamente de la identidad autenticada (API Key / Token Bearer), nunca del cuerpo de la petición.

---

## 2. Tipos de Identidad (Principal Types)

1. **`HUMAN`**: Operadores y administradores humanos autenticados vía UI Console o Bearer token.
2. **`SERVICE`**: Clientes M2M externos (como *Tentaciones AI Commerce*) autenticados vía API Keys firmadas.
3. **`AGENT`**: Agentes de IA autónomos que operan dentro de los límites de sandbox del tenant.
4. **`TOOL`**: Herramientas registradas que invocan adaptadores bajo políticas RBAC.
5. **`SYSTEM`**: Tareas internas de reconciliación, durabilidad y recolección de basura.

---

## 3. Limitación de Tasa (Rate Limiting) y Protección contra Abusos

- Algoritmo de **Ventana Deslizante (Sliding Window)** por tenant, identidad y endpoint.
- Emisión de encabezados estándar:
  - `X-RateLimit-Limit`
  - `X-RateLimit-Remaining`
  - `X-RateLimit-Reset`
  - `Retry-After` (cuando se supera el límite).

---

## 4. Encabezados de Seguridad Web

- `Content-Security-Policy (CSP)`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Strict-Transport-Security (HSTS)`

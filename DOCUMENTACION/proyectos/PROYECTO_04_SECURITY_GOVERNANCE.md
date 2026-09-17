# Proyecto 04: Seguridad Empresarial & Gobernanza Fail-Closed
## Especificación de Ingeniería, Dominio y Estado Kanban

### 1. Ficha Técnica del Proyecto
* **Identificador:** `PRJ-04-SECURITY`
* **Área de Responsabilidad:** Autenticación Criptográfica, Autorización RBAC, Aislamiento Multi-Tenant y Políticas
* **Ubicación en Repositorio:** `src/domain/security/`, `src/infrastructure/security/`, `src/domain/policy/`
* **Línea Base de Pruebas:** 118 tests pass dedicados
* **Estado Kanban:** `DONE` (Operativo y Verificado en Producción)

---

### 2. Objetivos e Invariantes Fundamentales
1. **Gobernanza Fail-Closed (Default-Deny):** Cualquier operación, herramienta o invocación de modelo no permitida explícitamente por una política previa es rechazada de inmediato lanzando `PolicyViolationError` (ADR 0009, ADR-004).
2. **Aislamiento Multi-Tenant Estricto:** La identidad `tenantId` se extrae del contexto criptográfico de seguridad y se propaga inmutablemente. Los recursos de un tenant son inaccesibles por otro, fallando cerrado ante discrepancias (ADR-003).
3. **Verificación Asimétrica JWT & KeyStore Dinámico:** `JwtTokenVerifier` implementa RFC 7519 y RFC 7515 nativamente con firmas asimétricas `RS256` y `ES256`, soporte de rotación de claves públicas vía `KeyStore` y revocación explícita `revokeKey(kid)` (ADR 0025).
4. **Protección contra Prototype Pollution:** Toda carga de entrada recibida por herramientas se somete a validación estricta descartando claves como `__proto__`, `constructor` o `prototype`.
5. **Tokens de Aprobación para Riesgo Crítico:** Las herramientas clasificadas en el tier `CRITICAL` exigen un `approvalToken` explícito antes de su ejecución para prevenir acciones destructivas involuntarias.

---

### 3. Tablero Kanban Detallado de Fases

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [DONE] Fases 6, 43: Motor de Políticas y Default-Deny (v0.1, v1.1)                     │
│ • Evaluación previa a cualquier llamada de herramientas o modelos.                     │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ [DONE] Fase 44, 45: Aislamiento Multi-Tenant y Matriz de Control de Riesgos (v1.1)     │
│ • Roles `Admin`, `Operator`, `Viewer` y verificación de pertenencia a tenants.         │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ [DONE] Fase 55: Autenticación Asimétrica JWT y Rotación de Claves (`AOP-AUTH`) (v1.2)   │
│ • Verificación criptográfica RS256/ES256 nativa en `node:crypto` sin librerías externas.│
└────────────────────────────────────────────────────────────────────────────────────────┘
```

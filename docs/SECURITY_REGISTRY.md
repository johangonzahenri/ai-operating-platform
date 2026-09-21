# Registro de Seguridad y Cumplimiento (Security Registry)

Este registro documenta los controles de seguridad, barreras de aislamiento multi-tenant y mecanismos de defensa en profundidad implementados y verificados en la **AI Operating Platform**.

---

## 1. Principio Fundamental de Seguridad

$$\text{Toda operación no autorizada explícitamente se encuentra estrictamente denegada (Fail-Closed Default-Deny).}$$

La plataforma no asume confianza en ningún punto de entrada. Toda invocación proveniente de consumidores externos, interfaces web o modelos de lenguaje atraviesa validaciones de identidad, contexto y capacidades antes de interactuar con el motor central.

---

## 2. Catálogo de Controles de Seguridad Verificados

| Control ID | Nombre del Control | Estado | Evidencia en Código | Tests de Verificación | Documentación | Última Verificación |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **SEC-001** | Gobernanza Default-Deny | `IMPLEMENTED / OPERATIONAL` | `src/infrastructure/policy/in-memory-policy-gateway.ts`<br>`src/infrastructure/policy/rbac-policy-gateway.ts` | `tests/unit/observability-and-policy.test.ts`<br>`tests/unit/authorization-rbac.test.ts` (22 tests) | `docs/SECURITY_ARCHITECTURE.md`<br>`docs/AUTHORIZATION.md` | 2026-09-17 |
| **SEC-002** | Aislamiento Multi-Tenant Estricto | `IMPLEMENTED / OPERATIONAL` | `src/domain/security/boundaries.ts`<br>`src/domain/security/security.ts` | `tests/unit/security-boundaries.test.ts`<br>`tests/unit/adversarial-phase15-audit.test.ts` (18 tests) | `docs/SECURITY_CONTROL_MATRIX.md`<br>`docs/TENANCY_AND_QUOTAS.md` | 2026-09-17 |
| **SEC-003** | Aislamiento de Aplicaciones Satélites | `IMPLEMENTED / OPERATIONAL` | `src/domain/context/task-context.ts`<br>`src/domain/context/bounded-data.ts` | `tests/platform/tentaciones-platform-adapter.test.ts`<br>`tests/unit/task-context.test.ts` (16 tests) | `docs/APPLICATION_INTEGRATION.md`<br>`docs/APPLICATION_FACTORY.md` | 2026-09-17 |
| **SEC-004** | Listas Blancas de Capacidades (Tools & Models) | `IMPLEMENTED / OPERATIONAL` | `src/domain/agent/agent.ts`<br>`src/application/tools/tool-gateway.ts` | `tests/unit/agent.test.ts`<br>`tests/unit/tool-gateway.test.ts` (28 tests) | `docs/AGENT_TOOL_MODEL_SECURITY.md`<br>`docs/TOOL_CALLING.md` | 2026-09-17 |
| **SEC-005** | Sanitización y Ocultación de Secretos | `IMPLEMENTED / OPERATIONAL` | `src/infrastructure/security/token-verifier-adapter.ts`<br>`src/platform/api/http-router.ts` | `tests/unit/security-boundaries.test.ts`<br>`tests/platform/api.test.ts` (14 tests) | `docs/AUTHENTICATION.md`<br>`docs/THREAT_MODEL.md` | 2026-09-17 |
| **SEC-006** | Inmunidad XSS en Front-End (0 `innerHTML`) | `IMPLEMENTED / OPERATIONAL` | `src/platform/web/app.js`<br>`src/platform/web/index.html` | `tests/platform/operational-ui-hardening.test.ts`<br>`scripts/docs-check.mjs` (grep audit) | `docs/OPERATIONAL_CONSOLE.md`<br>`docs/PLATFORM_DASHBOARD.md` | 2026-09-17 |
| **SEC-007** | Consultas SQL 100% Parametrizadas | `IMPLEMENTED / OPERATIONAL` | `src/infrastructure/persistence/sqlite/sqlite-mapper.ts`<br>`src/infrastructure/persistence/sqlite/sqlite-database.ts` | `tests/unit/sqlite-persistence.test.ts`<br>`tests/integration/sqlite-core-runtime.integration.test.ts` (32 tests) | `docs/decisions/0015-durable-persistence-architecture.md` | 2026-09-17 |
| **SEC-008** | Restricción de Enlace de Red (Loopback 127.0.0.1) | `IMPLEMENTED / OPERATIONAL` | `src/platform/server.ts`<br>`src/infrastructure/config/config.ts` | `tests/platform/api.test.ts`<br>`tests/platform/diagnostics-api.test.ts` (12 tests) | `docs/CLOUD_DEPLOYMENT.md`<br>`docs/SAAS_SECURITY_HARDENING.md` | 2026-09-17 |
| **SEC-009** | Límites de Tamaño de Payload (1MB Max) | `IMPLEMENTED / OPERATIONAL` | `src/platform/api/http-router.ts`<br>`src/infrastructure/config/config.ts` | `tests/platform/api.test.ts` (HTTP 413 checks) | `docs/PLATFORM_API.md`<br>`docs/ERROR_CONTRACT.md` | 2026-09-17 |
| **SEC-010** | Rate Limiting Empresarial por Tenant | `IMPLEMENTED / OPERATIONAL` | `src/platform/api/http-router.ts`<br>`src/platform/api/platform-service.ts` | `tests/platform/api.test.ts` (HTTP 429 & Retry-After checks) | `docs/API_OPERATIONS.md`<br>`docs/TENANCY_AND_QUOTAS.md` | 2026-09-19 |
| **SEC-011** | Almacenamiento Zero-Plaintext de Credenciales API | `IMPLEMENTED / OPERATIONAL` | `src/domain/security/api-credential.ts`<br>`src/application/security/api-credential-service.ts` | `tests/unit/api-credential.test.ts`<br>`tests/integration/sqlite-api-credential-persistence.test.ts` (37 tests) | `docs/CREDENTIAL_GOVERNANCE.md`<br>`docs/decisions/0040-enterprise-api-authentication-and-credential-governance.md` | 2026-09-19 |
| **SEC-012** | Enlace Servidor de Principal, Tenant y Scopes | `IMPLEMENTED / OPERATIONAL` | `src/platform/api/http-router.ts`<br>`src/application/security/rbac-authorization-evaluator.ts` | `tests/platform/api-authentication.test.ts`<br>`tests/unit/api-credential-service.test.ts` (28 tests) | `docs/AUTHENTICATION.md`<br>`docs/AUTHORIZATION.md` | 2026-09-19 |
| **SEC-013** | Topología de Red Perimetral, Proxy Trust & Mitigación Host Poisoning | `IMPLEMENTED / OPERATIONAL` | `src/platform/api/http-router.ts`<br>`src/infrastructure/config/config.ts` | `tests/platform/network-topology-security.test.ts` (8 tests) | `docs/NETWORK_TOPOLOGY.md`<br>`docs/NETWORK_SECURITY.md`<br>`docs/decisions/0041-enterprise-network-topology-and-secure-api-exposure.md` | 2026-09-20 |
| **SEC-014** | Aislamiento Físico de Dispositivos de Negocio (Brother DCP-1600) | `IMPLEMENTED / OPERATIONAL` | `src/platform/api/http-router.ts`<br>`src/infrastructure/device/brother-printer-adapter.ts` | `tests/platform/network-topology-security.test.ts`<br>`tests/unit/brother-printer-adapter.test.ts` (15 tests) | `docs/DEVICE_REGISTRY.md`<br>`docs/NETWORK_SECURITY.md` | 2026-09-20 |
| **SEC-015** | Verificación Asimétrica OIDC / JWKS con Rotación Dinámica de Claves | `IMPLEMENTED / OPERATIONAL` | `src/infrastructure/security/jwt-token-verifier.ts`<br>`src/infrastructure/config/config.ts` | `tests/unit/jwt-authentication.test.ts`<br>`tests/platform/network-topology-security.test.ts` (12 tests) | `docs/AUTHENTICATION.md`<br>`docs/decisions/0043-production-identity-and-external-security-foundation.md` | 2026-09-20 |
| **SEC-016** | Cross-Enterprise Default Deny & Mandatos de Gobernanza Delegada | `IMPLEMENTED / OPERATIONAL` | `src/domain/portfolio/governance-mandate.ts`<br>`src/application/portfolio/portfolio-governance-service.ts` | `tests/unit/portfolio-governance.test.ts`<br>`tests/platform/multi-enterprise-governance.test.ts` (29 tests) | `docs/PORTFOLIO_GOVERNANCE.md`<br>`docs/decisions/0044-multi-enterprise-governance-and-portfolio-operating-model.md` | 2026-09-20 |
| **SEC-017** | Segregación de Funciones (SoD) en Ejecución Multi-Empresarial | `IMPLEMENTED / OPERATIONAL` | `src/application/workflow/workflow-orchestrator-service.ts`<br>`src/domain/workflow/verification-errors.ts`<br>`src/domain/workflow/approval-errors.ts` | `tests/unit/multi-enterprise-operational-runtime.test.ts`<br>`tests/platform/multi-enterprise-operational-runtime.test.ts` (33 tests) | `docs/decisions/0045-multi-enterprise-operational-runtime-and-governed-execution.md` | 2026-09-21 |
| **SEC-018** | Reconciliación Determinista de Mandatos & Inmutabilidad Histórica | `IMPLEMENTED / OPERATIONAL` | `src/domain/portfolio/mandate-reconciliation-policy.ts`<br>`src/application/portfolio/mandate-reconciliation-service.ts` | `tests/unit/mandate-reconciliation.test.ts`<br>`tests/platform/mandate-reconciliation.test.ts` (35 tests) | `docs/decisions/0046-governed-mandate-reconciliation-and-runtime-consistency.md` | 2026-09-21 |
| **SEC-019** | Exportación de Evidencia de Gobernanza, Redacción de Secretos & Sellado SHA-256 | `IMPLEMENTED / OPERATIONAL` | `src/domain/governance/evidence-export.ts`<br>`src/application/governance/evidence-export-service.ts` | `tests/unit/evidence-export.test.ts`<br>`tests/platform/evidence-export.test.ts` (32 tests) | `docs/decisions/0050-governance-and-compliance-evidence-export.md` | 2026-09-21 |

---

## 3. Matriz de Roles y Autorizaciones (RBAC)

La plataforma aplica control de acceso basado en roles con separación estricta de privilegios:

```text
ADMINISTRATOR ──> Acceso irrestricto de configuración, gobernanza, gestión de credenciales y diagnóstico global.
OPERATOR      ──> Creación, despacho, consulta y cancelación de tareas y operaciones del tenant.
AUDITOR       ──> Lectura exclusiva de telemetría, logs forenses, eventos y métricas de rendimiento.
APPLICATION   ──> Despacho restringido a las capacidades declaradas en el manifiesto de la aplicación.
ANONYMOUS     ──> Acceso exclusivo a endpoints de sondeo de salud públicos (/status, /health, /liveness).
```

Cualquier intento de escalamiento vertical (ej. una aplicación intentando alterar políticas de gobernanza o suplantar tenantId) resulta en terminación fail-closed inmediata (`HTTP 403 FORBIDDEN` / `TENANT_MISMATCH`).


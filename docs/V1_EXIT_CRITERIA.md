# Criterios de Salida y Certificación de Producción (V1 Exit Criteria)
## AI OPERATING PLATFORM — VERSIÓN CANÓNICA v1.3.0
### Documento Oficial de Criterios: Iniciativa `AOP-V1-EXIT` (Fase 73)

---

## 1. Estado de los Criterios de Certificación

| Criterio | Descripción | Evidencia Requerida | Estado Factual |
| :--- | :--- | :--- | :--- |
| **CRIT-01: Determinismo del Motor Central** | Toda ejecución de tareas y orquestaciones produce transiciones de estado deterministas e inmutables. | Suites unitarias y de integración de `CoreRuntime` con 100% de éxito. | ✅ **CUMPLIDO** (184 tests PASS) |
| **CRIT-02: Persistencia Relacional Duradera** | Almacenamiento desacoplado en SQLite WAL para tareas, ejecuciones, agentes, operaciones y eventos sin pérdida de memoria. | `SqliteDatabase` con claves foráneas activas y modo WAL verificado. | ✅ **CUMPLIDO** (148 tests PASS) |
| **CRIT-03: Reconciliación post-Crash Atómica** | Las entidades activas interrumpidas por caída transicionan atómicamente a estados terminales al reiniciar. | `RestartRecoveryService` verificado con pruebas de caída simulada. | ✅ **CUMPLIDO** (42 tests PASS) |
| **CRIT-04: Paridad de Contratos en Model Gateways** | Los adaptadores de OpenAI, Anthropic, Ollama, Gemini y Stub cumplen la misma interfaz tipada `ModelGateway`. | Pruebas de contrato y tests unitarios de adaptadores passing. | ✅ **CUMPLIDO** (64 tests PASS) |
| **CRIT-05: Controles de Seguridad Fail-Closed y RBAC** | Denegación por defecto, validación de permisos RBAC y aislamiento multi-tenant activo. | `tests/unit/security-boundaries.test.ts` y suites de RBAC sin fallos. | ✅ **CUMPLIDO** (118 tests PASS) |
| **CRIT-06: Inmunidad XSS en Consola Web** | La interfaz Single-Page Application no utiliza `innerHTML`, `outerHTML`, `eval` ni `document.write`. | Auditoría estática de código con cero incidencias DOM peligrosas. | ✅ **CUMPLIDO** (0 innerHTML) |
| **CRIT-07: Integración y Fallback de Aplicaciones** | Tentaciones AI Commerce y Vehicle Parts Platform interactúan mediante contratos estables con fallback garantizado. | Tests end-to-end golden journey y live integration en verde. | ✅ **CUMPLIDO** (138 tests PASS) |
| **CRIT-08: Telemetría y Observabilidad Inmutable** | Emisión de eventos tipados, métricas de rendimiento y endpoints forenses correlacionados por `traceId`. | `RuntimeDiagnosticsService` y `/api/v1/diagnostics` validados. | ✅ **CUMPLIDO** (123 tests PASS) |
| **CRIT-09: Verificación Automatizada de Documentación** | El script `scripts/docs-check.mjs` valida consistencia entre versiones, tests, documentos y ADRs. | Ejecución exitosa de `npm run docs:check` con código de salida 0. | ✅ **CUMPLIDO** (6/6 checks green) |
| **CRIT-10: Autenticación de Consumidores en Producción** | Implementación de proveedor formal JWT / OIDC con rotación de claves para despliegue público. | Proveedor OIDC/JWT implementado y verificado en `JwtTokenVerifier` (ADR 0025). | ✅ **CUMPLIDO EN CÓDIGO (OPEN GAP PARA IDP EN VIVO)** |
| **CRIT-11: Topología de Red y Terminación TLS** | Despliegue perimetral con proxy reverso (Nginx/Caddy) gestionando certificados SSL/TLS y cabeceras HSTS. | Manifiestos de infraestructura en `deploy/` y guía perimetral. | ✅ **DECLARADO Y VALIDADO (OPEN GAP PARA TLS EN VIVO)** |
| **CRIT-12: Memoria Contextual Duradera en SQLite** | Persistencia relacional de los ámbitos de memoria de agentes para evitar pérdida de contexto al reiniciar. | `SqliteMemoryGateway` implementado con suite de pruebas (ADR 0024). | ✅ **CUMPLIDO** (6 tests PASS) |
| **CRIT-13: Virtual Organization Hierarchy** | Jerarquía empresarial formal Organizaciones, Áreas, Equipos y Membresía gobernada de agentes con OCC. | `SqliteOrganizationRepository` e integración REST `/api/v1/*` (ADR 0027). | ✅ **CUMPLIDO** (34 tests PASS) |
| **CRIT-14: Team Resource Budget Enforcement** | Cuotas operacionales por equipo, fail-closed (`NO TEAM/BUDGET = DENY`), anti-bypass y overshoot exacto. | `TeamResourceBudget` integrado en runtime y repositorio con `BEGIN IMMEDIATE` (ADR 0028). | ✅ **CUMPLIDO** (45 tests PASS) |
| **CRIT-15: Enterprise Workflow & Verification** | Orquestación DAG acíclico, validación DFS, segregación de funciones y verificación determinista. | `WorkflowOrchestratorService`, `DeterministicVerifier` (ADR 0032, ADR 0033). | ✅ **CUMPLIDO** (57 tests PASS) |
| **CRIT-16: Human Oversight & Escalation** | Solicitudes de aprobación gobernadas, expiración, escalamiento y segregación de funciones (`Requester != Approver`). | `HumanOversightService` con persistencia SQLite WAL y OCC (ADR 0034). | ✅ **CUMPLIDO** (26 tests PASS) |
| **CRIT-17: Agent Lifecycle & AI Solution Factory** | Calificación cuantitativa por versión de perfil y catálogo declarativo de planos arquitectónicos inmutables. | `AgentLifecycleService`, `SolutionFactoryService` (ADR 0035, ADR 0036). | ✅ **CUMPLIDO** (60 tests PASS) |
| **CRIT-18: AI Enterprise OS & Executive Closed Loop** | Alineación estratégica de KPIs y orquestación ejecutiva de bucle cerrado gobernado. | `EnterpriseOperatingService`, `ExecutiveOrchestratorService` (ADR 0037, ADR 0038). | ✅ **CUMPLIDO** (54 tests PASS) |
| **CRIT-19: Autonomous Operations Runtime** | Daemon 24/7 con disparadores multi-modales, leases de concurrencia y disyuntor de seguridad. | `AutonomousOperationsRuntime` con leases y parada de emergencia (ADR 0039). | ✅ **CUMPLIDO** (19 tests PASS) |
| **CRIT-20: Credenciales API & Seguridad Perimetral** | Almacenamiento zero-plaintext SHA-256, binding seguro `127.0.0.1`, proxy trust y cabeceras estrictas. | `ApiCredentialService`, enrutador HTTP perimetral (ADR 0040, ADR 0041). | ✅ **CUMPLIDO** (45 tests PASS) |

---

## 2. Semántica Formal de Certificación de Release

Se definen tres estados de certificación formal:

1. **`V1 RELEASE READY`:**
   - La totalidad de los criterios internos y ambientales (incluyendo terminación TLS en host público y conexión JWKS en vivo con IdP corporativo) están 100% operativos sobre red pública.
2. **`CERTIFIED WITH OPEN GAPS`:**
   - Todos los invariantes internos de arquitectura hexagonal, determinismo del motor, persistencia SQLite WAL, seguridad fail-closed, presupuesto por equipos, runtime autónomo, autenticación y seguridad perimetral (18 de 20 criterios) están **100% CUMPLIDOS Y VERIFICADOS** en código y suites de pruebas (1399 tests PASS).
   - Existen brechas ambientales externas declaradas (`GAP-INF-01: Edge TLS Live Termination` y `GAP-SEC-01: External OIDC/JWKS Live IdP Connection`), que requieren aprovisionamiento en el host físico de despliegue en nube.
3. **`NOT CERTIFIED`:**
   - Uno o más invariantes críticos internos presentan regresiones o fallos en pruebas.

---

## 3. Dictamen Oficial de Certificación (v1.3.0)

* **Clasificación Oficial del Release:** **`CERTIFIED WITH OPEN GAPS`**
* **Línea Base de Pruebas:** 1399 tests PASS / 0 FAIL / 0 SKIPPED / 0 CANCELLED across 59 suites nativas Node.js.
* **Estado en Roadmap Master (`AOP-V1-EXIT`):** **`DONE`** (Certificación completada formalmente).
* **Documentos Oficiales:** [`docs/RELEASE_CERTIFICATION_V1.md`](RELEASE_CERTIFICATION_V1.md) y [`docs/V1_RELEASE_READINESS.md`](V1_RELEASE_READINESS.md).

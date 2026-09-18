# Criterios de Salida y Certificación de Producción (v1.0 / v1.1 / v1.2 / v1.3 Exit Criteria)

Este documento define la lista formal y verificable de criterios que determinan la madurez de la **AI Operating Platform** para su certificación y despliegue en entornos de producción.

---

## 1. Estado de los Criterios de Certificación

| Criterio | Descripción | Evidencia Requerida | Estado |
| :--- | :--- | :--- | :--- |
| **CRIT-01: Determinismo del Motor Central** | Toda ejecución de tareas y orquestaciones produce transiciones de estado deterministas e inmutables. | Suites unitarias y de integración de `CoreRuntime` con 100% de éxito. | ✅ **CUMPLIDO** (184 tests PASS) |
| **CRIT-02: Persistencia Relacional Duradera** | Almacenamiento desacoplado en SQLite WAL para tareas, ejecuciones, agentes y eventos sin pérdida de memoria. | `SqliteDatabase` con claves foráneas activas y modo WAL verificado. | ✅ **CUMPLIDO** (148 tests PASS) |
| **CRIT-03: Reconciliación post-Crash Atómica** | Las tareas y operaciones interrumpidas por apagado imprevisto transicionan atómicamente a estados terminales al reiniciar. | `RestartRecoveryService` verificado con pruebas de caída simulada. | ✅ **CUMPLIDO** (42 tests PASS) |
| **CRIT-04: Paridad de Contratos en Model Gateways** | Los adaptadores de OpenAI, Anthropic, Ollama, Gemini y Stub cumplen la misma interfaz tipada `ModelGateway`. | Pruebas de contrato y tests unitarios de adaptadores passing. | ✅ **CUMPLIDO** (64 tests PASS) |
| **CRIT-05: Controles de Seguridad Fail-Closed y RBAC** | Denegación por defecto, validación de permisos RBAC y aislamiento multi-tenant activo. | `tests/unit/security-boundaries.test.ts` sin fallos. | ✅ **CUMPLIDO** (118 tests PASS) |
| **CRIT-06: Inmunidad XSS en Consola Web** | La interfaz Single-Page Application no utiliza `innerHTML` en ningún componente ni vista. | Auditoría estática de código con cero incidencias de `innerHTML`. | ✅ **CUMPLIDO** (0 innerHTML) |
| **CRIT-07: Integración y Fallback de Aplicaciones** | Tentaciones AI Commerce y Vehicle Parts Platform interactúan mediante contratos estables con fallback garantizado. | Tests end-to-end golden journey y live integration en verde. | ✅ **CUMPLIDO** (138 tests PASS) |
| **CRIT-08: Telemetría y Observabilidad Inmutable** | Emisión de eventos tipados, métricas de rendimiento y endpoints forenses correlacionados por `traceId`. | `RuntimeDiagnosticsService` y `/api/v1/diagnostics` validados. | ✅ **CUMPLIDO** (123 tests PASS) |
| **CRIT-09: Verificación Automatizada de Documentación** | El script `scripts/docs-check.mjs` valida consistencia entre versiones, tests, documentos y ADRs. | Ejecución exitosa de `npm run docs:check` con código de salida 0. | ✅ **CUMPLIDO** (docs:check green) |
| **CRIT-10: Autenticación de Consumidores en Producción** | Implementación de proveedor formal JWT / OIDC con rotación de claves para despliegue público en internet. | Proveedor OIDC/JWT implementado y verificado en `JwtTokenVerifier` (ADR 0025). | ✅ **CUMPLIDO EN CÓDIGO (GAP-03 RESUELTO)** (4 tests criptográficos) |
| **CRIT-11: Topología de Red y Terminación TLS** | Despliegue perimetral con proxy reverso (Nginx/Caddy) gestionando certificados SSL/TLS y cabeceras HSTS. | Manifiestos de infraestructura en `deploy/` y guía `docs/PRODUCTION_NETWORK_TOPOLOGY.md`. | ✅ **DECLARADO Y VALIDADO (GAP-04 RESUELTO)** |
| **CRIT-12: Memoria Contextual Duradera en SQLite** | Persistencia relacional de los ámbitos de memoria de agentes para evitar pérdida de contexto al reiniciar. | `SqliteMemoryGateway` implementado con suite de pruebas (ADR 0024). | ✅ **CUMPLIDO (GAP-02 RESUELTO)** (6 tests PASS) |
| **CRIT-13: Virtual Organization Hierarchy** | Jerarquía empresarial formal Organizaciones, Áreas, Equipos y Membresía gobernada de agentes con OCC. | `SqliteOrganizationRepository` e integración REST `/api/v1/*` (ADR 0027). | ✅ **CUMPLIDO** (34 tests PASS) |
| **CRIT-14: Team Resource Budget Enforcement** | Cuotas operacionales por equipo, fail-closed (`NO TEAM = DENY`, `NO BUDGET = DENY`), anti-bypass y overshoot exacto. | `TeamResourceBudget` integrado en runtime y repositorio con `BEGIN IMMEDIATE` (ADR 0028). | ✅ **CUMPLIDO** (45 tests PASS) |

---

## 2. Dictamen de Certificación

* **Baseline Local / Entornos Controlados (v1.3.0):** **CERTIFICADO** (1064 tests PASS, 0 FAIL, persistencia duradera SQLite, recuperación post-crash, Control Plane bilingüe, presupuestos gobernados y adaptadores de IA operativos).
* **Baseline Nube Pública Empresarial (v1.3.0):** **CERTIFIED WITH OPEN GAPS** (Código, seguridad y manifiestos 100% listos; requiere inyección de certificados TLS y JWKS IdP en el host físico de producción).
* **Documento Oficial de Certificación:** Véase `docs/RELEASE_CERTIFICATION_V1.md`.


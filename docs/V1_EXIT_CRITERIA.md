# Criterios de Salida y Certificación de Producción (v1.0 / v1.1 Exit Criteria)

Este documento define la lista formal y verificable de criterios que determinan la madurez de la **AI Operating Platform** para su certificación y despliegue en entornos de producción.

---

## 1. Estado de los Criterios de Certificación

| Criterio | Descripción | Evidencia Requerida | Estado |
| :--- | :--- | :--- | :--- |
| **CRIT-01: Determinismo del Motor Central** | Toda ejecución de tareas y orquestaciones produce transiciones de estado deterministas e inmutables. | Suites unitarias y de integración de `CoreRuntime` con 100% de éxito. | ✅ **CUMPLIDO** (184 tests PASS) |
| **CRIT-02: Persistencia Relacional Duradera** | Almacenamiento desacoplado en SQLite WAL para tareas, ejecuciones, agentes y eventos sin pérdida de memoria. | `SqliteDatabase` con claves foráneas activas y modo WAL verificado. | ✅ **CUMPLIDO** (142 tests PASS) |
| **CRIT-03: Reconciliación post-Crash Atómica** | Las tareas y operaciones interrumpidas por apagado imprevisto transicionan atómicamente a estados terminales al reiniciar. | `RestartRecoveryService` verificado con pruebas de caída simulada. | ✅ **CUMPLIDO** (42 tests PASS) |
| **CRIT-04: Paridad de Contratos en Model Gateways** | Los adaptadores de OpenAI, Anthropic, Ollama y Stub cumplen la misma interfaz tipada `ModelGateway`. | Pruebas de contrato y tests unitarios de adaptadores passing. | ✅ **CUMPLIDO** (56 tests PASS) |
| **CRIT-05: Controles de Seguridad Fail-Closed y RBAC** | Denegación por defecto, validación de permisos RBAC y aislamiento multi-tenant activo. | `tests/unit/security-boundaries.test.ts` sin fallos. | ✅ **CUMPLIDO** (114 tests PASS) |
| **CRIT-06: Inmunidad XSS en Consola Web** | La interfaz Single-Page Application no utiliza `innerHTML` en ningún componente ni vista. | Auditoría estática de código con cero incidencias de `innerHTML`. | ✅ **CUMPLIDO** (0 innerHTML) |
| **CRIT-07: Integración y Fallback de Aplicaciones** | Tentaciones AI Commerce y Vehicle Parts Platform interactúan mediante contratos estables con fallback garantizado. | Tests end-to-end golden journey y live integration en verde. | ✅ **CUMPLIDO** (138 tests PASS) |
| **CRIT-08: Telemetría y Observabilidad Inmutable** | Emisión de eventos tipados, métricas de rendimiento y endpoints forenses correlacionados por `traceId`. | `RuntimeDiagnosticsService` y `/api/v1/diagnostics` validados. | ✅ **CUMPLIDO** (122 tests PASS) |
| **CRIT-09: Verificación Automatizada de Documentación** | El script `scripts/docs-check.mjs` valida consistencia entre versiones, tests, documentos y ADRs. | Ejecución exitosa de `npm run docs:check` con código de salida 0. | ✅ **CUMPLIDO** (docs:check green) |
| **CRIT-10: Autenticación de Consumidores en Producción** | Implementación de proveedor formal JWT / OIDC con rotación de claves para despliegue público en internet. | Proveedor OIDC/JWT implementado y verificado. | ⏳ **PENDIENTE (GAP-03 / v1.2)** |
| **CRIT-11: Topología de Red y Terminación TLS** | Despliegue perimetral con proxy reverso (Nginx/Caddy) gestionando certificados SSL/TLS y cabeceras HSTS. | Manifiestos de infraestructura y prueba de conexión HTTPS. | ⏳ **PENDIENTE (GAP-04 / v1.2)** |
| **CRIT-12: Memoria Contextual Duradera en SQLite** | Persistencia relacional de los ámbitos de memoria de agentes para evitar pérdida de contexto al reiniciar. | `SqliteMemoryGateway` implementado con suite de pruebas. | ⏳ **PENDIENTE (GAP-02 / v1.2)** |

---

## 2. Dictamen de Certificación

* **Baseline Local / Entornos Controlados (v1.1.0):** **APROBADO** (966 tests PASS, 0 FAIL, persistencia duradera SQLite, recuperación post-crash, Control Plane bilingüe y adaptadores de IA operativos).
* **Baseline Nube Pública Empresarial (v1.2):** **CONDICIONADO** a la resolución de los criterios pendientes CRIT-10, CRIT-11 y CRIT-12 programados en el Roadmap Maestro.

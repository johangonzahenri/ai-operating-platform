# Tablero Maestro Kanban — AI Operating Platform
## Seguimiento de Ingeniería, Ciclo de Vida y Roadmap Multi-Proyecto (v1.2.0)

> **Regla Canónica de Verdad (ADR-100-01):**
> $\text{Código} > \text{Tests} > \text{Git} > \text{Documentación} > \text{Roadmap} > \text{Excel}$
> Ninguna tarjeta o tarea en este tablero puede ostentar el estado `DONE` sin pruebas automatizadas verificadas (`node --test`), compilación limpia (`tsc`) y registro arquitectónico (ADR).

---

## 1. Métricas Consolidadas del Tablero

```text
===================================================================================
  ESTADO DEL TABLERO KANBAN — CONSOLIDADO DE INGENIERÍA
===================================================================================
  Iniciativas Totales Catalogadas : 39
  [DONE]      Completadas & Verificadas : 38 (97.4%)
  [REVIEW]    En Revisión / Auditoría   : 0  (0.0%)
  [TODO]      Planificadas / Listas     : 0  (0.0%)
  [BACKLOG]   Backlog Futuro Bounded    : 1  (2.6%)
  ---------------------------------------------------------------------------------
  Línea Base de Pruebas (Test Suite)    : 1399 PASS / 0 FAIL (59 Suites / 100%)
  Dependencias de Producción en Runtime : 0 NPM Runtime Dependencies
  Versión Canónica de Plataforma        : v1.3.0
===================================================================================

```

---

## 2. Definición de Estados del Flujo Kanban (Workflow Policies)

| Estado | Significado Operativo | Criterio de Entrada (DoR) | Criterio de Salida (DoD) |
| :--- | :--- | :--- | :--- |
| **`BACKLOG`** | Iniciativa conceptual o futura aprobada formalmente. | Definición de problema y justificación arquitectónica. | Especificación formal y estimación técnica preliminar. |
| **`TO DO`** | Tarea planificada con alcance cerrado para la iteración actual. | Requisitos funcionales claros y límites de invariantes. | Asignación de diseño y dependencias listas. |
| **`IN PROGRESS`** | Implementación activa en código fuente (`src/`). | Tarea en `TO DO`, rama de trabajo lista. | Código compilando con `tsc` sin errores. |
| **`IN REVIEW`** | Auditoría de código, verificación de seguridad y pruebas. | Pruebas unitarias escritas y pasando localmente. | Aprobación de auditoría de seguridad y 0 regresiones. |
| **`DONE`** | Código productivo verificado, tests al 100%, ADR y doc sincronizados. | Tests unitarios y de integración PASS, ADR publicado. | Commit registrado, `docs-check.mjs` PASS, Excel actualizado. |

---

## 3. Tablero General por Proyectos y Fases

### Proyecto 1: Core Engine & Tiempo de Ejecución Autónomo
*Liderazgo de Dominio: Core Platform Team | Repositorio: `src/domain/`, `src/application/`*

| ID Tarjeta | Título de la Tarea / Capacidad | Fase | Estado | Evidencia de Código | Cobertura de Tests | Decisión (ADR) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **COR-01** | Máquina de Estados de `Task` y `Execution` | Fase 1-4 | `DONE` | `src/domain/task/task.ts`, `src/domain/execution/execution.ts` | 38 tests pass | ADR 0004 |
| **COR-02** | Rehidratación Formal Inmutable de Dominio | Fase 11 | `DONE` | `Task.rehydrate()`, `Execution.rehydrate()` | 24 tests pass | ADR 0016, ADR 0017 |
| **COR-03** | Presupuesto y Bucle Autónomo Acotado (`AutonomyBudget`) | Fase 9 | `DONE` | `src/domain/autonomy/`, `autonomous-orchestrator.ts` | 42 tests pass | ADR 0012, ADR 0013 |
| **COR-04** | Persistencia Relacional SQLite WAL (`SqliteDatabase`) | Fase 10 | `DONE` | `src/infrastructure/persistence/sqlite/sqlite-database.ts` | 34 tests pass | ADR 0015 |
| **COR-05** | Repositorios SQLite de Tareas y Ejecuciones | Fase 12 | `DONE` | `sqlite-task-repository.ts`, `sqlite-execution-repository.ts` | 28 tests pass | ADR 0019 |
| **COR-06** | Servicio Atómico de Recuperación Post-Crash | Fase 13 | `DONE` | `src/application/recovery/restart-recovery-service.ts` | 18 tests pass | ADR 0020 |
| **COR-07** | Coordinador Jerárquico Multi-Agente | Fase 16 | `DONE` | `src/application/multi-agent-coordinator.ts` | 14 tests pass | ADR 0011 |
| **COR-08** | Checkpoint Distribuido Multi-Nodo de Operaciones | Fase 60+ | `BACKLOG` | N/A (Diseñado para clustering futuro) | 0 tests | Backlog v2.0 |

---

### Proyecto 2: Platform Gateway & Control Plane Web
*Liderazgo de Dominio: Platform API & UI Team | Repositorio: `src/platform/`*

| ID Tarjeta | Título de la Tarea / Capacidad | Fase | Estado | Evidencia de Código | Cobertura de Tests | Decisión (ADR) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **PLT-01** | Servidor HTTP Nativo Node.js sin Frameworks | Fase 7, 21 | `DONE` | `src/platform/server.ts`, `src/platform/api/http-router.ts` | 32 tests pass | ADR 0010 |
| **PLT-02** | Cliente SDK Tipado en TypeScript (`PlatformClient`) | Fase 22 | `DONE` | `src/platform-client/index.ts` | 16 tests pass | ADR-006 |
| **PLT-03** | Consola Web SPA en Vanilla JS con Cero `innerHTML` | Fase 23 | `DONE` | `src/platform/web/app.js`, `src/platform/web/index.html` | 48 tests pass | ADR 0010 |
| **PLT-04** | Soporte Bilingüe Sincronizado (`es-419` / `en`) | Fase 54 | `DONE` | `src/platform/web/i18n/locale-es-419.js`, `locale-en.js` | 12 tests pass | ADR-100-03 |
| **PLT-05** | Almacén Durable de Eventos (`SqliteEventStore`) | Fase 13 | `DONE` | `src/infrastructure/persistence/sqlite/sqlite-event-store.ts` | 22 tests pass | ADR 0021 |
| **PLT-06** | Diagnósticos Forenses en Tiempo de Ejecución | Fase 14 | `DONE` | `src/application/diagnostics/runtime-diagnostics.ts` | 16 tests pass | ADR 0022 |
| **PLT-07** | Convergencia de API `/api/v1` y Cabeceras RFC 8594 | Fase 55 | `DONE` | `src/platform/api/http-router.ts` | 1 test pass | ADR-100-05 |
| **PLT-08** | Streaming Operacional Reactivo (SSE) | Fase 59 | `DONE` | `src/application/observability/event-stream-adapter.ts`, `src/platform/api/http-router.ts` | 8 tests pass | ADR 0029 |

---

### Proyecto 3: Pasarelas de Modelos & AI Runtime
*Liderazgo de Dominio: AI Engineering Team | Repositorio: `src/infrastructure/model/`*

| ID Tarjeta | Título de la Tarea / Capacidad | Fase | Estado | Evidencia de Código | Cobertura de Tests | Decisión (ADR) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **MOD-01** | Adaptador OpenAI (`gpt-4o`, `gpt-4o-mini`) | Fase 36 | `DONE` | `src/infrastructure/model/openai/` | 10 tests pass | ADR 0005 |
| **MOD-02** | Adaptador Anthropic Claude (`claude-3-5-sonnet`) | Fase 37 | `DONE` | `src/infrastructure/model/anthropic/` | 10 tests pass | ADR 0005 |
| **MOD-03** | Adaptador Ollama Local (`127.0.0.1:11434`) | Fase 38 | `DONE` | `src/infrastructure/model/ollama/` | 10 tests pass | ADR 0005 |
| **MOD-04** | Adaptador Google Gemini / Vertex AI | Fase 55 | `DONE` | `src/infrastructure/model/gemini/gemini-model-gateway.ts` | 8 tests pass | ADR 0023 |
| **MOD-05** | Fábrica de Proveedores y Router de Fallback a Stub | Fase 39 | `DONE` | `src/infrastructure/model/provider-factory.ts` | 14 tests pass | ADR 0005 |
| **MOD-06** | Pasarela de Memoria Contextual SQLite WAL | Fase 55 | `DONE` | `src/infrastructure/memory/sqlite-memory-gateway.ts` | 6 tests pass | ADR 0024 |

---

### Proyecto 4: Seguridad Empresarial & Gobernanza Fail-Closed
*Liderazgo de Dominio: Security Architecture Team | Repositorio: `src/domain/security/`, `src/infrastructure/security/`*

| ID Tarjeta | Título de la Tarea / Capacidad | Fase | Estado | Evidencia de Código | Cobertura de Tests | Decisión (ADR) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | Gobernanza Fail-Closed Default-Deny (`PolicyGateway`) | Fase 6, 43 | `DONE` | `src/domain/policy/`, `src/infrastructure/policy/` | 26 tests pass | ADR 0009, ADR-004 |
| **SEC-02** | Aislamiento Estricto Multi-Tenant (`tenantId`) | Fase 44 | `DONE` | `src/domain/security/boundaries.ts` | 18 tests pass | ADR-003 |
| **SEC-03** | Verificador Criptográfico Asimétrico JWT (RS256/ES256) | Fase 55 | `DONE` | `src/infrastructure/security/jwt-token-verifier.ts` | 4 tests pass | ADR 0025 |
| **SEC-04** | Rotación Dinámica y Revocación de Claves en KeyStore | Fase 55 | `DONE` | `InMemoryKeyStore` con resolución `kid` y `revokeKey` | 4 tests pass | ADR 0025 |
| **SEC-05** | Tokens de Aprobación para Herramientas Críticas | Fase 45 | `DONE` | `src/infrastructure/tool/tool-invocation-runtime.ts` | 12 tests pass | ADR 0005 |
| **SEC-06** | Sanitización y Redacción Preventiva de Secretos | Fase 46 | `DONE` | `src/platform/api/http-router.ts` | 8 tests pass | ADR-004 |
| **SEC-07** | Gobernanza de Credenciales API y Autenticación Multi-Tenant | Fase 71 | `DONE` | `src/domain/security/api-credential.ts`, `sqlite-api-credential-repository.ts` | 37 tests pass | ADR 0040 |
| **SEC-08** | Topología de Red Perimetral y Exposición Segura de APIs | Fase 72 | `DONE` | `src/platform/api/http-router.ts`, `src/infrastructure/config/config.ts` | 8 tests pass | ADR 0041 |

---

### Proyecto 5: Virtual Organization Foundation & Agentes
*Liderazgo de Dominio: Enterprise Architecture Team | Repositorio: `src/domain/organization/`, `src/application/organization/`*

| ID Tarjeta | Título de la Tarea / Capacidad | Fase | Estado | Evidencia de Código | Cobertura de Tests | Decisión (ADR) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **ORG-01** | Agregado `Agent` con Lista Blanca y OCC | Fase 8, 49 | `DONE` | `src/domain/agent/agent.ts`, `sqlite-agent-repository.ts` | 32 tests pass | ADR 0011, ADR 0018 |
| **ORG-02** | Agregado `Organization` con Ciclo de Vida Soft | Fase 56 | `DONE` | `src/domain/organization/organization.ts` | 9 tests pass | ADR 0027 |
| **ORG-03** | Entidades Departamentales `Area` y `Team` | Fase 56 | `DONE` | `src/domain/organization/area.ts`, `team.ts` | 8 tests pass | ADR 0027 |
| **ORG-04** | Membresía de Agentes con Roles (`AgentMembership`) | Fase 56 | `DONE` | `src/domain/organization/agent-membership.ts` | 7 tests pass | ADR 0027 |
| **ORG-05** | Repositorio Relacional `SqliteOrganizationRepository` | Fase 56 | `DONE` | `sqlite-organization-repository.ts` | 10 tests pass | ADR 0027 |
| **ORG-06** | Endpoints Canónicos `/api/v1/organizations/*` | Fase 56 | `DONE` | `src/platform/api/http-router.ts` | 8 tests pass | ADR 0027 |
| **ORG-07** | Consola Interactiva de Organización en Control Plane | Fase 56 | `DONE` | `src/platform/web/app.js` (0 `innerHTML`) | E2E Validado | ADR 0027 |
| **ORG-08** | Presupuestos y Asignación de Recursos por Equipo | Fase 57 | `DONE` | `src/domain/organization/team-resource-budget.ts`, `sqlite-team-resource-budget-repository.ts` | 24 tests pass | ADR 0028 |
| **ORG-09** | Coordinación Organizacional entre Agentes con OCC y Cuotas | Fase 60 | `DONE` | `src/domain/organization/organizational-coordination.ts`, `src/application/organization/organizational-coordination-service.ts` | 23 tests pass | ADR 0030 |
| **ORG-10** | Gobernanza de Roles, Responsabilidades y Capacidades de Agentes | Fase 61 | `DONE` | `src/domain/organization/agent-profile.ts`, `src/application/organization/agent-profile-service.ts` | 27 tests pass | ADR 0031 |
| **ORG-11** | Orquestación de Flujos de Trabajo & Asignación Gobernada de Tareas | Fase 62 | `DONE` | `src/domain/workflow/`, `src/application/workflow/` | 29 tests pass | ADR 0032 |
| **ORG-12** | Verificación y Validación de Resultados de Flujo | Fase 63 | `DONE` | `src/domain/workflow/verification-*`, `src/application/workflow/*verification*` | 28 tests pass | ADR 0033 |
| **ORG-13** | Supervisión Humana, Aprobación & Escalamiento Gobernada | Fase 64 | `DONE` | `src/domain/workflow/approval-*`, `src/application/workflow/human-oversight-service.ts` | 26 tests pass | ADR 0034 |
| **ORG-14** | Ciclo de Vida, Evaluación y Gobernanza de Agentes | Fase 65 | `DONE` | `src/domain/agent/agent-lifecycle*`, `src/application/agent/agent-lifecycle-service.ts` | 28 tests pass | ADR 0035 |
| **ORG-15** | AI Solutions Factory & Application Blueprint Governance | Fase 66 | `DONE` | `src/domain/solution/`, `src/application/solution/`, `sqlite-solution-repository.ts` | 32 tests pass | ADR 0036 |
| **ORG-16** | AI Enterprise Operating System & Executive Governance Foundation | Fase 67 | `DONE` | `src/domain/business/`, `src/application/business/`, `sqlite-business-repository.ts` | 26 tests pass | ADR 0037 |
| **ORG-17** | Executive Orchestrator & Closed-Loop Business Operations | Fase 68 | `DONE` | `src/domain/executive/`, `src/application/executive/`, `sqlite-executive-repository.ts` | 28 tests pass | ADR 0038 |
| **ORG-18** | Autonomous Operations Runtime & Continuous Business Governance | Fase 69 | `DONE` | `src/domain/autonomous/`, `src/application/autonomous/`, `sqlite-autonomous-repository.ts` | 16 tests pass | ADR 0039 |

---

### Proyecto 6: Aplicaciones Satélites del Ecosistema
*Liderazgo de Dominio: Ecosystem Solutions Team | Repositorio: `src/application/platform/`, `examples/`*

| ID Tarjeta | Título de la Tarea / Capacidad | Fase | Estado | Evidencia de Código | Cobertura de Tests | Decisión (ADR) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **APP-01** | Tentaciones AI Commerce Integration | Fase 50 | `DONE` | `tentaciones-platform-adapter.ts` | 38 tests pass | ADR-008 |
| **APP-02** | Probador Virtual 3D / AR con Perfiles de Avatar | Fase 51 | `DONE` | `tests/unit/ar-virtual-fitting.test.ts` | 12 tests pass | ADR-009 |
| **APP-03** | Vehicle Parts Platform Reference App | Fase 53 | `DONE` | `tests/unit/vehicle-parts-reference-app.test.ts` | 16 tests pass | ADR-007 |
| **APP-04** | Fábrica de Aplicaciones (Application Factory 2.0) | Fase 54 | `DONE` | `src/platform/web/app.js`, `application-factory.test.ts` | 12 tests pass | ADR-007 |

---

### Proyecto 7: Dispositivos Físicos & Spooler de Hardware
*Liderazgo de Dominio: Hardware & Peripheral Team | Repositorio: `src/infrastructure/device/`*

| ID Tarjeta | Título de la Tarea / Capacidad | Fase | Estado | Evidencia de Código | Cobertura de Tests | Decisión (ADR) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **DEV-01** | Adaptador de Impresora Brother DCP-1600 en `USB001` | Fase 52 | `DONE` | `src/infrastructure/device/brother-printer-adapter.ts` | 14 tests pass | ADR 0010 |
| **DEV-02** | Cola de Trabajos de Impresión (`PrintJob`) en SQLite | Fase 52 | `DONE` | `sqlite-database.ts`, `platform-service.ts` | 10 tests pass | ADR 0015 |
| **DEV-03** | Reporte Honesto de Consumibles Offline (GAP-07) | Fase 52 | `DONE` | `brother-printer-adapter.ts` (`UNSUPPORTED`) | 4 tests pass | ADR-010 |

---

### Proyecto 8: Infraestructura Cloud & Topología Perimetral
*Liderazgo de Dominio: DevSecOps & Infrastructure Team | Repositorio: `deploy/`, `.github/`*

| ID Tarjeta | Título de la Tarea / Capacidad | Fase | Estado | Evidencia de Código | Cobertura de Tests | Decisión (ADR) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **INF-01** | Manifiestos de Producción Nginx con TLS 1.3 y HSTS | Fase 55 | `DONE` | `deploy/nginx/nginx.conf` | Config verificada | ADR 0026 |
| **INF-02** | Configuración Caddy v2 con Emisión ACME Automática | Fase 55 | `DONE` | `deploy/caddy/Caddyfile` | Config verificada | ADR 0026 |
| **INF-03** | Orquestación Docker Compose Multi-Contenedor | Fase 55 | `DONE` | `deploy/docker-compose.prod.yml` | Compose validado | ADR 0026 |
| **INF-04** | Pipeline CI/CD en GitHub Actions con Puertas de Calidad | Fase 55 | `DONE` | `.github/workflows/ci.yml` | CI passing | ADR-100-01 |
| **INF-05** | Certificación Final de Criterios de Producción (`AOP-V1-EXIT`) | Fase 73 | `DONE` | `docs/RELEASE_CERTIFICATION_V1.md`, `docs/V1_RELEASE_READINESS.md` | 1399 tests pass | ADR 0042 |

---

## 4. Próximas Fases en el Flujo de Trabajo

```text
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ FLUJO DE ACCIÓN INMEDIATA                                                                  │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│ 1. [DONE]      INF-05: Certificación de release v1.3.0 (`CERTIFIED WITH OPEN GAPS`, 1399 T) │
│ 2. [DONE]      SEC-08: Topología de red empresarial y exposición segura (Fase 72)          │
│ 3. [DONE]      SEC-07: Gobernanza de credenciales API y autenticación multi-tenant (Fase 71)│
│ 4. [BACKLOG]   COR-08: Especificación de checkpoint distribuido multi-nodo para v2.0        │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```


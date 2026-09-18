# Master Roadmap — AI Operating Platform

Este documento constituye el **Roadmap Técnico Maestro y Registro Central de Iniciativas** de la AI Operating Platform. Se actualiza exclusivamente a partir de hechos demostrables en el código fuente y evidencia de tests.

---

## 1. Convenciones y Estados

Los estados asignados a cada iniciativa deben respetar el ciclo de vida oficial:
* **`DONE`**: Código fuente implementado en `src/`, suite de tests verificada en verde, sin regresiones y documentado en manuales oficiales.
* **`VALIDATION`**: Funcionalidad implementada que atraviesa pruebas de estrés, auditorías de seguridad o verificación de interoperabilidad.
* **`IN_PROGRESS`**: Rama activa o desarrollo en curso con tests o adaptadores parciales.
* **`PLANNED`**: Arquitectura y especificación definidas, priorizadas para la siguiente iteración.
* **`ANALYSIS`**: Fase de investigación técnica, diseño conceptual o evaluación de viabilidad.
* **`BACKLOG`**: Iniciativas futuras aprobadas formalmente sin asignación a una iteración inmediata.
* **`BLOCKED`**: Desarrollo detenido por dependencias externas no satisfechas o bloqueos técnicos.
* **`DEFERRED`**: Iniciativa aplazada intencionalmente en favor de otras prioridades.
* **`CANCELLED`**: Iniciativa descartada tras evaluación arquitectónica.

---

## 2. Inventario Maestro de Iniciativas

### Bloque A: Fundamentos del Motor Central & Autonomía (Core Engine)

| ID | Título | Área | Descripción | Estado | Prioridad | Fase | Evidencia | Tests | Documentación | Dependencias | Prompt Relacionado |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **AOP-CORE-001** | Máquina de Estados de Tareas | Core Engine | Ciclo de vida estricto de `Task` (`CREATED`, `QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`). | `DONE` | CRITICAL | v0.1 | `src/domain/task/task.ts` | 6 tests | `docs/ARCHITECTURE.md` | Ninguna | Prompt 1-10 |
| **AOP-CORE-002** | Ejecución Atómica y Contexto | Core Engine | Entidad `Execution` y `ExecutionContext` inmutable con correlación `traceId`. | `DONE` | CRITICAL | v0.2 | `src/domain/execution/` | 14 tests | `docs/EXECUTION_CONTRACT.md` | AOP-CORE-001 | Prompt 11-20 |
| **AOP-CORE-003** | Registro y Pasarela de Herramientas | Tools | `InMemoryToolRegistry` y `RegistryToolGateway` con invocación gobernada. | `DONE` | HIGH | v0.3 | `src/application/tools/` | 18 tests | `docs/TOOL_REGISTRY.md` | AOP-CORE-002 | Prompt 21-28 |
| **AOP-CORE-004** | Orquestación Secuencial | Orchestration | `SequentialOrchestrator` determinista para cadenas lineales de ejecución. | `DONE` | MEDIUM | v0.4 | `src/application/orchestration/` | 12 tests | `docs/AUTONOMOUS_EXECUTION.md` | AOP-CORE-003 | Prompt 29-35 |
| **AOP-CORE-005** | Pasarela de Memoria en Proceso | Memory | `InMemoryMemoryGateway` con particionamiento por ámbitos (`TASK`, `AGENT`, `SESSION`). | `DONE` | HIGH | v0.5 | `src/infrastructure/memory/` | 8 tests | `docs/MEMORY_CONTRACT.md` | AOP-CORE-002 | Prompt 36-40 |
| **AOP-CORE-006** | Gobernanza Fail-Closed | Security | `PolicyGateway` con evaluación síncrona obligatoria y política por defecto de denegación. | `DONE` | CRITICAL | v0.6 | `src/infrastructure/policy/` | 10 tests | `docs/SECURITY_ARCHITECTURE.md` | AOP-CORE-002 | Prompt 41-45 |
| **AOP-CORE-007** | Agentes de Primera Clase | Agents | Agregado `Agent` con listas blancas de herramientas y perfiles vinculados. | `DONE` | HIGH | v0.8 | `src/domain/agent/agent.ts` | 22 tests | `docs/MULTI_AGENT_RUNTIME.md` | AOP-CORE-006 | Prompt 46-55 |
| **AOP-CORE-008** | Operaciones Autónomas Acotadas | Autonomy | Entidad `AutonomousOperation`, `AutonomyBudget` y bucle acotado `AutonomousOrchestrator`. | `DONE` | HIGH | v0.9 | `src/domain/autonomy/` | 46 tests | `docs/releases/v0.9-architecture-baseline.md` | AOP-CORE-007 | Prompt 56-65 |

---

### Bloque B: Persistencia Relacional Duradera & Reconciliación (Persistence & Recovery)

| ID | Título | Área | Descripción | Estado | Prioridad | Fase | Evidencia | Tests | Documentación | Dependencias | Prompt Relacionado |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **AOP-PERS-001** | Motor SQLite Nativo WAL | Persistence | Implementación de `SqliteDatabase` con Node.js `node:sqlite`, modo WAL y claves foráneas. | `DONE` | CRITICAL | v0.10 | `src/infrastructure/persistence/sqlite/sqlite-database.ts` | 16 tests | `docs/decisions/0015-durable-persistence-architecture.md` | AOP-CORE-008 | Prompt 66-70 |
| **AOP-PERS-002** | Repositorio SQLite de Operaciones | Persistence | `SqliteOperationRepository` con transaccionalidad atómica y control de concurrencia optimista (OCC). | `DONE` | HIGH | v0.10 | `src/infrastructure/persistence/sqlite/sqlite-operation-repository.ts` | 14 tests | `docs/decisions/0015-durable-persistence-architecture.md` | AOP-PERS-001 | Prompt 71-72 |
| **AOP-PERS-003** | Frontera de Rehidratación de Dominio | Persistence | Métodos estáticos `rehydrate()` en agregados (`Task`, `Execution`, `Agent`, `AutonomousOperation`) sin reflexión. | `DONE` | HIGH | v0.11 | `src/domain/*/` | 42 tests | `docs/decisions/0016-formal-domain-rehydration-boundary.md` | AOP-PERS-002 | Prompt 73-75 |
| **AOP-PERS-004** | Repositorios SQLite de Tareas, Ejecuciones y Agentes | Persistence | `SqliteTaskRepository`, `SqliteExecutionRepository` y `SqliteAgentRepository` persistentes. | `DONE` | HIGH | v0.12 | `src/infrastructure/persistence/sqlite/` | 28 tests | `docs/decisions/0019-durable-sqlite-adapters-for-task-execution-agent.md` | AOP-PERS-003 | Prompt 76-78 |
| **AOP-RECV-001** | Servicio de Reconciliación post-Crash | Recovery | `RestartRecoveryService` que detecta y transiciona entidades interrumpidas a estados terminales atómicamente. | `DONE` | HIGH | v0.13 | `src/application/recovery/restart-recovery-service.ts` | 18 tests | `docs/decisions/0020-crash-recovery-and-restart-reconciliation.md` | AOP-PERS-004 | Prompt 79-82 |
| **AOP-PERS-005** | Event Store Duradero SQLite | Persistence | `SqliteEventStore` con esquema inmutable de eventos de auditoría y proyecciones cronológicas. | `DONE` | HIGH | v0.13 | `src/infrastructure/persistence/sqlite/sqlite-event-store.ts` | 12 tests | `docs/decisions/0021-durable-events-and-audit-infrastructure.md` | AOP-PERS-001 | Prompt 83-85 |

---

### Bloque C: Producto de Plataforma, APIs & Consola Web (Platform Product)

| ID | Título | Área | Descripción | Estado | Prioridad | Fase | Evidencia | Tests | Documentación | Dependencias | Prompt Relacionado |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **AOP-PROD-001** | Servidor HTTP y Enrutador Nativo | Platform API | Servidor `node:http` con límites de 1MB, normalización de IDs y prefijos `/api/v1` y `/api/platform/v1`. | `DONE` | CRITICAL | v1.0 | `src/platform/server.ts`, `src/platform/api/http-router.ts` | 44 tests | `docs/PLATFORM_API.md` | AOP-CORE-006 | Prompt 86-88 |
| **AOP-PROD-002** | Cliente SDK Tipado (@ai-platform/client) | Platform Client | `PlatformClient` en TypeScript con manejo de reintentos, fallback y validación de esquemas. | `DONE` | HIGH | v1.0 | `src/platform-client/index.ts` | 16 tests | `docs/PLATFORM_CLIENT.md` | AOP-PROD-001 | Prompt 89-90 |
| **AOP-PROD-003** | Consola Web de Control (SPA Nativa) | Web UI | Interfaz gráfica Single-Page Application (HTML5/Vanilla JS/CSS) con 0 `innerHTML` y modo bilingüe (`es-419` / `en`). | `DONE` | HIGH | v1.1 | `src/platform/web/` | 24 tests | `docs/OPERATIONAL_CONSOLE.md` | AOP-PROD-001 | Prompt 91, 94, 99 |
| **AOP-PROD-004** | Fábrica de Aplicaciones (Application Factory 2.0) | Developer Platform | Especificación y motor de registro declarativo de aplicaciones con validación de manifiestos y gobernanza. | `DONE` | HIGH | v1.1 | `src/platform/web/app.js` | 12 tests | `docs/APPLICATION_FACTORY.md` | AOP-PROD-003 | Prompt 97 |

---

### Bloque D: Model Gateways & Ecosistema de Modelos (AI Runtime)

| ID | Título | Área | Descripción | Estado | Prioridad | Fase | Evidencia | Tests | Documentación | Dependencias | Prompt Relacionado |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **AOP-MODL-001** | Adaptador OpenAI | Models | `OpenAIModelGateway` para modelos `gpt-4o`, `gpt-4o-mini` con manejo de streaming y JSON estructurado. | `DONE` | HIGH | v1.1 | `src/infrastructure/model/openai/` | 10 tests | `docs/REAL_AI_PROVIDERS.md` | AOP-PROD-001 | Prompt 73-75 |
| **AOP-MODL-002** | Adaptador Anthropic | Models | `AnthropicModelGateway` para modelos Claude (`claude-3-5-sonnet`, `haiku`) vía REST. | `DONE` | HIGH | v1.1 | `src/infrastructure/model/anthropic/` | 10 tests | `docs/REAL_AI_PROVIDERS.md` | AOP-PROD-001 | Prompt 73-75 |
| **AOP-MODL-003** | Adaptador Ollama Local | Models | `OllamaModelGateway` para modelos open-source locales (`llama3`, `mistral`, `phi3`) vía `127.0.0.1:11434`. | `DONE` | HIGH | v1.1 | `src/infrastructure/model/ollama/` | 10 tests | `docs/REAL_AI_PROVIDERS.md` | AOP-PROD-001 | Prompt 73-75 |
| **AOP-MODL-004** | Fábrica de Proveedores y Router de Contingencia | Models | `ProviderFactory` y `DefaultModelRouter` que despacha solicitudes y conmuta a `StubModelGateway` como fallback. | `DONE` | HIGH | v1.1 | `src/infrastructure/model/provider-factory.ts` | 14 tests | `docs/MODEL_GATEWAY.md` | AOP-MODL-001 | Prompt 76-78 |

---

### Bloque E: Aplicaciones del Ecosistema & Dispositivos (Applications & Devices)

| ID | Título | Área | Descripción | Estado | Prioridad | Fase | Evidencia | Tests | Documentación | Dependencias | Prompt Relacionado |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **AOP-APP-001** | Tentaciones AI Commerce Integration | Applications | Adaptador `TentacionesPlatformAdapter` con descubrimiento, recomendaciones y probador virtual AR. | `DONE` | HIGH | v1.0 | `src/application/platform/tentaciones-platform-adapter.ts` | 38 tests | `docs/TENTACIONES_PLATFORM_INTEGRATION.md` | AOP-PROD-002 | Prompt 62, 86 |
| **AOP-APP-002** | Vehicle Parts Platform Reference App | Applications | Aplicación de referencia para compatibilidad mecánica de vehículos y catálogo de autopartes. | `DONE` | MEDIUM | v1.1 | `tests/unit/vehicle-parts-reference-app.test.ts` | 16 tests | `docs/VEHICLE_PARTS_REFERENCE.md` | AOP-PROD-004 | Prompt 92, 97 |
| **AOP-DEV-001** | Adaptador de Impresora Brother DCP-1600 | Devices | `BrotherPrinterAdapter` para impresión comercial sobre puerto local `USB001` con gestión de trabajos. | `DONE` | MEDIUM | v1.1 | `src/infrastructure/device/brother-printer-adapter.ts` | 14 tests | `docs/BUSINESS_DEVICES.md` | AOP-PROD-001 | Prompt 95 |

---

### Bloque F: Backlog Futuro Formalmente Aprobado (Future Initiatives)

| ID | Título | Área | Descripción | Estado | Prioridad | Fase | Evidencia | Tests | Documentación | Dependencias | Prompt Relacionado |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **AOP-MODEL-GEMINI** | Adaptador de Modelo Google Gemini / Vertex AI | Models | Gateway oficial para Google Gemini 1.5/2.0 Pro/Flash vía API REST de Google Cloud. | `DONE` | HIGH | v1.2 | `src/infrastructure/model/gemini/` | 8 tests | `docs/decisions/0023-google-gemini-model-gateway.md` | AOP-MODL-004 | Prompt 101 |
| **AOP-AUTH** | Proveedor de Autenticación OIDC / JWT Producción | Security | Servicio formal de validación JWT con rotación asimétrica de claves (RS256/ES256) y gestión de roles. | `DONE` | HIGH | v1.2 | `src/infrastructure/security/jwt-token-verifier.ts` | 4 tests | `docs/decisions/0025-asymmetric-jwt-and-key-rotation.md` | AOP-PROD-001 | Prompt 101 |
| **AOP-NETWORK** | Topología de Red y Proxy Reverso de Producción | Security | Configuración declarativa de Nginx/Caddy con terminación TLS, rate limiting perimetral y Docker Compose. | `DONE` | MEDIUM | v1.2 | `deploy/` | Manifests | `docs/PRODUCTION_NETWORK_TOPOLOGY.md` | AOP-PROD-001 | Prompt 101 |
| **AOP-MEMORY** | Pasarela de Memoria Duradera SQLite | Memory | Adaptador `SqliteMemoryGateway` con persistencia relacional indexada por ámbito de agente y sesión. | `DONE` | HIGH | v1.2 | `src/infrastructure/memory/sqlite-memory-gateway.ts` | 6 tests | `docs/decisions/0024-sqlite-durable-memory-gateway.md` | AOP-PERS-001 | Prompt 101 |
| **AOP-API-SURFACES** | Política de Convergencia de Rutas `/api/v1` | Platform API | Eliminación planificada del alias `/api/platform/v1` en favor de `/api/v1` con avisos RFC 8594 (`Deprecation`/`Sunset`). | `DONE` | LOW | v1.2 | `src/platform/api/http-router.ts` | 1 test | `docs/TECHNICAL_DEBT.md` | AOP-PROD-001 | Prompt 101 |
| **AOP-ORG-FOUNDATION** | Virtual Organization Foundation | Virtual Organization | Jerarquía multinivel de Organizaciones, Áreas funcionales, Equipos de trabajo y Membresía gobernada de agentes con roles. | `DONE` | HIGH | v1.2 | `src/domain/organization/`, `src/application/organization/`, `src/infrastructure/organization/` | 34 tests | `docs/decisions/0027-virtual-organization-foundation.md` | AOP-PROD-001 | Prompt 102 |
| **AOP-ORG-BUDGET** | Team Resource Governance & Budget Control | Virtual Organization | Presupuestos y cuotas operacionales por equipo con control de concurrencia atómico (Last-Unit Race Condition: 1 ALLOW / 1 DENY) y OCC. | `DONE` | HIGH | v1.2 | `src/domain/organization/team-resource-budget.ts`, `src/application/organization/team-resource-budget-service.ts` | 24 tests | `docs/decisions/0028-team-resource-budget-governance.md` | AOP-ORG-FOUNDATION | Prompt 103 |
| **AOP-V1-EXIT** | Certificación Final de Criterios de Producción | Governance | Auditoría y certificación integral de criterios de release formal para v1.0/v1.1/v1.2/v1.3. | `DONE` | CRITICAL | v1.3 | `docs/RELEASE_CERTIFICATION_V1.md` | 1064 tests | `docs/V1_EXIT_CRITERIA.md` | Todos los anteriores | Prompt 106 |



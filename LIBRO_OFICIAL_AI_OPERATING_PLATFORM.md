# LIBRO OFICIAL DE ARQUITECTURA & OPERACIONES
## AI OPERATING PLATFORM
### *Fundamentos de Ingeniería de Software para la Habilitación de IA Multiplataforma*

---

**Documento:** AI Operating Platform — Official Architecture Book
**Versión del Documento:** 2.2 (Consolidación v1.2.0 Virtual Organization Foundation)
**Estado del Repositorio:** v1.2.0 Baseline (1019 tests PASS, 0 FAIL — 100% determinismo)
**Estado Documental:** Oficial / Sincronizado con Fuente de Verdad
**Fecha de Verificación:** Septiembre de 2026
**Fuente de Verdad Técnica:** Código fuente (`src/`) + Tests automatizados (`tests/`) + ADRs (`docs/decisions/`)
**Fuente Canónica del Documento:** `LIBRO_OFICIAL_AI_OPERATING_PLATFORM.md` (con espejo en `docs/LIBRO_OFICIAL_AI_OPERATING_PLATFORM.md`)

---

## Control de Versiones del Documento

| Versión | Fecha | Estado del Repositorio | Resumen de Cambios |
| :--- | :--- | :--- | :--- |
| **1.0** | Septiembre 2026 | v0.8 Baseline | Generación inicial documental post-v0.8 (Agentes y Control Plane). |
| **1.1** | Septiembre 2026 | v0.9 Increment #5 | Auditoría arquitectónica integral e incorporación formal de v0.9 Increments #1 al #5. |
| **1.2** | Septiembre 2026 | v0.9 Release Candidate | Consolidación completa de v0.9 Bounded Autonomous Operations (Increments #6 y #7, 268 tests). |
| **2.0** | Septiembre 2026 | v1.1.0 Baseline Auditada | **Auditoría Canónica de Fuente de Verdad y Sincronización Integral:**<br>• Incorporación de persistencia duradera SQLite WAL (`SqliteDatabase`, repositorios de tareas, ejecuciones, agentes y operaciones).<br>• Formalización de fronteras de rehidratación de dominio (v0.11) y servicio de reconciliación post-crash (`RestartRecoveryService`, v0.13).<br>• Integración de adaptadores reales de modelos de IA (OpenAI, Anthropic, Ollama) y router de fallback a Stub determinista.<br>• Integración de aplicaciones satélites gobernadas (*Tentaciones AI Commerce* y *Vehicle Parts Reference App*).<br>• Incorporación del adaptador de dispositivo físico empresarial (Brother DCP-1600 series en USB001).<br>• Soporte bilingüe en el Control Plane Web (`es-419` por defecto / `en`) con 0 `innerHTML`.<br>• Trazabilidad exhaustiva de ADRs (ADR 0001 a 0022 y ADR-001 a ADR-010).<br>• Línea base canónica verificada en **966 tests PASS** (0 FAIL, 11 suites). |
| **2.1** | Septiembre 2026 | v1.1.0 Cloud Foundation | **Expansión Cloud Foundation y Modelos Reales (Fase 55 / Prompt 101):**<br>• Adaptador oficial para Google Gemini / Vertex AI (`GeminiModelGateway`, ADR 0023).<br>• Pasarela duradera de memoria contextual en SQLite WAL (`SqliteMemoryGateway`, ADR 0024).<br>• Verificación JWT asimétrica (RS256/ES256) con rotación de claves (`JwtTokenVerifier`, ADR 0025).<br>• Topología perimetral de red y manifiestos de producción TLS Nginx/Caddy (ADR 0026).<br>• Convergencia REST `/api/v1/*` con cabeceras RFC 8594 de deprecación en `/api/platform/v1/*`.<br>• Línea base canónica verificada en **985 tests PASS** (0 FAIL, 11 suites). |
| **2.2** | Septiembre 2026 | v1.2.0 Virtual Org | **Virtual Organization Foundation (Fase 56 / Prompt 102):**<br>• Jerarquía organizativa formal: `Organization` (ciclo de vida activo/inactivo/archivado), `Area` funcional y `Team` de trabajo.<br>• Membresía gobernada de agentes (`AgentMembership`) con roles operativos (`LEAD`, `SPECIALIST`, `OPERATOR`, `REVIEWER`).<br>• Repositorio relacional duradero `SqliteOrganizationRepository` con índices compuestos y OCC.<br>• Endpoints REST canónicos bajo `/api/v1/*` y vista interactiva en el Web Control Plane (0 `innerHTML`).<br>• Línea base canónica verificada en **1019 tests PASS** (0 FAIL, 11 suites). |

---

## Prefacio: Plataforma Operacional de IA para Habilitación Multiplataforma

El propósito de la **AI Operating Platform** no es constituir una "fábrica aislada" ni un chatbot monolítico independiente. Su rol estratégico es actuar como la **plataforma operacional de infraestructura y gobierno de Inteligencia Artificial** concebida para conectarse con y dotar de capacidades cognitivas a múltiples plataformas de negocio existentes y futuras.

Entre sus principales casos de integración se encuentran aplicaciones de comercio electrónico (como plataformas de venta de vestuario y retail omnicanal), sistemas de gestión de inventario y pedidos, plataformas SaaS y servicios de atención automatizada. En lugar de dispersar llamadas caóticas a APIs de modelos de lenguaje (LLMs) dentro del código de cada aplicación satélite, esta plataforma centraliza:
1. **La orquestación determinista y auditable de tareas y ejecuciones.**
2. **El perfilado de Agentes con lista blanca estricta de herramientas y aislamiento de memoria.**
3. **La gobernanza Fail-Closed mediante políticas previas a cada invocación de modelo o herramienta.**
4. **La supervisión de Operaciones Autónomas Acotadas (Bounded Autonomous Operations) con presupuestos estrictos de tiempo, pasos y llamadas a herramientas.**
5. **La observabilidad inmutable y correlacionada forense sin dependencias de librerías externas en runtime.**
6. **La persistencia relacional duradera en SQLite en modo WAL y recuperación automática ante caídas.**

### Distinción Explícita: Visión Estratégica vs. Capacidades Implementadas

Para garantizar la honestidad operativa y evitar falsas expectativas, este libro distingue formalmente entre la visión de producto y lo efectivamente construido:

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│ VISIÓN ESTRATÉGICA (Futuro / Backlog Formal)                                   │
│ • Ecosistema distribuido multi-región con clustering y failover activo-activo.  │
│ • Certificación formal de criterios de salida para producción masiva (AOP-EXIT).│
├─────────────────────────────────────────────────────────────────────────────────┤
│ CAPACIDADES IMPLEMENTADAS & VERIFICADAS (Línea Base Real v1.2.0 — 1019 PASS)    │
│ • Motor hexagonal determinista con cero dependencias en runtime (npm ls vacío). │
│ • Persistencia duradera relacional SQLite WAL (`SqliteDatabase`, `data/app.db`).│
│ • Memoria contextual duradera en SQLite WAL (`SqliteMemoryGateway`, ADR 0024). │
│ • Servicio atómico de reconciliación post-crash (`RestartRecoveryService`).     │
│ • Model Gateways para OpenAI, Anthropic, Ollama, Gemini y Stub determinista.    │
│ • Verificador JWT asimétrico RS256/ES256 con rotación de claves (ADR 0025).     │
│ • Topología de red perimetral con manifiestos TLS Nginx/Caddy (ADR 0026).       │
│ • Convergencia REST canónica en /api/v1/* con cabeceras RFC 8594 (Deprecation). │
│ • Virtual Organization Foundation: Organización, Áreas, Equipos y Agentes (ADR 0027).│
│ • Integración de Tentaciones AI Commerce con probador virtual AR y fallback.    │
│ • Aplicación de referencia automotriz Vehicle Parts Platform con compatibilidad.│
│ • Adaptador de hardware Brother DCP-1600 series (USB001, honestamente offline). │
│ • Web Control Plane nativo bilingüe (es-419 / en) con 0 innerHTML.             │
│ • 1019 pruebas automatizadas aprobadas (0 fallos, 11 suites de prueba).         │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Índice General

1. [Capítulo 1: Visión Estratégica, Principios & Modelo de Dependencias](#capítulo-1-visión-estratégica-principios--modelo-de-dependencias)
2. [Capítulo 2: Arquitectura de un Vistazo (Architecture at a Glance) & Matriz de Estado](#capítulo-2-arquitectura-de-un-vistazo-architecture-at-a-glance--matriz-de-estado)
3. [Capítulo 3: Infografías Maestras de Arquitectura y Mapa del Sistema](#capítulo-3-infografías-maestras-de-arquitectura-y-mapa-del-sistema)
   * 3.1 [Blueprint Maestro: Mapa Completo del Sistema & Habilitación Multiplataforma](#31-blueprint-maestro-mapa-completo-del-sistema--habilitación-multiplataforma)
   * 3.2 [Blueprint 1: Topología Hexagonal y Puertos & Adaptadores en 5 Capas](#32-blueprint-1-topología-hexagonal-y-puertos--adaptadores-en-5-capas)
   * 3.3 [Blueprint 2: Flujo de Ejecución End-to-End & Ciclo de Vida Operacional](#33-blueprint-2-flujo-de-ejecución-end-to-end--ciclo-de-vida-operacional)
   * 3.4 [Blueprint 3: Arquitectura de Agentes de Primera Clase y Capacidades Cognitivas](#34-blueprint-3-arquitectura-de-agentes-de-primera-clase-y-capacidades-cognitivas)
   * 3.5 [Blueprint 4: Gobernanza Fail-Closed & Observabilidad Inmutable](#35-blueprint-4-gobernanza-fail-closed--observabilidad-inmutable)
4. [Capítulo 4: Especificación Exhaustiva de Capas y Componentes](#capítulo-4-especificación-exhaustiva-de-capas-y-componentes)
5. [Capítulo 5: Arquitectura de Agentes de Primera Clase (v0.8)](#capítulo-5-arquitectura-de-agentes-de-primera-clase-v08)
6. [Capítulo 6: Operaciones Autónomas Acotadas (v0.9 Increments #1 al #5)](#capítulo-6-operaciones-autónomas-acotadas-v09-increments-1-al-5)
7. [Capítulo 7: Matriz de Responsabilidades de los Componentes](#capítulo-7-matriz-de-responsabilidades-de-los-componentes)
8. [Capítulo 8: Gobernanza Fail-Closed, Seguridad & Catálogo de Invariantes](#capítulo-8-gobernanza-fail-closed-seguridad--catálogo-de-invariantes)
9. [Capítulo 9: Semántica de Cancelación & Decisiones Arquitectónicas Abiertas](#capítulo-9-semántica-de-cancelación--decisiones-arquitectónicas-abiertas)
10. [Capítulo 10: Catálogo de Servicios & Auditoría de la API REST](#capítulo-10-catálogo-de-servicios--auditoría-de-la-api-rest)
11. [Capítulo 11: Matriz de Trazabilidad Arquitectónica](#capítulo-11-matriz-de-trazabilidad-arquitectónica)
12. [Capítulo 12: Hoja de Ruta Oficial (Roadmap Sincronizado)](#capítulo-12-hoja-de-ruta-oficial-roadmap-sincronizado)
13. [Glosario de Términos Arquitectónicos](#glosario-de-términos-arquitectónicos)

---

# Capítulo 1: Visión Estratégica, Principios & Modelo de Dependencias

### 1.1 El Rol de la Plataforma en un Ecosistema Multiplataforma
La plataforma opera como el **motor de ejecución y control de IA** para sistemas empresariales clientes. Cuando una plataforma de e-commerce de venta de vestuario requiere:
* Procesar una solicitud compleja de catálogo,
* Clasificar pedidos o generar recomendaciones personalizadas,
* O ejecutar una operación autónoma de reconciliación de inventario con herramientas locales,

dicha plataforma cliente interactúa con la **AI Operating Platform** a través de contratos REST estables. La plataforma cliente no gestiona el contexto de inferencia, no interactúa directamente con los SDKs de los modelos, ni implementa la lógica de gobernanza: delega la tarea a un `Agent` u `AutonomousOperation` gobernado por la plataforma.

### 1.2 Principios de Ingeniería No Negociables
1. **Arquitectura Hexagonal (Puertos y Adaptadores):** Las reglas de dominio (`src/domain/`) y los casos de uso (`src/application/`) definen contratos abstractos y jamás importan detalles de infraestructura (adaptadores de red, bases de datos o SDKs de proveedores de IA).
2. **Zero Runtime Dependencies:** El archivo `package.json` no contiene ningún paquete en la sección `dependencies`. Todo el código en tiempo de ejecución se apoya exclusivamente en las APIs nativas de Node.js (`node:http`, `node:fs`, `node:crypto`, `node:path`, `node:url`, `node:sqlite`).
3. **Distinción Estricta de Dependencias de Desarrollo:** El entorno utiliza herramientas de soporte (`devDependencies`) limitadas a la compilación y ejecución de pruebas: `typescript` (v5.7.2), `tsx` (v4.19.2) y `@types/node` (v22.10.2). La documentación técnica distingue con precisión *"cero dependencias en runtime"* de *"herramientas de desarrollo"*.
4. **Ejecución Sincrónica y Determinista en Proceso:** La plataforma no implementa workers en segundo plano, colas Redis, daemons ocultos ni hilos independientes. Cada llamada a la API o al motor orquestador ejecuta una secuencia finita dentro del proceso de Node.js.
5. **Dirección de Dependencias Unidireccional:**
   $$\text{Presentación (SPA)} \longrightarrow \text{Platform API} \longrightarrow \text{Aplicación} \longrightarrow \text{Dominio} \longleftarrow \text{Infraestructura (Adaptadores)}$$

---

# Capítulo 2: Arquitectura de un Vistazo (Architecture at a Glance) & Matriz de Estado

### 2.1 Estructura Global de Componentes Reales
La siguiente topología refleja estrictamente los paquetes y componentes existentes en `src/`:

```text
AI Operating Platform
│
├── Presentation Layer (src/platform/web/)
│   ├── Native Single-Page Application (HTML5, Vanilla JS DOM puro, CSS)
│   ├── Decoupled API Client (api-client.js)
│   └── Internationalization Core (i18n/es-419.js, i18n/en.js)
│
├── Platform API Layer (src/platform/api/)
│   ├── Native HTTP Server (node:http enlazado a 127.0.0.1:3000)
│   ├── HttpRouter (Normalización regex de IDs, límite de 1MB, application/json)
│   ├── PlatformService (Fachada inyectada con QueryPorts y Casos de Uso)
│   ├── PlatformDTOs (Contratos inmutables de transferencia)
│   └── RateLimiter (Control de tráfico por tenant y principal)
│
├── Platform Client SDK (src/platform-client/)
│   └── Typed PlatformClient (tasks, executions, agents, health, diagnostics)
│
├── Application Layer (src/application/)
│   ├── CoreRuntime (Propietario único de la ejecución Task/Execution)
│   ├── SubmitTask & ExecuteTask (Casos de uso de encolamiento y despacho)
│   ├── AgentService (Gestión y despacho de agentes)
│   ├── AutonomousOrchestrator (Coordinador del bucle acotado v0.9)
│   ├── AutonomousOperationService (Gestión de operaciones autónomas)
│   ├── RestartRecoveryService (Reconciliación atómica post-crash v0.13)
│   ├── RuntimeDiagnosticsService (Líneas de tiempo forenses por traceId)
│   ├── MemoryService (Servicio de persistencia particionada)
│   └── Application Adapters (TentacionesPlatformAdapter, ApplicationFactory)
│
├── Domain Core Layer (src/domain/)
│   ├── Task & Execution (Agregados deterministas con fábricas rehydrate())
│   ├── Agent (Agregado de primera clase con model binding, tools y memoryScope)
│   ├── AutonomousOperation & AutonomyBudget & AutonomyConsumption (Dominio de autonomía)
│   ├── PlannerPort, PlanningRequest, Plan, PlanStep, Decision (Contratos de planificación)
│   ├── Observation, ObjectiveEvaluation, DecisionEvaluatorPort (Contratos de evaluación)
│   ├── BusinessDevice & PrintJob (Entidades de dispositivos empresariales)
│   └── Domain Ports (PolicyGateway, ModelGateway, ToolGateway, MemoryGateway, EventPublisher, TaskRepository, ExecutionRepository)
│
└── Infrastructure Layer (src/infrastructure/)
    ├── SQLite Durable Storage (SqliteDatabase, SqliteTaskRepository, SqliteExecutionRepository, SqliteAgentRepository, SqliteOperationRepository, SqliteEventStore)
    ├── InMemory Repositories (Fallback desacoplado para tests unitarios aislados)
    ├── AI Model Providers (OpenAIModelGateway, AnthropicModelGateway, OllamaModelGateway, StubModelGateway, ProviderFactory)
    ├── Tool Registry & Gateway (CalculatorTool, InMemoryToolRegistry, RegistryToolGateway)
    ├── Hardware Adapters (BrotherPrinterAdapter en puerto USB001)
    ├── Security & RBAC (InMemoryRoleRepository, InMemoryApiKeyRepository, RbacAuthorizationEvaluator)
    └── Observability & Audit (EventObservabilitySubscriber, InMemoryAuditLog, InMemoryMetricsCollector, StructuredEventLogger)
```

### 2.2 Matriz de Estado Oficial de Capacidades

| Capacidad / Componente | Arquitectura | Código | Tests | Documentación | Estado Oficial |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **CoreRuntime & Task Lifecycle (v0.1-v0.2)** | Diseñada | Implementado | 184 tests | Documentado | **IMPLEMENTED / VERIFIED** |
| **Agregado Agent (v0.8)** | Diseñada | Implementado | 22 tests | Documentado | **IMPLEMENTED / VERIFIED** |
| **Operaciones Autónomas Acotadas (v0.9)** | Diseñada | Implementado | 46 tests | Documentado | **IMPLEMENTED / VERIFIED** |
| **Persistencia SQLite WAL (v0.10/v0.12)** | Diseñada | Implementado | 142 tests | Documentado | **IMPLEMENTED / VERIFIED** |
| **Frontera de Rehidratación de Dominio (v0.11)** | Diseñada | Implementado | 42 tests | Documentado | **IMPLEMENTED / VERIFIED** |
| **Servicio Reconciliación post-Crash (v0.13)** | Diseñada | Implementado | 42 tests | Documentado | **IMPLEMENTED / VERIFIED** |
| **Event Store Duradero SQLite (v0.13)** | Diseñada | Implementado | 12 tests | Documentado | **IMPLEMENTED / VERIFIED** |
| **OpenAI Model Gateway** | Diseñada | Implementado | 10 tests | Documentado | **IMPLEMENTED (Requiere API Key)** |
| **Anthropic Model Gateway** | Diseñada | Implementado | 10 tests | Documentado | **IMPLEMENTED (Requiere API Key)** |
| **Ollama Local Model Gateway** | Diseñada | Implementado | 10 tests | Documentado | **IMPLEMENTED (Requiere Daemon)** |
| **Deterministic Stub Gateway** | Diseñada | Implementado | 26 tests | Documentado | **IMPLEMENTED / VERIFIED** |
| **Google Gemini / Vertex AI Gateway** | Diseñada | No implementado| 0 tests | En Backlog | **NOT IMPLEMENTED (AOP-MODEL-GEMINI)** |
| **Tentaciones AI Commerce Adapter** | Diseñada | Implementado | 48 tests | Documentado | **IMPLEMENTED / VERIFIED** |
| **Vehicle Parts Reference App** | Diseñada | Implementado | 16 tests | Documentado | **IMPLEMENTED / VERIFIED** |
| **Adaptador Brother DCP-1600 (USB001)** | Diseñada | Implementado | 14 tests | Documentado | **IMPLEMENTED (Hardware Offline)** |
| **Gobernanza Fail-Closed & RBAC** | Diseñada | Implementado | 114 tests | Documentado | **IMPLEMENTED / VERIFIED** |
| **Web Control Plane SPA (es-419 / en)** | Diseñada | Implementado | 86 tests (0 innerHTML) | Documentado | **IMPLEMENTED / VERIFIED** |
| **Total Línea Base Verificada** | **Convergente**| **100% Compilado**| **966 PASS (0 FAIL)** | **Canónica** | **BASELINE v1.1.0 VERIFICADO** |

---

# Capítulo 3: Infografías Maestras de Arquitectura y Mapa del Sistema

Las infografías maestras representan visualmente las garantías operacionales, el ecosistema de integración y la topología de la plataforma en idioma español accesible, riguroso y profesional.

## 3.1 Blueprint Maestro: Mapa Completo del Sistema & Habilitación Multiplataforma
![Blueprint Maestro: Mapa Completo del Sistema](docs/images/00_mapa_completo_sistema.jpg)

**Descripción del Ecosistema Integral:**
* **Plataformas de Negocio Conectadas (Arriba y Perímetro):** Representa sistemas clientes reales como la **Plataforma de Venta de Ropa (E-Commerce)**, aplicaciones web/móviles y plataformas ERP/logísticas. Estas aplicaciones externas no ejecutan modelos de IA internamente ni se acoplan a librerías propietarias; se comunican mediante peticiones estándar **API REST / HTTP en formato JSON**.
* **AI Operating Platform (Núcleo Central):**
  1. **Capa de Plataforma y Servidor HTTP:** Provee el enrutador nativo, validación rigurosa de DTOs, límites de payload (1MB) y endpoints REST para tareas y operaciones.
  2. **Capa de Aplicación y Orquestación:** Contiene el `AutonomousOrchestrator`, `DecisionEvaluator` y `CoreRuntime` que coordinan la ejecución controlada.
  3. **Capa de Dominio y Gobernanza:** Define el `AutonomyBudget` (límites de pasos, costo y tiempo), la máquina de estados finita y los perfiles de agentes cognitivos.
  4. **Capa de Infraestructura y Adaptadores:** Gestiona los puertos de herramientas (consultas de inventario, pasarelas externas), conectores LLM y repositorios en memoria y SQLite duradero.

## 3.2 Blueprint 1: Topología Hexagonal y Puertos & Adaptadores en 5 Capas
![Blueprint 1: Topología Hexagonal en 5 Capas](docs/images/01_mapa_arquitectura_hexagonal.jpg)

Representa la estricta separación de fronteras arquitectónicas:
* **Núcleo de Dominio (Centro):** Reglas de negocio puras, presupuestos inmutables, máquinas de estados y emisión de eventos. No tiene dependencias externas.
* **Capa de Aplicación & Puertos (Anillo Intermedio):** Casos de uso de orquestación, puertos de entrada y salida abstractos.
* **Infraestructura & Plataforma (Anillo Exterior):** Adaptadores HTTP, adaptadores LLM, herramientas externas y repositorio en SQLite WAL.
* **Regla de Dependencia:** Las dependencias apuntan exclusivamente hacia adentro. El núcleo de dominio no conoce a la base de datos, la red ni a los proveedores de modelos.

## 3.3 Blueprint 2: Flujo de Ejecución End-to-End & Ciclo de Vida Operacional
![Blueprint 2: Flujo de Ejecución End-to-End](docs/images/02_mapa_flujo_ejecucion.jpg)

Muestra la secuencia de 6 fases del ciclo operacional acotado:
1. **Recepción de Solicitud (HTTP DTO):** Ingreso validado por la frontera perimetral.
2. **Validación de Presupuesto:** Comprobación formal de `AutonomyBudget` (pasos máximos, presupuesto USD, tiempo máximo).
3. **Planificación Inicial:** Despacho hacia `PlannerPort` para generar un `Plan` ordenado y determinista.
4. **Bucle Acotado de Ejecución:** Ciclo iterativo `for (let i = 0; i < maxSteps; i++)` que ejecuta cada paso, obtiene una `Observation` inmutable y evalúa una `Decision`.
5. **Transición a Estado Terminal:** Clasificación rigurosa en `COMPLETADA`, `PRESUPUESTO AGOTADO` o `CANCELADA`.
6. **Emisión de Eventos y Auditoría Inmutable:** Registro correlacionado de todos los hechos en el bus operacional duradero.

## 3.4 Blueprint 3: Arquitectura de Agentes de Primera Clase y Capacidades Cognitivas
![Blueprint 3: Arquitectura de Agentes](docs/images/03_mapa_arquitectura_agentes.jpg)

Consagra el invariante fundamental: **"El Agente NO reemplaza a la Ejecución"**:
* Un agente define una configuración declarativa de capacidades (perfil de rol, modelo vinculado, lista blanca estricta de herramientas `ToolGateway` y ámbito de memoria particionado).
* Todo despacho de un agente se ejecuta obligatoriamente bajo las políticas y presupuestos del `CoreRuntime`, impidiendo accesos no autorizados a herramientas fuera de su perfil.

## 3.5 Blueprint 4: Gobernanza Fail-Closed & Observabilidad Inmutable
![Blueprint 4: Gobernanza Fail-Closed y Observabilidad](docs/images/04_mapa_gobernanza_observabilidad.jpg)

Visualiza el mecanismo de ciberseguridad y observabilidad continua:
* **Gobernanza Fail-Closed (Seguridad por Defecto):** Cualquier falla en la evaluación de políticas, timeout o intento de inyectar funciones ejecutables en metadatos produce la detención inmediata de la operación.
* **Bus de Eventos Operacionales:** Difusión desacoplada de eventos de dominio tipados y almacenamiento append-only en `SqliteEventStore`.
* **Observabilidad Inmutable:** Generación de snapshots congelados con `Object.freeze()`, línea de tiempo de auditoría inmutable y trazabilidad integral `{ traceId, taskId, executionId }`.

---

# Capítulo 4: Especificación Exhaustiva de Capas y Componentes

### 4.1 Capa 1: Presentación & Consumidores Externos
* **Web Platform Control Plane (`src/platform/web/`):** Single-Page Application (SPA) nativa construida con HTML5, JavaScript Vanilla y CSS puro. Diseñada sin dependencias de frameworks (sin React, Vue o Angular) para maximizar la mantenibilidad a largo plazo. Utiliza construcción directa de nodos DOM (`document.createElement`, `textContent`) eliminando el uso de `innerHTML` como medida activa contra Cross-Site Scripting (XSS). Dispone de un núcleo de internacionalización dinámico (`src/platform/web/i18n/`) que opera en Español Latinoamericano (`es-419`) por defecto y permite conmutar a Inglés (`en`).
* **Consumidores Externos:** Aplicaciones satélites que se comunican con la plataforma a través de HTTP/JSON utilizando los DTOs estables de la API o mediante el SDK tipado `@ai-platform/client`.

### 4.2 Capa 2: Límite de Producto (Platform API)
* **Servidor HTTP Nativo (`src/platform/server.ts`):** Enlace restrictivo a bucle local `127.0.0.1:3000`. Rechaza peticiones dirigidas a interfaces de red públicas no autorizadas.
* **Enrutador (`src/platform/api/http-router.ts`):**
  * Normalización de identificadores con la expresión regular `^[a-zA-Z0-9_-]{1,128}$`.
  * Protección contra saturación: límite estricto de cuerpo de petición a 1MB (HTTP 413) y validación de tipo MIME `application/json` (HTTP 415).
  * Rate Limiting empresarial configurable por tenant y principal (HTTP 429).
  * Prevención contra Path Traversal en el servicio de archivos estáticos.
* **Proyecciones de Lectura (CQRS):** Ubicadas en `src/application/ports/query-ports.ts`. Separan estrictamente la consulta de estados (`ExecutionProjection`, `TaskProjection`, `AgentProjection`, `OperationProjection`) de los métodos de mutación y transición del dominio.

### 4.3 Capa 3: Aplicación & Motores Operacionales
* **`CoreRuntime` (`src/application/runtime/core-runtime.ts`):** Propietario único y centralizado de la ejecución atómica. Coordina la máquina de estados de `Task` y `Execution`, emite los eventos del ciclo de vida y delega el trabajo real en una `ExecutionStrategy`.
* **`SubmitTask` (`src/application/submit-task.ts`):** Caso de uso canónico para el registro y encolamiento inicial de tareas en estado `QUEUED`.
* **`AgentService` (`src/application/agent/agent-service.ts`):** Servicio que administra el ciclo de vida del agente y despacha ejecuciones a través de `SubmitTask`.
* **`AutonomousOrchestrator` (`src/application/autonomy/autonomous-orchestrator.ts`):** Servicio de aplicación que coordina el ciclo de supervisión autónoma en pasos acotados, evaluando políticas y delegando la ejecución en `CoreRuntime`.
* **`RestartRecoveryService` (`src/application/recovery/restart-recovery-service.ts`):** Servicio de resiliencia que detecta caídas no programadas del proceso y transiciona atómicamente tareas y operaciones activas a estados terminales seguros.
* **`SequentialOrchestrator` (`src/application/orchestration/sequential-orchestrator.ts`):** Ejecuta secuencias lineales predefinidas con enlace de parámetros entre operaciones consecutivas.

### 4.4 Capa 4: Núcleo de Dominio Puro
* **Agregados Principales:**
  * `Task`: Unidad duradera de trabajo (`CREATED` ➔ `QUEUED` ➔ `RUNNING` ➔ `COMPLETED` / `FAILED`).
  * `Execution`: Intento concreto y fechado de cómputo dentro de un contexto inmutable.
  * `Agent`: Perfil de capacidades autorizadas.
  * `AutonomousOperation`: Supervisión acotada con presupuesto y seguimiento de consumo.
* **Fábricas de Rehidratación:** Métodos formales `rehydrate()` en cada agregado que restauran el estado persistido garantizando todos los invariantes de dominio sin recurrir a reflexión.
* **Puertos Abstractos:** `PolicyGateway`, `ModelGateway`, `ToolGateway`, `MemoryGateway`, `EventPublisher`, `PlannerPort`, `DecisionEvaluatorPort`, `TaskRepository`, `ExecutionRepository`, `OperationRepositoryPort`. Ninguno posee dependencias externas ni código de transporte.

### 4.5 Capa 5: Infraestructura & Adaptadores Concretos
* **Persistencia Relacional Duradera (SQLite WAL):** `SqliteDatabase` con Node.js 22+ `node:sqlite`, `SqliteTaskRepository`, `SqliteExecutionRepository`, `SqliteAgentRepository`, `SqliteOperationRepository` y `SqliteEventStore`. Constituye el almacenamiento predeterminado del servidor en producción.
* **Persistencia en Memoria (Testing):** `InMemoryTaskRepository`, `InMemoryExecutionRepository`, `InMemoryAgentRegistry`, `InMemoryOperationRepository`.
* **Adaptadores de Modelos de IA:** `OpenAIModelGateway`, `AnthropicModelGateway`, `OllamaModelGateway`, `StubModelGateway` y `ProviderFactory` con selección dinámica por variables de entorno.
* **Adaptador de Dispositivos Empresariales:** `BrotherPrinterAdapter` implementando la gestión de impresión local sobre puerto `USB001` para Brother DCP-1600 series.
* **Herramientas:** `InMemoryToolRegistry` con `CalculatorTool` y validación de esquemas JSON.
* **Gobernanza & Seguridad:** `RbacAuthorizationEvaluator`, `InMemoryRoleRepository` y `InMemoryApiKeyRepository`.
* **Telemetría y Diagnóstico:** `EventObservabilitySubscriber`, `InMemoryAuditLog`, `InMemoryMetricsCollector`, `StructuredEventLogger` y `RuntimeDiagnosticsService`.

---

# Capítulo 5: Arquitectura de Agentes de Primera Clase (v0.8)

En la versión **v0.8**, el concepto de Agente se formalizó como un agregado de dominio de primera clase.

### 5.1 Los Cinco Pilares del Agregado Agente
1. **Identidad & Nombre:** Identificador inmutable normalizado y nombre descriptivo.
2. **Model Binding:** Vinculación formal a un modelo registrado en el catálogo (`ModelQueryPort`).
3. **Behavioral Instructions:** Directivas operacionales que determinan el rol y comportamiento esperado.
4. **Tool Authorization Whitelist (`agent.tools`):** Lista blanca estricta. Si el modelo o el proceso solicita invocar una herramienta no presente en esta lista, la ejecución se detiene de forma instantánea.
5. **Partitioned Memory Scope (`agent.memoryScope`):** Espacio de almacenamiento clave-valor aislado por agente, garantizando que un agente jamás pueda acceder a datos persistidos por otro.
6. **Estado de Ciclo de Vida Binario (`status`):** `ACTIVE` (habilitado para ejecutar) e `INACTIVE` (bloqueado para nuevas ejecuciones).

### 5.2 Invariante Central: `Agent ≠ Execution`
El agente no sustituye al motor de ejecución. No existen "hilos de agente" ni bucles de ejecución propios del agente. Para ejecutar un agente:
```text
POST /api/v1/agents/:id/executions
       ↓
AgentService.executeAgent()
       ↓
SubmitTask Use Case (crea Task en estado QUEUED)
       ↓
CoreRuntime.execute()
       ↓
AgentExecutionStrategy (aplica PolicyGateway, tools whitelist y memoryScope)
```

---

# Capítulo 6: Operaciones Autónomas Acotadas (v0.9 Increments #1 al #5)

Milestone **v0.9** introduce la capacidad de trabajar hacia un objetivo a lo largo de múltiples pasos interactivos y discretos.

### 6.1 El Peligro de la Autonomía Ilimitada
La autonomía sin restricciones representa riesgos inaceptables en entornos corporativos: bucles infinitos, costos impredecibles por consumo descontrolado de tokens, alucinaciones no auditadas y falta de determinismo.

Por esta razón, la arquitectura adopta el principio de **Autonomía Acotada (Bounded Autonomy)**:

```text
AutonomousOperation
        │
        ▼
   PlannerPort.plan() ──► Produce Plan (Secuencia finita y congelada de PlanSteps)
        │
        ▼
  Derivación de Decision (EXECUTE_STEP)
        │
   ┌────┴───────────────────────────────────────────────────────┐
   │ Bucle Finito (for iteration < budget.maxSteps)             │
   │                                                            │
   │ 1. Comprobación previa de Cancelación                      │
   │ 2. Comprobación previa de Presupuesto (checkBudget)        │
   │ 3. PolicyGateway.evaluate() [FAIL-CLOSED]                  │
   │ 4. Submit Task ➔ CoreRuntime.execute()                     │
   │ 5. Task Output/Error ➔ Mapeo a Observation                │
   │ 6. AutonomousOperation.recordStep(delta)                   │
   │ 7. DecisionEvaluatorPort.evaluate(context)                 │
   │ 8. Ramificación según Decision:                            │
   │    • COMPLETE     ➔ Operation.complete() [TERMINAL]        │
   │    • FAIL         ➔ Operation.fail()     [TERMINAL]        │
   │    • STOP         ➔ Operation.cancel()   [TERMINAL]        │
   │    • EXECUTE_STEP ➔ Siguiente paso en Plan [ITERAR]        │
   └────────────────────────────────────────────────────────────┘
```

### 6.2 El Presupuesto de Autonomía (`AutonomyBudget`)
Todo inicio de operación autónoma exige la definición de un presupuesto inmutable:
* `maxSteps`: Límite estricto en el número de iteraciones del bucle (entero positivo, ej. 1 a 25).
* `maxDurationMs`: Límite de tiempo de reloj en milisegundos.
* `maxToolCalls`: Límite acumulado de invocaciones de herramientas.
* `maxTokens` *(opcional)*: Techo de tokens consumidos cuando sea medible sin acoplamiento a proveedores.

### 6.3 La Máquina de Estados de `AutonomousOperation`
```text
               [ SUBMITTED ]
                     │
                     ▼
                [ RUNNING ]
                     │
    ┌────────────────┼────────────────┬────────────────┐
    │                │                │                │
    ▼                ▼                ▼                ▼
[ COMPLETED ]   [ FAILED ]     [ CANCELLED ]   [ BUDGET_EXHAUSTED ]
```

* **`SUBMITTED ➔ RUNNING`:** Al iniciar el bucle en `AutonomousOrchestrator.run()`.
* **`RUNNING ➔ COMPLETED`:** Cuando el `DecisionEvaluator` confirma que el objetivo fue alcanzado (`Decision.type === "COMPLETE"`).
* **`RUNNING ➔ FAILED`:** Cuando ocurre un error irrecuperable de planificación, fallo terminal de un paso, o denegación de política (`PolicyDeniedError`).
* **`RUNNING ➔ CANCELLED`:** Exclusivamente ante una señal de cancelación explícita del operador o supervisor.
* **`RUNNING ➔ BUDGET_EXHAUSTED`:** Al alcanzar cualquiera de los límites del presupuesto (`STEPS_EXHAUSTED`, `DURATION_EXCEEDED`, `TOOLS_EXHAUSTED`, `TOKENS_EXHAUSTED`).

---

# Capítulo 7: Matriz de Responsabilidades de los Componentes

Para evitar la erosión de fronteras arquitectónicas, cada componente posee responsabilidades estrictamente delimitadas:

| Componente | Responsabilidad Primaria | Lo que NO hace (Frontera Estricta) |
| :--- | :--- | :--- |
| **Agent** | Agregado de identidad, directivas, modelo vinculado, herramientas permitidas y ámbito de memoria. | NO ejecuta código, NO contiene bucles, NO agenda tareas autónomas. |
| **Planner (`PlannerPort`)** | Descomponer un objetivo en un `Plan` estructurado y finito de pasos (`PlanStep`). | NO ejecuta herramientas, NO invoca modelos directamente, NO evalúa políticas. |
| **DecisionEvaluator** | Función pura que analiza la `Observation` de un paso para derivar la siguiente `Decision`. | NO ejecuta tareas, NO llama al runtime, NO tiene efectos secundarios mutables. |
| **PolicyGateway** | Evaluar y decidir si una acción sobre un recurso está autorizada (`ALLOW` o `DENY`). | NO ejecuta la acción, NO planifica, NO altera el contexto de la tarea. |
| **AutonomousOrchestrator**| Coordinar el ciclo iterativo acotado entre Planner, Evaluator y CoreRuntime. | NO es un runtime independiente, NO tiene hilos en background, NO reemplaza al `CoreRuntime`. |
| **CoreRuntime** | Ejecutar tareas canónicas de forma atómica y gobernar las transiciones de `Task` y `Execution`. | NO planifica, NO decide objetivos, NO contiene heurísticas de autonomía. |
| **Execution** | Representar un intento concreto y correlacionado de cómputo en la plataforma. | NO decide cuándo terminar la autonomía, NO orquesta pasos futuros. |
| **Observation** | Describir el resultado inmutable y serializable observado tras ejecutar un paso. | NO ejecuta código, NO contiene callbacks, NO invoca herramientas. |
| **RestartRecoveryService**| Reconciliar entidades interrumpidas tras caídas del proceso a estados terminales. | NO re-ejecuta tareas fallidas, NO reinicia inferencias interrumpidas. |
| **EventPublisher** | Difundir hechos inmutables de dominio a suscriptores desacoplados. | NO controla el flujo de ejecución, NO intercepta ni bloquea tareas. |

---

# Capítulo 8: Gobernanza Fail-Closed, Seguridad & Catálogo de Invariantes

### 8.1 Invariantes Verificados vs. Invariantes de Diseño

La arquitectura distingue formalmente entre lo que ha sido verificado mediante tests automáticos y lo que constituye una restricción de diseño contractual:

| ID | Invariante | Clasificación | Evidencia / Mecanismo de Verificación |
| :--- | :--- | :--- | :--- |
| **INV-01** | **Agent ≠ Execution** | `VERIFIED INVARIANT` | `AgentService.executeAgent()` despacha exclusivamente a través de `SubmitTask` y `CoreRuntime`. |
| **INV-02** | **CoreRuntime como Propietario Único** | `VERIFIED INVARIANT` | No existe ningún `AutonomousRuntime` ni motor secundario. `AutonomousOrchestrator` delega 100% en `CoreRuntime`. |
| **INV-03** | **Gobernanza Fail-Closed** | `VERIFIED INVARIANT` | Toda acción propuesta es evaluada por `PolicyGateway`. Si retorna `DENY` o arroja excepción, la ejecución falla al instante. |
| **INV-04** | **Lista Blanca Estricta de Herramientas** | `VERIFIED INVARIANT` | `AgentExecutionStrategy` verifica que la herramienta requerida esté presente en el arreglo `agent.tools`. |
| **INV-05** | **Aislamiento Estricto de Memoria** | `VERIFIED INVARIANT` | `MemoryGateway` y `MemoryService` aíslan las claves bajo el namespace `agent.memoryScope`. |
| **INV-06** | **Autonomía Estrictamente Acotada** | `VERIFIED INVARIANT` | El bucle de `AutonomousOrchestrator` es un bucle finito `for` indexado por `budget.maxSteps`. |
| **INV-07** | **Timeout vs. Cancelación** | `VERIFIED INVARIANT` | Exceder `maxDurationMs` resulta en `BUDGET_EXHAUSTED` (`DURATION_EXCEEDED`). La cancelación explícita resulta en `CANCELLED`. |
| **INV-08** | **Planner ≠ Executor** | `VERIFIED INVARIANT` | `PlannerPort` genera planes declarativos sin capacidad de invocar infraestructura. |
| **INV-09** | **DecisionEvaluator ≠ Executor** | `VERIFIED INVARIANT` | `DeterministicDecisionEvaluator` es una función pura sin efectos colaterales. |
| **INV-10** | **Prohibición de Bucles Infinitos** | `VERIFIED INVARIANT` | Cero construcciones `while(true)` o `for(;;)` en toda la base de código. |
| **INV-11** | **Desacoplamiento de Proveedores en Dominio** | `VERIFIED INVARIANT` | Cero importaciones de SDKs de terceros en `src/domain/`. |
| **INV-12** | **Cero Dependencias en Runtime** | `VERIFIED INVARIANT` | Sección `dependencies` vacía en `package.json`. |
| **INV-13** | **Inmunidad XSS en Front-End** | `VERIFIED INVARIANT` | Cero `innerHTML` en el Web Control Plane (`app.js`, `index.html`). |
| **INV-14** | **Transaccionalidad Atómica post-Crash** | `VERIFIED INVARIANT` | `RestartRecoveryService` opera dentro de transacciones SQLite atómicas. |

---

# Capítulo 9: Semántica de Cancelación & Decisiones Arquitectónicas Abiertas

### 9.1 Semántica de Cancelación Actual
1. **Cancelación Previa a la Planificación:** Si el `CancellationToken` contiene `isCancelled: true` antes de iniciar la planificación, la operación transiciona inmediatamente a `CANCELLED` y termina sin emitir tareas.
2. **Cancelación Entre Pasos (Inter-Step):** Antes de ejecutar cada paso dentro del bucle acotado, se evalúa el `CancellationToken`. Si fue activado, la operación se cancela de forma ordenada y no despacha el siguiente paso a `CoreRuntime`.
3. **Cancelación en Vuelo (In-Flight Task Execution):** Una vez que un paso ha sido transferido a `CoreRuntime.execute()` y está invocando un modelo o herramienta externa, el token actual no transmite una señal de interrupción asincrónica (como un `AbortSignal`) a los adaptadores de red subyacentes.

### 9.2 Registro de Decisión Arquitectónica Abierta (Open Architectural Decision)

```text
OPEN ARCHITECTURAL DECISION: OAD-001 — In-Flight Task Preemption & Asynchronous AbortSignals

Problema:
El CancellationToken actual es evaluado de forma sincrónica antes de cada paso.
Si un paso se encuentra en ejecución esperando una respuesta de inferencia lenta, no existe
un canal de señalización compartido que fuerce el aborto inmediato del socket HTTP subyacente.

Impacto Actual:
La cancelación se efectiviza al concluir el paso en vuelo y antes de iniciar el siguiente.
No compromete la integridad del dominio pero puede consumir latencia del paso activo.

Recomendación Técnica para Incremento Futuro:
Incorporar soporte nativo de AbortSignal estándar en CoreRuntime y en los contratos de
ModelGateway y ToolGateway, permitiendo propagar cancelaciones externas hacia el hardware de red.
Estado: ABIERTO (No bloquea la arquitectura v1.1.0).
```

---

# Capítulo 10: Catálogo de Servicios & Auditoría de la API REST

### 10.1 Auditoría de Endpoints

Todos los endpoints implementados residen en `src/platform/api/http-router.ts` y se exponen bajo el prefijo unificado `/api/v1/` (con alias retrocompatibles bajo `/api/platform/v1/*` y `/api/*`):

| Método | Endpoint | Estado de Implementación | Descripción Técnica |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | **IMPLEMENTED** | Sirve la Single-Page Application (Web Control Plane bilingüe). |
| `GET` | `/api/v1/status` | **IMPLEMENTED** | Estado de salud, uptime y conteo de entidades. |
| `GET` | `/api/v1/health` | **IMPLEMENTED** | Estado de salud general del sistema. |
| `GET` | `/api/v1/health/live` | **IMPLEMENTED** | Sonda de liveness para orquestadores de contenedores. |
| `GET` | `/api/v1/health/ready` | **IMPLEMENTED** | Sonda de readiness con verificación de persistencia. |
| `GET` | `/api/v1/diagnostics` | **IMPLEMENTED** | Reporte forense integral de diagnósticos y estado de componentes. |
| `GET` | `/api/v1/diagnostics/traces/:id`| **IMPLEMENTED** | Reconstrucción de traza y eventos correlacionados por traceId. |
| `GET` | `/api/v1/models` | **IMPLEMENTED** | Lista de modelos registrados y sus capacidades. |
| `GET` | `/api/v1/models/:id` | **IMPLEMENTED** | Detalle de modelo específico. |
| `GET` | `/api/v1/tools` | **IMPLEMENTED** | Lista de herramientas y esquemas de parámetros. |
| `GET` | `/api/v1/tools/:id` | **IMPLEMENTED** | Detalle y esquema de validación de herramienta. |
| `GET` | `/api/v1/agents` | **IMPLEMENTED** | Listado de agentes registrados. |
| `POST` | `/api/v1/agents` | **IMPLEMENTED** | Registro de nuevo agente (HTTP 201). |
| `GET` | `/api/v1/agents/:id` | **IMPLEMENTED** | Consulta de perfil y configuración de agente. |
| `PUT` | `/api/v1/agents/:id` | **IMPLEMENTED** | Actualización de configuración de agente. |
| `POST` | `/api/v1/agents/:id/activate` | **IMPLEMENTED** | Transición de agente a estado `ACTIVE`. |
| `POST` | `/api/v1/agents/:id/deactivate` | **IMPLEMENTED** | Transición de agente a estado `INACTIVE`. |
| `POST` | `/api/v1/agents/:id/executions`| **IMPLEMENTED** | Ejecución gobernada a través de `CoreRuntime`. |
| `GET` | `/api/v1/tasks` | **IMPLEMENTED** | Listado de proyecciones durables de tareas. |
| `POST` | `/api/v1/tasks` | **IMPLEMENTED** | Encolamiento canónico vía `SubmitTask`. |
| `GET` | `/api/v1/tasks/:id` | **IMPLEMENTED** | Consulta de tarea por identificador. |
| `GET` | `/api/v1/executions` | **IMPLEMENTED** | Listado de proyecciones de ejecución. |
| `POST` | `/api/v1/executions` | **IMPLEMENTED** | Despacho de tarea y ejecución directa. |
| `GET` | `/api/v1/executions/:id` | **IMPLEMENTED** | Consulta de ejecución por identificador. |
| `GET` | `/api/v1/executions/:id/timeline` | **IMPLEMENTED** | Timeline forense correlacionado por `traceId`. |
| `POST` | `/api/v1/orchestrate` | **IMPLEMENTED** | Orquestación lineal multi-operación. |
| `GET` | `/api/v1/metrics` | **IMPLEMENTED** | Métricas y muestras de telemetría operativa. |
| `GET` | `/api/v1/audit` | **IMPLEMENTED** | Stream completo de auditoría forense. |
| `GET` | `/api/v1/operations` | **IMPLEMENTED** | Listado de operaciones autónomas acotadas. |
| `POST` | `/api/v1/operations` | **IMPLEMENTED** | Creación y despacho sincrónico en-proceso de operación acotada. |
| `GET` | `/api/v1/operations/:id` | **IMPLEMENTED** | Consulta detallada de operación con pasos, observaciones y decisiones. |
| `POST` | `/api/v1/operations/:id/cancel` | **IMPLEMENTED** | Señal de cancelación explícita de operación. |
| `GET` | `/api/v1/devices` | **IMPLEMENTED** | Listado de dispositivos físicos empresariales registrados. |
| `GET` | `/api/v1/devices/:id` | **IMPLEMENTED** | Detalle y salud de dispositivo empresarial. |
| `POST` | `/api/v1/devices/:id/print` | **IMPLEMENTED** | Despacho de trabajo de impresión comercial. |

---

# Capítulo 11: Matriz de Trazabilidad Arquitectónica

Esta matriz vincula cada decisión arquitectónica aprobada con su documento ADR, su código fuente, sus pruebas de verificación y su documentación:

| Decisión Arquitectónica | ADR | Código Fuente | Tests de Verificación | Documentación |
| :--- | :--- | :--- | :--- | :--- |
| **TypeScript & Zero Runtime Dependencies** | ADR 0001 | `package.json`<br>`src/platform/server.ts` | `scripts/test.js`<br>`npm ls --omit=dev` | `README.md`<br>`docs/ARCHITECTURE.md` |
| **Domain Events & Observabilidad Inmutable** | ADR 0002 | `src/domain/events/events.ts`<br>`src/infrastructure/events/` | `tests/contract/event-publisher.contract.test.ts` | `docs/decisions/0002-domain-events-and-observability.md` |
| **Manual Composition Root** | ADR 0003 | `src/interfaces/composition.ts` | `tests/integration/core-runtime.test.ts` | `docs/decisions/0003-manual-composition.md` |
| **Core Runtime Execution Model** | ADR 0004 | `src/application/runtime/core-runtime.ts` | `tests/unit/execution.test.ts` | `docs/decisions/0004-core-runtime-execution-model.md` |
| **Tools as Explicit Capabilities** | ADR 0005 | `src/application/tools/tool-gateway.ts` | `tests/unit/tool-gateway.test.ts` | `docs/decisions/0005-tools-as-explicit-capabilities.md` |
| **Engine / Platform / Application Boundary** | ADR 0006 | `src/domain/`<br>`src/platform/`<br>`src/application/` | `tests/unit/architecture-isolation.test.ts` | `docs/decisions/0006-engine-platform-application-boundary.md` |
| **Sequential Orchestration** | ADR 0007 | `src/application/orchestration/` | `tests/unit/sequential-orchestrator.test.ts` | `docs/decisions/0007-sequential-orchestration.md` |
| **Context & Scoped Memory Boundaries** | ADR 0008 | `src/domain/context/task-context.ts`<br>`src/domain/memory/` | `tests/unit/task-context.test.ts` | `docs/decisions/0008-context-and-memory-boundaries.md` |
| **Fail-Closed Policy Governance** | ADR 0009 | `src/domain/policy/policy.ts`<br>`src/infrastructure/policy/` | `tests/unit/observability-and-policy.test.ts` | `docs/decisions/0009-observability-and-governance-boundaries.md` |
| **Platform API & Native Web UI** | ADR 0010 | `src/platform/api/http-router.ts`<br>`src/platform/web/` | `tests/platform/api.test.ts`<br>`tests/platform/operational-ui-frontend.test.ts` | `docs/decisions/0010-platform-api-and-web-ui.md` |
| **First-Class Agent Aggregate** | ADR 0011 | `src/domain/agent/agent.ts`<br>`src/application/agent/agent-service.ts` | `tests/unit/agent.test.ts`<br>`tests/integration/agent-runtime.test.ts` | `docs/decisions/0011-agent-architecture.md` |
| **Autonomous Operations Foundation** | ADR 0012 | `src/domain/autonomy/autonomous-operation.ts` | `tests/unit/autonomous-operation.test.ts` | `docs/decisions/0012-autonomous-operations.md` |
| **Autonomy Budget & Bounded Loop** | ADR 0013 | `src/domain/autonomy/autonomy-budget.ts`<br>`src/application/autonomy/autonomous-orchestrator.ts` | `tests/unit/autonomy-budget.test.ts`<br>`tests/unit/autonomous-orchestrator.test.ts` | `docs/decisions/0013-bounded-autonomous-operations.md` |
| **Autonomous Operations API & UI** | ADR 0014 | `src/platform/api/http-router.ts`<br>`src/platform/web/app.js` | `tests/platform/operations-api.test.ts` | `docs/decisions/0014-autonomous-operations-api-integration.md` |
| **Durable Persistence Architecture (SQLite WAL)** | ADR 0015 | `src/infrastructure/persistence/sqlite/sqlite-database.ts`<br>`src/infrastructure/persistence/sqlite/sqlite-operation-repository.ts` | `tests/unit/sqlite-persistence.test.ts` | `docs/decisions/0015-durable-persistence-architecture.md` |
| **Formal Domain Rehydration Boundary** | ADR 0016 | `src/domain/autonomy/autonomous-operation.ts`<br>`src/infrastructure/persistence/sqlite/sqlite-mapper.ts` | `tests/unit/autonomous-operation.test.ts` | `docs/decisions/0016-formal-domain-rehydration-boundary.md` |
| **Core Execution Rehydration Boundary** | ADR 0017 | `src/domain/task/task.ts`<br>`src/domain/execution/execution.ts` | `tests/unit/task.test.ts`<br>`tests/unit/execution.test.ts` | `docs/decisions/0017-core-execution-domain-rehydration-boundary.md` |
| **Agent Domain Rehydration Boundary** | ADR 0018 | `src/domain/agent/agent.ts` | `tests/unit/agent.test.ts` | `docs/decisions/0018-agent-domain-rehydration-boundary.md` |
| **Durable SQLite Adapters for Core Entities** | ADR 0019 | `src/infrastructure/persistence/sqlite/sqlite-task-repository.ts`<br>`src/infrastructure/persistence/sqlite/sqlite-execution-repository.ts`<br>`src/infrastructure/persistence/sqlite/sqlite-agent-repository.ts` | `tests/contract/task-repository.contract.test.ts`<br>`tests/contract/execution-repository.contract.test.ts`<br>`tests/contract/agent-registry.contract.test.ts` | `docs/decisions/0019-durable-sqlite-adapters-for-task-execution-agent.md` |
| **Crash Recovery & Restart Reconciliation** | ADR 0020 | `src/application/recovery/restart-recovery-service.ts` | `tests/unit/restart-recovery-service.test.ts`<br>`tests/integration/sqlite-crash-recovery.integration.test.ts` | `docs/decisions/0020-crash-recovery-and-restart-reconciliation.md` |
| **Durable Events & Audit Infrastructure** | ADR 0021 | `src/infrastructure/persistence/sqlite/sqlite-event-store.ts` | `tests/contract/durable-event-store.contract.test.ts`<br>`tests/integration/sqlite-durable-events.integration.test.ts` | `docs/decisions/0021-durable-events-and-audit-infrastructure.md` |
| **Observability Audit Query & Diagnostics** | ADR 0022 | `src/application/diagnostics/runtime-diagnostics.ts`<br>`src/platform/api/http-router.ts` | `tests/platform/diagnostics-api.test.ts` | `docs/decisions/0022-observability-audit-query-and-runtime-diagnostics.md` |
| **Google Gemini Model Gateway** | ADR 0023 | `src/infrastructure/model/gemini/gemini-model-gateway.ts` | `tests/unit/gemini-model-gateway.test.ts` | `docs/decisions/0023-google-gemini-model-gateway.md` |
| **SQLite Durable Memory Gateway** | ADR 0024 | `src/infrastructure/memory/sqlite-memory-gateway.ts` | `tests/unit/sqlite-memory-gateway.test.ts`<br>`tests/contract/memory-gateway.contract.test.ts` | `docs/decisions/0024-sqlite-durable-memory-gateway.md` |
| **Asymmetric JWT & Key Rotation** | ADR 0025 | `src/infrastructure/security/jwt-token-verifier.ts` | `tests/unit/jwt-authentication.test.ts` | `docs/decisions/0025-asymmetric-jwt-and-key-rotation.md` |
| **Production Reverse Proxy & TLS** | ADR 0026 | `deploy/nginx/nginx.conf`<br>`deploy/caddy/Caddyfile`<br>`deploy/docker-compose.prod.yml` | Despliegue de manifiestos y configuración | `docs/decisions/0026-production-reverse-proxy-and-tls.md` |
| **Virtual Organization Foundation** | ADR 0027 | `src/domain/organization/`<br>`src/infrastructure/organization/` | `tests/unit/organization-domain.test.ts`<br>`tests/platform/organization-api.test.ts` | `docs/decisions/0027-virtual-organization-foundation.md` |
| **Security Context & Multi-Tenant Boundary** | ADR-003 | `src/domain/security/boundaries.ts` | `tests/unit/security-boundaries.test.ts` | `docs/decisions/ADR-003-security-context.md` |
| **Tentaciones Platform Integration & Fallback** | ADR-008 | `src/application/platform/tentaciones-platform-adapter.ts` | `tests/platform/tentaciones-platform-adapter.test.ts` | `docs/decisions/ADR-008-tentaciones-integration.md` |
| **Platform Truth Model** | ADR-010 | `docs/SOURCE_OF_TRUTH.md` | `tests/platform/runtime-integration-hardening.test.ts` | `docs/decisions/ADR-010-platform-truth-model.md` |

---

# Capítulo 12: Hoja de Ruta Oficial (Roadmap Sincronizado)

El roadmap técnico se estructura exclusivamente sobre hechos demostrados en el código y proyecciones futuras debidamente delimitadas:

```text
COMPLETADO & VERIFICADO (v1.2.0 BASELINE CANÓNICA — 1019 TESTS PASS)
──────────────────────────────────────────────────────────────────────────
• v0.1 a v0.6: Core Engine Primitives (Runtime, Context, Memory, Tools, Models, Policy)
• v0.7: Platform API Gateway & Web Control Plane SPA (Zero Runtime Dependencies)
• v0.8: First-Class Agents Capability (Agent Aggregate, Whitelisting, Scoping)
• v0.9: Bounded Autonomous Operations (AutonomyBudget, AutonomousOrchestrator, DecisionEvaluator)
• v0.10: Durable Persistence Architecture (SqliteDatabase nativo, SqliteOperationRepository WAL)
• v0.11: Formal Domain Rehydration Boundaries (Task, Execution, Agent, AutonomousOperation)
• v0.12: Durable Execution Persistence (SqliteTaskRepository, SqliteExecutionRepository, SqliteAgentRepository)
• v0.13: Crash Recovery & Reconciliation (RestartRecoveryService atómico, SqliteEventStore)
• v1.0.0: AI Operating Platform Foundation (Platform API, PlatformClient SDK, Tentaciones AI Commerce)
• v1.1.0: Ecosistema Extendido & Madurez Operacional:
  - Real AI Providers: Adaptadores OpenAI, Anthropic, Ollama y ProviderFactory.
  - Business Devices: Adaptador Brother DCP-1600 series en USB001 y spooler de impresión.
  - Reference Applications: Vehicle Parts Platform y Application Factory 2.0.
  - Bilingual Interface: Consola web nativa en Español Latinoamericano (es-419) e Inglés (en).
• v1.2.0 (Fase 55 / Prompt 101): Enterprise Cloud Foundation & Real Model Expansion:
  - Google Gemini / Vertex AI: Adaptador nativo GeminiModelGateway con streaming y tool calling (AOP-MODEL-GEMINI).
  - Durable Memory Gateway: Pasarela relacional duradera SqliteMemoryGateway en SQLite WAL (AOP-MEMORY).
  - Asymmetric JWT & OIDC: Verificador criptográfico JwtTokenVerifier con RS256/ES256 y rotación de claves (AOP-AUTH).
  - Perimeter Network Topology: Manifiestos de producción Nginx/Caddy con TLS, HSTS y Docker Compose (AOP-NETWORK).
  - REST API Surface Convergence: Cabeceras RFC 8594 (Deprecation/Sunset) en alias /api/platform/v1/* (AOP-API-SURFACES).
• v1.2.0 (Fase 56 / Prompt 102): Virtual Organization Foundation:
  - Organization Aggregate: Agregado empresarial con ciclo de vida blando (ACTIVE, INACTIVE, ARCHIVED).
  - Functional Areas & Working Teams: Entidades Area y Team asociadas a la organización dentro de tenantId.
  - Governed Agent Membership: Vinculación explícita de agentes a equipos con roles operativos (LEAD, SPECIALIST, OPERATOR, REVIEWER).
  - Durable Persistence: SqliteOrganizationRepository en SQLite WAL con OCC e índices compuestos.
  - RESTful API & UI: Endpoints canónicos /api/v1/* y panel SPA interactivo bilingüe (0 innerHTML).
  - Test Baseline: 1019 tests passing deterministas (0 fail, 11 suites).

ROADMAP FUTURO (BACKLOG FORMAL v1.2 — DISEÑADO / NO IMPLEMENTADO)
──────────────────────────────────────────────────────────────────────────
• AOP-V1-EXIT: Certificación final de criterios de salida para producción masiva.
```

---

# Glosario de Términos Arquitectónicos

* **Agent (Agente):** Agregado declarativo de dominio que encapsula la identidad, instrucciones de comportamiento, modelo de IA vinculado, lista blanca estricta de herramientas y ámbito de memoria particionado.
* **AutonomousOperation (Operación Autónoma):** Entidad supervisora que coordina la ejecución de un objetivo multi-paso acotado por un presupuesto estricto.
* **AutonomyBudget (Presupuesto de Autonomía):** Value Object inmutable que impone techos infranqueables de pasos (`maxSteps`), duración de reloj (`maxDurationMs`) e invocaciones de herramientas (`maxToolCalls`).
* **CoreRuntime:** Motor central y exclusivo de ejecución de tareas atómicas de la plataforma. Propietario único del ciclo de vida de `Task` y `Execution`.
* **Decision:** Objeto de dominio discreto que representa la determinación tomada tras evaluar la observación de un paso (`COMPLETE`, `FAIL`, `STOP`, `EXECUTE_STEP`).
* **Fail-Closed:** Principio de diseño de seguridad según el cual cualquier fallo, excepción, timeout o incertidumbre de autorización produce la denegación y detención inmediata de la operación.
* **Observation:** Value Object serializable e inmutable que registra el resultado técnico y fáctico de un paso ejecutado en el motor central.
* **RestartRecoveryService:** Servicio de aplicación que garantiza la reconciliación atómica idempotente de tareas y operaciones interrumpidas tras una caída del sistema.
* **TraceId:** Identificador único de correlación transversal que acompaña a toda petición desde el cliente HTTP hasta la base de datos y eventos de auditoría.
* **Zero Runtime Dependencies:** Característica del sistema por la cual el código en producción opera exclusivamente con las APIs nativas de Node.js, sin paquetes en la sección `dependencies` de `package.json`.

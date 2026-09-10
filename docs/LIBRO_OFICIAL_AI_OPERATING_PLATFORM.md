# LIBRO OFICIAL DE ARQUITECTURA & OPERACIONES
## AI OPERATING PLATFORM
### *Fundamentos de Ingeniería de Software para la Habilitación de IA Multiplataforma*

---

**Documento:** AI Operating Platform — Official Architecture Book  
**Versión del Documento:** 1.2 (Consolidación v0.9 Release Candidate)  
**Estado del Repositorio:** v0.9 Release Candidate (Increments #1 al #7 — Hardened & Frozen)  
**Estado Documental:** Oficial / Sincronizado con Repositorio  
**Fecha de Verificación:** Septiembre de 2026  
**Fuente de Verdad Técnica:** Código fuente (`src/`) + Tests automatizados (`tests/`) + ADRs (`docs/decisions/`)  
**Fuente Canónica del Documento:** `LIBRO_OFICIAL_AI_OPERATING_PLATFORM.md`  

---

## Control de Versiones del Documento

| Versión | Fecha | Estado del Repositorio | Resumen de Cambios |
| :--- | :--- | :--- | :--- |
| **1.0** | Septiembre 2026 | v0.8 Baseline | Generación inicial documental post-v0.8 (Agentes y Control Plane). |
| **1.1** | Septiembre 2026 | v0.9 Increment #5 | Auditoría arquitectónica integral e incorporación formal de v0.9 Increments #1 al #5. |
| **1.2** | Septiembre 2026 | v0.9 Release Candidate | **Consolidación completa de v0.9 Bounded Autonomous Operations:**<br>• Incorporación de Increment #6: Endpoints REST `/api/v1/operations*`, repositorio in-memory desacoplado y Web Control Plane SPA (cero `innerHTML`).<br>• Incorporación de Increment #7: Hardening de seguridad, auditoría estricta de invariantes, 268 tests passing al 100% deterministas.<br>• Actualización de matrices de estado, trazabilidad y roadmap oficial (v0.10 Durable Persistence como siguiente hito). |

---

## Prefacio: Plataforma Operacional de IA para Habilitación Multiplataforma

El propósito de la **AI Operating Platform** no es constituir una "fábrica aislada" ni un chatbot monolítico independiente. Su rol estratégico es actuar como la **plataforma operacional de infraestructura y gobierno de Inteligencia Artificial** concebida para conectarse con y dotar de capacidades cognitivas a múltiples plataformas de negocio existentes y futuras.

Entre sus principales casos de integración se encuentran aplicaciones de comercio electrónico (como plataformas de venta de vestuario y retail omnicanal), sistemas de gestión de inventario y pedidos, plataformas SaaS y servicios de atención automatizada. En lugar de dispersar llamadas caóticas a APIs de modelos de lenguaje (LLMs) dentro del código de cada aplicación satélite, esta plataforma centraliza:
1. **La orquestación determinista y auditable de tareas y ejecuciones.**
2. **El perfilado de Agentes con lista blanca estricta de herramientas y aislamiento de memoria.**
3. **La gobernanza Fail-Closed mediante políticas previas a cada invocación de modelo o herramienta.**
4. **La supervisión de Operaciones Autónomas Acotadas (Bounded Autonomous Operations) con presupuestos estrictos de tiempo, pasos y llamadas a herramientas.**
5. **La observabilidad inmutable y correlacionada forense sin dependencias de librerías externas en runtime.**

Este libro constituye la representación técnica veraz y auditada del estado actual de la plataforma en su versión **v0.9 (Incrementos #1 al #7 implementados, verificados y congelados para release)**.

---

## Índice General

1. [Capítulo 1: Visión Estratégica, Principios & Modelo de Dependencias](#capítulo-1-visión-estratégica-principios--modelo-de-dependencias)
2. [Capítulo 2: Arquitectura de un Vistazo (Architecture at a Glance) & Matriz de Estado](#capítulo-2-arquitectura-de-un-vistazo-architecture-at-a-glance--matriz-de-estado)
3. [Capítulo 3: Las Cuatro Infografías Maestras de la Plataforma](#capítulo-3-las-cuatro-infografías-maestras-de-la-plataforma)
   * 3.1 [Blueprint 1: Topología Hexagonal en 5 Capas](#31-blueprint-1-topología-hexagonal-en-5-capas)
   * 3.2 [Blueprint 2: Flujo de Ejecución End-to-End & Trace Lifecycle](#32-blueprint-2-flujo-de-ejecución-end-to-end--trace-lifecycle)
   * 3.3 [Blueprint 3: Arquitectura de Agentes de Primera Clase](#33-blueprint-3-arquitectura-de-agentes-de-primera-clase)
   * 3.4 [Blueprint 4: Gobernanza Fail-Closed & Observabilidad Inmutable](#34-blueprint-4-gobernanza-fail-closed--observabilidad-inmutable)
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
2. **Zero Runtime Dependencies:** El archivo `package.json` no contiene ningún paquete en la sección `dependencies`. Todo el código en tiempo de ejecución se apoya exclusivamente en las APIs nativas de Node.js (`node:http`, `node:fs`, `node:crypto`, `node:path`, `node:url`).
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
│   └── Decoupled API Client (api-client.js)
│
├── Platform API Layer (src/platform/api/)
│   ├── Native HTTP Server (node:http enlazado a 127.0.0.1)
│   ├── HttpRouter (Normalización regex de IDs, límite de 1MB, application/json)
│   ├── PlatformService (Fachada inyectada con QueryPorts y Casos de Uso)
│   └── PlatformDTOs (Contratos inmutables de transferencia)
│
├── Application Layer (src/application/)
│   ├── CoreRuntime (Propietario único de la ejecución Task/Execution)
│   ├── SubmitTask & ExecuteTask (Casos de uso de encolamiento y despacho)
│   ├── AgentService (Gestión y despacho de agentes)
│   ├── AutonomousOrchestrator (Coordinador del bucle acotado v0.9)
│   ├── AutonomousOperationService (Gestión de operaciones autónomas)
│   ├── SequentialOrchestrator & ExecuteOrchestration (Secuencias declarativas)
│   ├── MemoryService (Servicio de persistencia particionada)
│   └── ExecutionStrategies (ModelExecutionStrategy, AgentExecutionStrategy, OrchestratedExecutionStrategy)
│
├── Domain Core Layer (src/domain/)
│   ├── Task & Execution (Agregados y máquinas de estados)
│   ├── Agent (Agregado de primera clase con model binding, tools y memoryScope)
│   ├── AutonomousOperation & AutonomyBudget & AutonomyConsumption (Dominio v0.9)
│   ├── PlannerPort, PlanningRequest, Plan, PlanStep, Decision (Contratos de planificación v0.9)
│   ├── Observation, ObjectiveEvaluation, DecisionEvaluatorPort (Contratos de evaluación v0.9)
│   └── Domain Ports (PolicyGateway, ModelGateway, ToolGateway, MemoryGateway, EventPublisher, TaskRepository, ExecutionRepository)
│
└── Infrastructure Layer (src/infrastructure/)
    ├── InMemory Repositories (Task, Execution, Agent, Operation)
    ├── Adapters de Modelos (StubModelGateway, InMemoryModelRegistry)
    ├── Adapters de Herramientas (CalculatorTool, InMemoryToolRegistry, RegistryToolGateway)
    ├── Adapters de Gobernanza (InMemoryPolicyGateway Fail-Closed)
    ├── Adapters de Autonomía (DeterministicDecisionEvaluator, StubPlanner)
    └── Observabilidad (EventObservabilitySubscriber, InMemoryAuditLog, InMemoryMetricsCollector, StructuredEventLogger)
```

### 2.2 Matriz de Estado Oficial de Capacidades

| Capacidad / Componente | Arquitectura | Código | Tests | Documentación | Estado Oficial |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Agregado Agent (v0.8)** | Diseñada | Implementado | 18 tests | Documentado | **IMPLEMENTED / VERIFIED** |
| **AgentRegistry & Port (v0.8)** | Diseñada | Implementado | 6 tests | Documentado | **IMPLEMENTED / VERIFIED** |
| **AgentService (v0.8)** | Diseñada | Implementado | 12 tests | Documentado | **IMPLEMENTED / VERIFIED** |
| **AgentExecutionStrategy (v0.8)** | Diseñada | Implementado | 14 tests | Documentado | **IMPLEMENTED / VERIFIED** |
| **Fail-Closed PolicyGateway (v0.8)** | Diseñada | Implementado | 8 tests | Documentado | **IMPLEMENTED / VERIFIED** |
| **Tool Whitelisting (v0.8)** | Diseñada | Implementado | 10 tests | Documentado | **IMPLEMENTED / VERIFIED** |
| **Memory Scope Partitioning (v0.8)**| Diseñada | Implementado | 8 tests | Documentado | **IMPLEMENTED / VERIFIED** |
| **Platform API v1 (v0.8)** | Diseñada | Implementado | 38 tests | Documentado | **IMPLEMENTED / VERIFIED** |
| **Web Control Plane SPA (v0.8)** | Diseñada | Implementado | Verificado | Documentado | **IMPLEMENTED / VERIFIED** |
| **AutonomyBudget (v0.9 Incr #1)** | Diseñada | Implementado | 16 tests | Documentado | **IMPLEMENTED / VERIFIED** |
| **AutonomousOperation & Consumption (v0.9 Incr #2)** | Diseñada | Implementado | 22 tests | Documentado | **IMPLEMENTED / VERIFIED** |
| **Planning & Decision Contracts (v0.9 Incr #3)** | Diseñada | Implementado | 28 tests | Documentado | **IMPLEMENTED / VERIFIED** |
| **Observation & DecisionEvaluator (v0.9 Incr #4)** | Diseñada | Implementado | 24 tests | Documentado | **IMPLEMENTED / VERIFIED** |
| **AutonomousOrchestrator Loop (v0.9 Incr #5)** | Diseñada | Implementado | 22 tests | Documentado | **IMPLEMENTED / VERIFIED** |
| **Platform API Operations Endpoints (v0.9 Incr #6)** | Diseñada | Implementado | 22 tests | Documentado | **IMPLEMENTED / VERIFIED** |
| **Web Control Plane Operations Integration (v0.9 Incr #6)** | Diseñada | Implementado | Verificado (DOM puro, 0 innerHTML) | Documentado | **IMPLEMENTED / VERIFIED** |
| **Hardening & Release Freeze (v0.9 Incr #7)** | Diseñada | Implementado | 268 tests pass (100% determinismo) | Documentado | **IMPLEMENTED / VERIFIED** |
| **Persistencia Externa (PostgreSQL / SQLite)** | Diseñada | No implementado| No | Conceptual | **FUTURE ROADMAP (v0.10)** |
| **Model Adapters Reales (Cloud Gemini/Claude/OpenAI)** | Diseñada | No implementado| No | Conceptual | **FUTURE ROADMAP** |

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
  4. **Capa de Infraestructura y Adaptadores:** Gestiona los puertos de herramientas (consultas de inventario, pasarelas externas), conectores LLM y repositorios en memoria.

## 3.2 Blueprint 1: Topología Hexagonal y Puertos & Adaptadores en 5 Capas
![Blueprint 1: Topología Hexagonal en 5 Capas](docs/images/01_mapa_arquitectura_hexagonal.jpg)

Representa la estricta separación de fronteras arquitectónicas:
* **Núcleo de Dominio (Centro):** Reglas de negocio puras, presupuestos inmutables, máquinas de estados y emisión de eventos. No tiene dependencias externas.
* **Capa de Aplicación & Puertos (Anillo Intermedio):** Casos de uso de orquestación, puertos de entrada y salida abstractos.
* **Infraestructura & Plataforma (Anillo Exterior):** Adaptadores HTTP, adaptadores LLM, herramientas externas y repositorio en memoria.
* **Regla de Dependencia:** Las dependencias apuntan exclusivamente hacia adentro. El núcleo de dominio no conoce a la base de datos, la red ni a los proveedores de modelos.

## 3.3 Blueprint 2: Flujo de Ejecución End-to-End & Ciclo de Vida Operacional
![Blueprint 2: Flujo de Ejecución End-to-End](docs/images/02_mapa_flujo_ejecucion.jpg)

Muestra la secuencia de 6 fases del ciclo operacional acotado:
1. **Recepción de Solicitud (HTTP DTO):** Ingreso validado por la frontera perimetral.
2. **Validación de Presupuesto:** Comprobación formal de `AutonomyBudget` (pasos máximos, presupuesto USD, tiempo máximo).
3. **Planificación Inicial:** Despacho hacia `PlannerPort` para generar un `Plan` ordenado y determinista.
4. **Bucle Acotado de Ejecución:** Ciclo iterativo `for (let i = 0; i < maxSteps; i++)` que ejecuta cada paso, obtiene una `Observation` inmutable y evalúa una `Decision`.
5. **Transición a Estado Terminal:** Clasificación rigurosa en `COMPLETADA`, `PRESUPUESTO AGOTADO` o `CANCELADA`.
6. **Emisión de Eventos y Auditoría Inmutable:** Registro correlacionado de todos los hechos en el bus operacional.

## 3.4 Blueprint 3: Arquitectura de Agentes de Primera Clase y Capacidades Cognitivas
![Blueprint 3: Arquitectura de Agentes](docs/images/03_mapa_arquitectura_agentes.jpg)

Consagra el invariante fundamental: **"El Agente NO reemplaza a la Ejecución"**:
* Un agente define una configuración declarativa de capacidades (perfil de rol, modelo vinculado, lista blanca estricta de herramientas `ToolGateway` y ámbito de memoria particionado).
* Todo despacho de un agente se ejecuta obligatoriamente bajo las políticas y presupuestos del `CoreRuntime`, impidiendo accesos no autorizados a herramientas fuera de su perfil.

## 3.5 Blueprint 4: Gobernanza Fail-Closed & Observabilidad Inmutable
![Blueprint 4: Gobernanza Fail-Closed y Observabilidad](docs/images/04_mapa_gobernanza_observabilidad.jpg)

Visualiza el mecanismo de ciberseguridad y observabilidad continua:
* **Gobernanza Fail-Closed (Seguridad por Defecto):** Cualquier falla en la evaluación de políticas, timeout o intento de inyectar funciones ejecutables en metadatos produce la detención inmediata de la operación.
* **Bus de Eventos Operacionales:** Difusión desacoplada de eventos de dominio tipados.
* **Observabilidad Inmutable:** Generación de snapshots congelados con `Object.freeze()`, línea de tiempo de auditoría inmutable y trazabilidad integral `{ traceId, taskId, executionId }`.

---

# Capítulo 4: Especificación Exhaustiva de Capas y Componentes

### 4.1 Capa 1: Presentación & Consumidores Externos
* **Web Platform Control Plane (`src/platform/web/`):** Single-Page Application (SPA) nativa construida con HTML5, JavaScript Vanilla y CSS puro. Diseñada sin dependencias de frameworks (sin React, Vue o Angular) para maximizar la mantenibilidad a largo plazo. Utiliza construcción directa de nodos DOM (`document.createElement`, `textContent`) eliminando el uso de `innerHTML` como medida activa contra Cross-Site Scripting (XSS).
* **Consumidores Externos:** Aplicaciones satélites que se comunican con la plataforma a través de HTTP/JSON utilizando los DTOs estables de la API.

### 4.2 Capa 2: Límite de Producto (Platform API)
* **Servidor HTTP Nativo (`src/platform/server.ts`):** Enlace restrictivo a bucle local `127.0.0.1:3000`. Rechaza peticiones dirigidas a interfaces de red públicas no autorizadas.
* **Enrutador (`src/platform/api/http-router.ts`):**
  * Normalización de identificadores con la expresión regular `^[a-zA-Z0-9_-]{1,128}$`.
  * Protección contra saturación: límite estricto de cuerpo de petición a 1MB (HTTP 413) y validación de tipo MIME `application/json` (HTTP 415).
  * Prevención contra Path Traversal en el servicio de archivos estáticos.
* **Proyecciones de Lectura (CQRS):** Ubicadas en `src/application/ports/query-ports.ts`. Separan estrictamente la consulta de estados (`ExecutionProjection`, `TaskProjection`, `AgentProjection`, `OperationProjection`) de los métodos de mutación y transición del dominio.

### 4.3 Capa 3: Aplicación & Motores Operacionales
* **`CoreRuntime` (`src/application/runtime/core-runtime.ts`):** Propietario único y centralizado de la ejecución atómica. Coordina la máquina de estados de `Task` y `Execution`, emite los eventos del ciclo de vida y delega el trabajo real en una `ExecutionStrategy`.
* **`SubmitTask` (`src/application/submit-task.ts`):** Caso de uso canónico para el registro y encolamiento inicial de tareas en estado `QUEUED`.
* **`AgentService` (`src/application/agent/agent-service.ts`):** Servicio que administra el ciclo de vida del agente y despacha ejecuciones a través de `SubmitTask`.
* **`AutonomousOrchestrator` (`src/application/autonomy/autonomous-orchestrator.ts`):** Servicio de aplicación que coordina el ciclo de supervisión autónoma en pasos acotados, evaluando políticas y delegando la ejecución en `CoreRuntime`.
* **`SequentialOrchestrator` (`src/application/orchestration/sequential-orchestrator.ts`):** Ejecuta secuencias lineales predefinidas con enlace de parámetros entre operaciones consecutivas.

### 4.4 Capa 4: Núcleo de Dominio Puro
* **Agregados Principales:**
  * `Task`: Unidad duradera de trabajo (`CREATED` ➔ `QUEUED` ➔ `RUNNING` ➔ `COMPLETED` / `FAILED`).
  * `Execution`: Intento concreto y fechado de cómputo dentro de un contexto inmutable.
  * `Agent`: Perfil de capacidades autorizadas.
  * `AutonomousOperation`: Supervisión acotada con presupuesto y seguimiento de consumo.
* **Puertos Abstractos:** `PolicyGateway`, `ModelGateway`, `ToolGateway`, `MemoryGateway`, `EventPublisher`, `PlannerPort`, `DecisionEvaluatorPort`, `TaskRepository`, `ExecutionRepository`, `OperationRepositoryPort`. Ninguno posee dependencias externas ni código de transporte.

### 4.5 Capa 5: Infraestructura & Adaptadores Concretos
* **Persistencia en Memoria:** `InMemoryTaskRepository`, `InMemoryExecutionRepository`, `InMemoryAgentRegistry`, `InMemoryOperationRepository`.
* **Modelos y Herramientas:** `StubModelGateway` (emulador determinista local para pruebas con latencia predecible) y `InMemoryToolRegistry` con `CalculatorTool`.
* **Gobernanza:** `InMemoryPolicyGateway` con evaluación configurable de reglas por acción y recurso.
* **Telemetría y Auditoría:** `EventObservabilitySubscriber`, `InMemoryAuditLog` y `InMemoryMetricsCollector`.

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

### 6.4 Separación de Conceptos: `Observation ≠ Execution` y `Planner ≠ DecisionEvaluator`
* **`Observation`**: Value Object inmutable que describe el resultado observado de un paso ejecutado en `CoreRuntime`. No contiene código ejecutable, callbacks ni referencias al runtime.
* **`ObjectiveEvaluation`**: Separa el éxito de la ejecución técnica (`observation.status === "SUCCESS"`) del cumplimiento del objetivo del usuario (`status === "ACHIEVED"`).
* **`DecisionEvaluator`**: Función pura sin efectos secundarios que toma la observación y el estado actual para derivar la siguiente `Decision`. No ejecuta código ni modifica la base de datos.
* **`PlannerPort`**: Contrato responsable de descomponer el objetivo inicial en un `Plan` ordenado.

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
| **INV-13** | **Preempción de Tareas en Vuelo** | `DESIGN INVARIANT` | La cancelación entre pasos está verificada; la cancelación abortable a mitad de inferencia es un diseño abierto. |

---

# Capítulo 9: Semántica de Cancelación & Decisiones Arquitectónicas Abiertas

### 9.1 Semántica de Cancelación Actual
En la versión actual v0.9 Increment #5:
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
Estado: ABIERTO (No bloquea la arquitectura de v0.9).
```

---

# Capítulo 10: Catálogo de Servicios & Auditoría de la API REST

### 10.1 Auditoría de Endpoints

Todos los endpoints implementados residen en `src/platform/api/http-router.ts` y se exponen bajo el prefijo unificado `/api/v1/` (con alias retrocompatibles bajo `/api/*`):

| Método | Endpoint | Estado de Implementación | Descripción Técnica |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | **IMPLEMENTED (v0.7/v0.8)** | Sirve la Single-Page Application (Web Control Plane). |
| `GET` | `/api/v1/status` | **IMPLEMENTED (v0.7/v0.8)** | Estado de salud, uptime y conteo de entidades. |
| `GET` | `/api/v1/models` | **IMPLEMENTED (v0.7/v0.8)** | Lista de modelos registrados y sus capacidades. |
| `GET` | `/api/v1/models/:id` | **IMPLEMENTED (v0.7/v0.8)** | Detalle de modelo específico. |
| `GET` | `/api/v1/tools` | **IMPLEMENTED (v0.7/v0.8)** | Lista de herramientas y esquemas de parámetros. |
| `GET` | `/api/v1/tools/:id` | **IMPLEMENTED (v0.7/v0.8)** | Detalle y esquema de validación de herramienta. |
| `GET` | `/api/v1/agents` | **IMPLEMENTED (v0.8)** | Listado de agentes registrados. |
| `POST` | `/api/v1/agents` | **IMPLEMENTED (v0.8)** | Registro de nuevo agente (HTTP 201). |
| `GET` | `/api/v1/agents/:id` | **IMPLEMENTED (v0.8)** | Consulta de perfil y configuración de agente. |
| `PUT` | `/api/v1/agents/:id` | **IMPLEMENTED (v0.8)** | Actualización de configuración de agente. |
| `POST` | `/api/v1/agents/:id/activate` | **IMPLEMENTED (v0.8)** | Transición de agente a estado `ACTIVE`. |
| `POST` | `/api/v1/agents/:id/deactivate` | **IMPLEMENTED (v0.8)** | Transición de agente a estado `INACTIVE`. |
| `POST` | `/api/v1/agents/:id/executions`| **IMPLEMENTED (v0.8)** | Ejecución gobernada a través de `CoreRuntime`. |
| `GET` | `/api/v1/tasks` | **IMPLEMENTED (v0.7)** | Listado de proyecciones durables de tareas. |
| `POST` | `/api/v1/tasks` | **IMPLEMENTED (v0.7)** | Encolamiento canónico vía `SubmitTask`. |
| `GET` | `/api/v1/tasks/:id` | **IMPLEMENTED (v0.7)** | Consulta de tarea por identificador. |
| `GET` | `/api/v1/executions` | **IMPLEMENTED (v0.7)** | Listado de proyecciones de ejecución. |
| `POST` | `/api/v1/executions` | **IMPLEMENTED (v0.7)** | Despacho de tarea y ejecución directa. |
| `GET` | `/api/v1/executions/:id` | **IMPLEMENTED (v0.7)** | Consulta de ejecución por identificador. |
| `GET` | `/api/v1/executions/:id/timeline` | **IMPLEMENTED (v0.7)** | Timeline forense correlacionado por `traceId`. |
| `POST` | `/api/v1/orchestrate` | **IMPLEMENTED (v0.7)** | Orquestación lineal multi-operación. |
| `GET` | `/api/v1/metrics` | **IMPLEMENTED (v0.7)** | Métricas y muestras de telemetría operativa. |
| `GET` | `/api/v1/audit` | **IMPLEMENTED (v0.7)** | Stream completo de auditoría forense. |
| `GET` | `/api/v1/operations` | **IMPLEMENTED (v0.9)** | Listado de operaciones autónomas acotadas. |
| `POST` | `/api/v1/operations` | **IMPLEMENTED (v0.9)** | Creación y despacho sincrónico en-proceso de operación acotada. |
| `GET` | `/api/v1/operations/:id` | **IMPLEMENTED (v0.9)** | Consulta detallada de operación con pasos, observaciones y decisiones. |
| `POST` | `/api/v1/operations/:id/cancel` | **IMPLEMENTED (v0.9)** | Señal de cancelación explícita de operación. |

> [!NOTE]
> La interfaz gráfica de usuario en el Web Control Plane para operaciones autónomas (`tab-operations`) está plenamente integrada y verificada, empleando exclusivamente APIs nativas del DOM (cero `innerHTML`).

---

# Capítulo 11: Matriz de Trazabilidad Arquitectónica

| Decisión Arquitectónica | ADR | Código Fuente | Tests de Verificación | Documentación |
| :--- | :--- | :--- | :--- | :--- |
| **Agent ≠ Execution** | ADR 0011 | `src/domain/agent/agent.ts`<br>`src/application/agent/agent-service.ts` | `tests/unit/agent.test.ts`<br>`tests/integration/agent-runtime.test.ts` | `docs/architecture/agents.md`<br>`docs/manual/14_agents.md` |
| **Fail-Closed Governance** | ADR 0009 | `src/domain/policy/policy.ts`<br>`src/infrastructure/policy/in-memory-policy-gateway.ts` | `tests/unit/observability-and-policy.test.ts` | `docs/architecture/observability-and-governance.md` |
| **Autonomy Budget** | ADR 0013 | `src/domain/autonomy/autonomy-budget.ts`<br>`src/domain/autonomy/autonomy-consumption.ts` | `tests/unit/autonomy-budget.test.ts` | `docs/releases/v0.9-architecture-baseline.md` |
| **Autonomous Operation FSM** | ADR 0013 | `src/domain/autonomy/autonomous-operation.ts` | `tests/unit/autonomous-operation.test.ts` | `docs/manual/15_autonomous_operations.md` |
| **Planning & Decision Contracts** | ADR 0013 | `src/domain/autonomy/planning-request.ts`<br>`src/domain/autonomy/plan.ts`<br>`src/domain/autonomy/decision.ts` | `tests/unit/planning-contracts.test.ts` | `docs/manual/15_autonomous_operations.md` |
| **Observation & Evaluation** | ADR 0013 | `src/domain/autonomy/observation.ts`<br>`src/domain/autonomy/decision-evaluator.ts` | `tests/unit/observation.test.ts`<br>`tests/unit/decision-evaluator.test.ts` | `docs/manual/15_autonomous_operations.md` |
| **Bounded Orchestration Loop** | ADR 0013 | `src/application/autonomy/autonomous-orchestrator.ts` | `tests/unit/autonomous-orchestrator.test.ts` | `docs/manual/15_autonomous_operations.md` |
| **Autonomous Operations API & UI** | ADR 0014 | `src/platform/api/http-router.ts`<br>`src/platform/web/app.js` | `tests/platform/operations-api.test.ts` | `docs/manual/15_autonomous_operations.md`<br>`docs/decisions/0014-autonomous-operations-api-integration.md` |
| **Zero Runtime Dependencies** | ADR 0001 | `package.json`<br>`src/platform/server.ts` | `scripts/test.js`<br>`npm ls --omit=dev` | `README.md`<br>`ARCHITECTURE.md` |

---

# Capítulo 12: Hoja de Ruta Oficial (Roadmap Sincronizado)

El roadmap técnico se estructura sobre hechos demostrados en el código y proyecciones futuras debidamente delimitadas:

```text
COMPLETADO & VERIFICADO (v0.9 RELEASE CANDIDATE)
──────────────────────────────────────────────────────────────────────────
• v0.1 a v0.6: Core Engine Primitives (Runtime, Context, Memory, Tools, Models)
• v0.7: Platform API Gateway & Web Control Plane SPA (Zero Runtime Dependencies)
• v0.8: First-Class Agents Capability (Agent Aggregate, Whitelisting, Scoping)
• v0.9 Increment #1: AutonomyBudget Value Object
• v0.9 Increment #2: AutonomousOperation Entity & AutonomyConsumption
• v0.9 Increment #3: PlanningRequest, Plan, PlanStep, Decision, PlannerPort
• v0.9 Increment #4: Observation Value Object, ObjectiveEvaluation, DecisionEvaluator
• v0.9 Increment #5: AutonomousOrchestrator & Bounded CoreRuntime Execution Loop
• v0.9 Increment #6: Platform API & Web Control Plane Integration (0 innerHTML)
• v0.9 Increment #7: Production Hardening, Security Audit & Release Freeze (268 tests)

SIGUIENTE FASE OFICIAL
──────────────────────────────────────────────────────────────────────────
• v0.10 — Durable Persistence: Adaptadores de persistencia duradera desacoplados
          (PostgreSQL / SQLite) implementando OperationRepositoryPort y TaskRepositoryPort.

ROADMAP FUTURO (DISEÑADO / NO IMPLEMENTADO)
──────────────────────────────────────────────────────────────────────────
• Adaptadores de Modelos Cloud Reales (Vertex AI Gemini, Anthropic Claude).
• Herramientas de Sandbox de Código Aislado.
• Soporte para AbortSignal Asincrónico en Vuelo (OAD-001).
• Integración nativa con plataformas satélites de e-commerce (retail y ERPs).
```

---

# Glosario de Términos Arquitectónicos

* **Agent (Agente):** Agregado declarativo de dominio que encapsula la identidad, las instrucciones de comportamiento, la vinculación a un modelo de IA, la lista blanca de herramientas autorizadas y el ámbito de memoria restringido.
* **AutonomousOperation (Operación Autónoma):** Entidad supervisora que coordina la consecución de un objetivo multi-paso acotado por un presupuesto estricto.
* **AutonomyBudget (Presupuesto de Autonomía):** Value Object inmutable que impone los límites máximos contractuales de iteraciones (`maxSteps`), tiempo (`maxDurationMs`) y llamadas a herramientas (`maxToolCalls`).
* **CoreRuntime:** Motor central y exclusivo de ejecución de tareas atómicas de la plataforma.
* **Decision:** Objeto de dominio discreto que representa la determinación tomada para el siguiente paso (`EXECUTE_STEP`, `COMPLETE`, `STOP`, `FAIL`).
* **Fail-Closed:** Principio de diseño de seguridad según el cual cualquier fallo en la evaluación, error de sistema o veredicto `DENY` resulta en el bloqueo y terminación inmediata de la operación.
* **Observation:** Value Object serializable e inmutable que registra el resultado técnico y los recursos consumidos tras la ejecución de un paso en `CoreRuntime`.
* **TraceId:** Identificador único de correlación transversal que acompaña a todos los eventos, tareas y observaciones a lo largo de su ciclo de vida.
* **Zero Runtime Dependencies:** Característica del sistema por la cual el código de ejecución en producción no requiere ninguna librería externa instalada en `node_modules`, ejecutándose exclusivamente sobre las APIs estándar de Node.js.

# Manual de Arquitectura de AI Operating Platform
## Topología Hexagonal Canónica, Capas y Reglas de Dependencia (v1.1.0)

Este documento define de forma normativa las capas de software, puertos, adaptadores y reglas de dirección de dependencias que rigen la **AI Operating Platform**.

---

## 1. Topología Hexagonal (Ports & Adapters)

La arquitectura del sistema sigue estrictamente el patrón de **Arquitectura Hexagonal (Puertos y Adaptadores)** organizado concéntricamente:

```text
  ┌────────────────────────────────────────────────────────────────────────┐
  │ 5. INFRAESTRUCTURA & ADAPTADORES CONCRETOS                             │
  │    (SQLite WAL, Model Adapters, HTTP Server, Hardware/Printers)         │
  │  ┌──────────────────────────────────────────────────────────────────┐  │
  │  │ 4. PLATAFORMA & SERVICIOS DE PRODUCTO                            │  │
  │  │    (Platform API, Web SPA Control Plane, Auth Interceptors)      │  │
  │  │  ┌────────────────────────────────────────────────────────────┐  │  │
  │  │  │ 3. APLICACIÓN & CASOS DE USO                               │  │  │
  │  │  │    (AutonomousOrchestrator, LLMPlanner, AgentService)      │  │  │
  │  │  │  ┌──────────────────────────────────────────────────────┐  │  │  │
  │  │  │  │ 2. DOMINIO PURO & MÁQUINA DE ESTADOS                 │  │  │  │
  │  │  │  │    (CoreRuntime, Task, Execution, Agent, Operation)  │  │  │  │
  │  │  │  │  ┌────────────────────────────────────────────────┐ │  │  │  │
  │  │  │  │  │ 1. PUERTOS ABSTRACTOS & CONTRATOS INMUTABLES   │ │  │  │  │
  │  │  │  │  │    (TaskRepositoryPort, ModelGateway, Policy)  │ │  │  │  │
  │  │  │  │  └────────────────────────────────────────────────┘ │  │  │  │
  │  │  │  └──────────────────────────────────────────────────────┘  │  │  │
  │  │  └────────────────────────────────────────────────────────────┘  │  │
  │  └──────────────────────────────────────────────────────────────────┘  │
  └────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Dirección de Dependencias Infranqueable

### La Regla de Dependencia:
> **Las dependencias de código solo pueden apuntar hacia adentro.**
> Ninguna capa interna puede importar tipos, clases o funciones de una capa externa.

```text
[Infraestructura] ──► [Plataforma] ──► [Aplicación] ──► [Dominio]
```

### Prohibiciones Explícitas en el Repositorio:
1. **El Dominio (`src/domain/`) NUNCA debe importar:**
   * SQL, SQLite, archivos de disco ni la librería `node:sqlite`.
   * Protocolos de red, Express, Fastify ni `node:http`.
   * SDKs propietarios de proveedores (OpenAI, Anthropic, Google).
2. **La Aplicación (`src/application/`) NUNCA debe importar:**
   * Adaptadores concretos de base de datos o hardware.
   * La interfaz de usuario ni elementos del navegador.
3. **El Motor Central (`CoreEngine`) NUNCA debe importar:**
   * Lógica de negocios de aplicaciones externas (e.g. catálogos de calzado o repuestos de vehículos).
4. **Los Dispositivos de Negocio (`Business Devices`) NUNCA deben:**
   * Modificar el estado del runtime directamente; solo interactúan mediante el spooler de eventos durables.

---

## 3. Especificación Detallada de Capas

### Capa 1: Dominio Puro (`src/domain/`)
* **Propósito:** Alojar la lógica central, entidades inmutables y reglas de negocio puras.
* **Módulos:**
  * `execution/`: Agregados `Task` y `Execution`, con máquina de estados finita y rehidratación formal (`Task.rehydrate`).
  * `agents/`: Agregado `Agent`, validación de identificadores, instructions inmutables y control OCC.
  * `organization/`: Agregado `Organization`, entidades `Area`, `Team`, y `AgentMembership` con roles operativos (`LEAD`, `SPECIALIST`, `OPERATOR`, `REVIEWER`) y ciclo de vida soft (ADR 0027).
  * `autonomous/`: Agregado `AutonomousOperation`, presupuestos `AutonomyBudget` y evaluador determinista de decisiones.
  * `runtime/`: `CoreRuntime`, ejecutor síncrono determinista que procesa transiciones legales.
  * `security/`: `SecurityContext`, contratos de autorización y excepciones `PolicyViolationError`.

### Capa 2: Aplicación (`src/application/`)
* **Propósito:** Orquestar flujos de trabajo, coordinar casos de uso y enlazar dominios.
* **Módulos:**
  * `llm-planner.ts`: Planificador que construye y valida grafos DAG no cíclicos.
  * `autonomous-orchestrator.ts`: Bucle de ejecución acotado que evalúa presupuestos en cada paso.
  * `multi-agent-coordinator.ts`: Orquestador jerárquico de subagentes con control de contención.
  * `agent-service.ts`: Casos de uso para registro, activación e inspección de agentes.
  * `organization/organization-service.ts`: Casos de uso para gestión de organizaciones, áreas, equipos, cálculo de jerarquía y membresía de agentes.

### Capa 3: Plataforma (`src/platform/`)
* **Propósito:** Exponer las capacidades operacionales hacia consumidores externos.
* **Módulos:**
  * `api/http-router.ts`: Enrutador HTTP nativo en `node:http` con validación perimetral, endpoints `/api/v1/organizations/*` y compresión.
  * `api/platform-service.ts`: Fachada que media entre la capa HTTP y los servicios de aplicación con DTO mappers.
  * `web/`: Plano de control SPA en HTML5 y Vanilla JS (cero dependencias, cero `innerHTML`), con vista interactiva de organizaciones.

### Capa 4: Infraestructura (`src/infrastructure/`)
* **Propósito:** Adaptadores concretos hacia recursos físicos, periféricos y sistemas externos.
* **Módulos:**
  * `persistence/sqlite/`: Base de datos SQLite nativa Node.js 22 en modo WAL (`SqliteDatabase`), incluyendo `SqliteOrganizationRepository` con índices compuestos y OCC.
  * `models/`: Conectores nativos a OpenAI, Anthropic, Ollama, Gemini y Stub determinista.
  * `tools/`: Registro dinámico de herramientas con sandboxing y validación de esquemas Zod.
  * `hardware/`: Adaptadores para impresoras comerciales (Brother DCP-1600 series en `USB001`).

### Capa 5: SDK & Aplicaciones Clientes (`src/sdk/`, `examples/`)
* **Propósito:** Consumidores externos que se benefician de la inteligencia gobernada.
* **Módulos:**
  * `client-sdk.ts`: SDK tipado en TypeScript.
  * `Tentaciones AI Commerce`: E-commerce de moda y calzado con probador 3D/AR.
  * `Vehicle Parts Platform`: E-commerce de repuestos de vehículos y diagnóstico de fallas.

---

## 4. Reconciliación ante Reinicios (Crash Recovery)

La plataforma implementa un protocolo determinista de recuperación ante caídas del servidor (ADR 0020):
1. Durante el arranque (`bootstrap()`), `RestartRecoveryService` consulta la base de datos SQLite.
2. Cualquier tarea que quedó en estado `RUNNING` cuando el proceso se detuvo se reconcilia automáticamente a `FAILED` con el código de error canónico `CRASH_RECOVERY_RECONCILED`.
3. Se emite el evento de dominio correspondiente y el sistema inicia limpio con RTO < 1 segundo.

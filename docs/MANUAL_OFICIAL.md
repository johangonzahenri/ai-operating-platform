# Manual Oficial de la AI Operating Platform
## Guía de Arquitectura Canónica, Operación y Referencia Técnica Integral (v1.1.0)

> **Principio Fundamental:**
> *"Infraestructura operacional de IA sobre la cual se construyen, gobiernan y observan aplicaciones, automatizaciones y dispositivos empresariales."*

---

## Control de Documento y Estado Oficial

| Parámetro | Valor Canónico |
| :--- | :--- |
| **Plataforma** | AI Operating Platform |
| **Versión Actual** | 1.1.0 Enterprise Baseline |
| **Idioma Oficial** | Español (Latinoamérica) / es-419 |
| **Idioma Opcional Web** | Inglés / en |
| **Línea Base de Pruebas** | 966 PASS / 0 FAIL (100% Determinista) |
| **Libro Oficial Canónico** | [LIBRO_OFICIAL_AI_OPERATING_PLATFORM.md](LIBRO_OFICIAL_AI_OPERATING_PLATFORM.md) |
| **Fuente de Verdad** | [docs/SOURCE_OF_TRUTH.md](SOURCE_OF_TRUTH.md) |
| **Arquitectura de Base** | Hexagonal (Ports & Adapters) en TypeScript / Node.js nativo |
| **Persistencia Primaria** | SQLite WAL Nativo (`DatabaseSync` de Node.js 22) + OCC |
| **Políticas de Seguridad** | Default-Deny Fail-Closed (RBAC + Application Context) |

---

## Índice General

1. [1. Introducción & Executive Overview (Visión General Ejecutiva)](#1-introducción--executive-overview-visión-general-ejecutiva)
2. [2. Qué es AI Operating Platform](#2-qué-es-ai-operating-platform)
3. [3. Arquitectura Canónica & Architecture Principles](#3-arquitectura-canónica--architecture-principles)
4. [4. Core Engine](#4-core-engine)
5. [5. Platform Product](#5-platform-product)
6. [6. Platform API](#6-platform-api)
7. [7. AI Runtime](#7-ai-runtime)
8. [8. Agents (Agentes de Primera Clase)](#8-agents-agentes-de-primera-clase)
9. [9. Planner & LLM Planner](#9-planner--llm-planner)
10. [10. Model Gateway](#10-model-gateway)
11. [11. Tool Layer & Dynamic Registry](#11-tool-layer--dynamic-registry)
12. [12. Memory Layer](#12-memory-layer)
13. [13. Security & Governance (RBAC)](#13-security--governance-rbac)
14. [14. Observability & OpenTelemetry](#14-observability--opentelemetry)
15. [15. Durable Events & Audit Infrastructure](#15-durable-events--audit-infrastructure)
16. [16. Multi-Agent Coordination](#16-multi-agent-coordination)
17. [17. Developer Platform](#17-developer-platform)
18. [18. Application Factory & Tentaciones AI Commerce](#18-application-factory--tentaciones-ai-commerce)
19. [19. Application Ecosystem](#19-application-ecosystem)
20. [20. Enterprise Control Plane & AR / 3D Virtual Fitting](#20-enterprise-control-plane--ar--3d-virtual-fitting)
21. [21. Business Devices & End-to-End Journey](#21-business-devices--end-to-end-journey)
22. [22. Printing & Brother Adapter](#22-printing--brother-adapter)
23. [23. Platform SDK](#23-platform-sdk)
24. [24. Applications (Aplicaciones Gobernadas)](#24-applications-aplicaciones-gobernadas)
25. [25. Tentaciones AI Commerce Deep Dive](#25-tentaciones-ai-commerce-deep-dive)
26. [26. Vehicle Parts & Diagnostics Platform](#26-vehicle-parts--diagnostics-platform)
27. [27. Automation & n8n Workflows](#27-automation--n8n-workflows)
28. [28. Configuration & Environment](#28-configuration--environment)
29. [29. Testing & Verification Suites](#29-testing--verification-suites)
30. [30. Diagnostics & Runtime Truth](#30-diagnostics--runtime-truth)
31. [31. Production Readiness](#31-production-readiness)
32. [32. Roadmap Oficial](#32-roadmap-oficial)
33. [33. Limitaciones Conocidas](#33-limitaciones-conocidas)
34. [34. Glosario Oficial](#34-glosario-oficial)

---

## 1. Introducción & Executive Overview (Visión General Ejecutiva)

### 1. Executive Overview
Imagina que quieres que un asistente de Inteligencia Artificial trabaje en tu tienda online o en tu empresa. 
Si dejas que un modelo de lenguaje (como GPT o Claude) hable directamente con la base de datos o con la tarjeta de crédito de un cliente, **es muy peligroso**: puede alucinar descuentos, inventar stock que no existe, o filtrar contraseñas.

Para solucionar esto construimos la **AI Operating Platform**.

Funciona exactamente igual que el **Sistema Operativo de tu computadora** (como Windows o macOS):
* El Sistema Operativo no es el programa que usas para dibujar o comprar; es la capa intermedia que gestiona la memoria, la seguridad y los permisos para que los programas funcionen sin romper la máquina.
* Nuestra plataforma hace lo mismo para la IA: gobierna a los **Agentes** (los trabajadores inteligentes), regula los **Modelos** (los cerebros), controla las **Herramientas** (las manos que ejecutan acciones) y protege los **Datos** con una política de seguridad estricta llamada *Default-Deny* (prohibido todo por defecto hasta que un humano o una política explícita lo autorice).

### Cómo estudiar este proyecto
Para comprender la plataforma con facilidad:
1. **Comienza por la Visión General Ejecutiva** para entender por qué la IA necesita un sistema operativo de gobernanza.
2. **Revisa la Regla de Oro de la Arquitectura** para entender la separación estricta entre motor, plataforma y aplicaciones.
3. **Explora el Plano de Control Web** ejecutando `INICIAR_PLATAFORMA.bat` en Windows o `npm start` para interactuar con la consola visual bilingüe.
4. **Sigue el caso de estudio de Tentaciones** para ver un flujo comercial completo con probador virtual 3D y checkout seguro.

---

## 2. Qué es AI Operating Platform

La **AI Operating Platform** es una plataforma operacional de software diseñada para coordinar múltiples agentes de IA especializados, modelos de lenguaje heterogéneos y herramientas seguras, garantizando:

* **Determinismo Operacional:** Las decisiones de negocio, los estados de tareas y el inventario son gobernados por reglas de software estables, no por respuestas probabilísticas de un LLM.
* **Inmutabilidad y Auditoría Forense:** Cada invocación, decisión de política, resultado de herramienta y cambio de estado se registra de forma cronológica inalterable en un almacén de eventos durables (`EventStore`).
* **Aislamiento Multi-Inquilino (Multi-Tenant):** Las cuotas de cómputo, presupuestos de tokens y almacenamiento se encuentran particionados estrictamente por `tenantId`.
* **Zero Overhead en Producción:** El motor principal opera sin dependencias de frameworks externos pesados (`npm ls --omit=dev` se encuentra vacío de librerías en tiempo de ejecución), garantizando arranques en milisegundos y mínima superficie de ataque.

---

## 3. Arquitectura Canónica & Architecture Principles

### 3. Architecture Principles (Principios de Arquitectura)

### La Regla de Oro de la Arquitectura
$$	ext{CORE ENGINE} 
eq 	ext{PLATFORM PRODUCT} 
eq 	ext{APPLICATIONS}$$
`CORE ENGINE != PLATFORM PRODUCT != APPLICATIONS`
`PLATFORM PRODUCT != APPLICATION`
`APPLICATION != EXTERNAL SERVICE`
`DEVICE != CORE ENGINE`

1. **El Motor Central (Core Engine):** Es puro código de lógica y seguridad. No sabe qué es una zapatilla de correr ni qué es un repuesto de auto. Solo sabe recibir tareas, coordinar agentes, llamar herramientas y guardar un registro histórico inalterable.
2. **La Consola Web (Platform Product):** Es el tablero de control visual para los ingenieros y operadores. Muestra qué está haciendo la IA en tiempo real sin usar código peligroso en el navegador (100% puro en el DOM, cero `innerHTML`).
3. **Las Aplicaciones Externas (Applications):** Son los negocios reales (como la tienda de moda **Tentaciones AI Commerce**). Ellas son las dueñas de sus precios, sus catálogos y sus carritos de compra. Solo consumen la plataforma mediante una API segura.

### Diagrama Conceptual Canónico

```text
                         AI OPERATING PLATFORM
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        │                         │                         │
   CORE ENGINE             PLATFORM PRODUCT          APPLICATIONS
        │                         │                         │
        │              ┌──────────┼──────────┐              │
        │              │          │          │              │
        │         Developer    Control      API              │
        │         Platform     Plane      Gateway            │
        │              │          │          │              │
        └──────────────┼──────────┼──────────┼──────────────┘
                       │          │          │
                  Security   Observability  Automation
                       │          │          │
                       └──────────┼──────────┘
                                  │
                             AI RUNTIME
                                  │
                   ┌──────────────┼──────────────┐
                   │              │              │
                 Agents         Models          Tools
                   │              │              │
                   └──────────────┼──────────────┘
                                  │
                           Durable Events
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                   │
        Applications         Automations       Business Devices
              │                   │                   │
        Tentaciones              n8n              Brother
        Vehicle Parts                              Printer
```

---

## 4. Core Engine

* **Estado:** IMPLEMENTADO
* **Ubicación:** `src/domain/`
* **Contratos:** [`docs/decisions/0004-core-runtime-execution-model.md`](decisions/0004-core-runtime-execution-model.md)

El `CoreRuntime` es el único ejecutor autorizado del sistema. Ningún modelo, controlador HTTP ni agente puede ejecutar una tarea directamente; todas las invocaciones deben someterse al ciclo de vida formal:

```text
[SUBMITTED] ──► [RUNNING] ──┬──► [COMPLETED]
                            ├──► [FAILED]
                            └──► [CANCELLED]
```

### Invariantes del Core Engine:
* **Inmutabilidad:** Cada entidad (`Task`, `Execution`, `ExecutionContext`) se congela defensivamente (`Object.freeze`) para evitar mutaciones de estado concurrentes.
* **OCC (Optimistic Concurrency Control):** Cada actualización incrementa monótonamente un contador de versión; colisiones concurrentes son rechazadas de inmediato con `OptimisticConcurrencyError`.
* **Rehidratación Formal:** La reconstrucción de entidades desde la base de datos se realiza mediante fábricas estáticas dedicadas (`Task.rehydrate`, `Execution.rehydrate`, `Agent.rehydrate`), eliminando por completo la reflexión (`Reflect.construct`).

---

## 5. Platform Product

* **Estado:** IMPLEMENTADO
* **Ubicación:** `src/platform/`
* **Referencia:** [`docs/PLATFORM_PRODUCT.md`](PLATFORM_PRODUCT.md)

El Producto Plataforma envuelve el motor central para ofrecer una solución operativa lista para uso empresarial:
* Composición manual en `src/interfaces/composition.ts` sin contenedores mágicos de inyección.
* Coordinación de servicios de aplicación (`AgentService`, `TenantService`, `PlatformService`, `AutonomousOperationService`).
* Gestión de configuración centralizada en `src/infrastructure/config/config.ts`.

---

## 6. Platform API

* **Estado:** IMPLEMENTADO
* **Ubicación:** `src/platform/api/`
* **Referencia:** [`docs/API_REFERENCE.md`](API_REFERENCE.md), [`docs/API_OPERATIONS.md`](API_OPERATIONS.md)

Servidor HTTP de alto rendimiento implementado exclusivamente sobre la librería estándar `node:http`:
* **Rutas canónicas:** `/api/v1/tasks`, `/api/v1/executions`, `/api/v1/agents`, `/api/v1/models`, `/api/v1/tools`, `/api/v1/operations`, `/api/v1/events`, `/api/v1/health`, `/api/v1/devices`.
* **Seguridad perimetral:** Límite estricto de carga útil de 1MB, mitigación de Path Traversal (`..` rechazado con HTTP 403), cabeceras CORS locales restrictivas y autenticación bearer/API-key.

---

## 7. AI Runtime

* **Estado:** IMPLEMENTADO
* **Ubicación:** `src/domain/runtime/`

El Runtime de Inteligencia Artificial coordina la interacción entre el plan generado, el agente activo, la llamada al modelo LLM y la ejecución de herramientas:
* Control de vueltas (*multi-turn loop*) con presupuesto de pasos máximo.
* Normalización de respuestas de modelos en un historial neutral de mensajes (`ModelMessage`).
* Sanitización y validación de parámetros de entrada antes de cualquier invocación técnica.

---

## 8. Agents (Agentes de Primera Clase)

* **Estado:** IMPLEMENTADO
* **Ubicación:** `src/domain/agents/`
* **Referencia:** [`docs/decisions/0011-agent-architecture.md`](decisions/0011-agent-architecture.md)

Los agentes son agregados de dominio con identidad formal:
* **Identidad:** `id` alfanumérico validado (`validateAgentId`).
* **Instrucciones:** `instructions` que delimitan el comportamiento y rol del agente.
* **Modelo Asociado:** Enlace explícito a un modelo registrado en la pasarela.
* **Lista Blanca de Herramientas:** Subconjunto inmutable de `toolIds` autorizados para el agente.
* **Ciclo de Vida:** Estados legales `ACTIVE` e `INACTIVE`.

---

## 9. Planner & LLM Planner

* **Estado:** IMPLEMENTADO
* **Ubicación:** `src/application/llm-planner.ts`
* **Referencia:** [`docs/LLM_PLANNER.md`](LLM_PLANNER.md)

Transforma un requerimiento en lenguaje natural en un Grafo Acíclico Dirigido (DAG) de pasos secuenciales y paralelizables:
* Validación contra ciclos infinitos y dependencias cruzadas.
* Prohibición absoluta de funciones ejecutables dentro de la estructura del plan (solo definiciones declarativas de paso, herramienta y entrada).
* Verificación previa de políticas antes de autorizar el plan.

---

## 10. Model Gateway

* **Estado:** IMPLEMENTADO
* **Ubicación:** `src/infrastructure/models/`
* **Referencia:** [`docs/MODEL_GATEWAY.md`](MODEL_GATEWAY.md)

Frontera neutral desacoplada de SDKs de terceros:
* **Proveedores Implementados:** `openai` (GPT-4o), `anthropic` (Claude 3.5 Sonnet), `ollama` (Llama 3 local) y `stub` (para pruebas deterministas).
* **Traducción de Protocolos:** Los esquemas de herramientas y las respuestas estructuradas se normalizan en la frontera del adaptador sin filtrar dependencias al dominio.
* **Resiliencia:** Timeout configurable y degradación ordenada ante caídas de red.

---

## 11. Tool Layer & Dynamic Registry

* **Estado:** IMPLEMENTADO
* **Ubicación:** `src/infrastructure/tools/`
* **Referencia:** [`docs/TOOL_REGISTRY.md`](TOOL_REGISTRY.md)

* **Principio de Aislamiento:** Cada herramienta es una capacidad registrada con esquema formal (Zod / JSON Schema).
* **Nivel de Riesgo:** Clasificación en tiers (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`). Las herramientas críticas requieren un token de aprobación explícito.
* **Sandbox y Timeout:** Invocaciones protegidas con límites de tiempo y mitigación contra Prototype Pollution.

---

## 12. Memory Layer

* **Estado:** PARCIAL / EN MEMORIA IMPLEMENTADO, PERSISTENTE DISEÑADO
* **Ubicación:** `src/domain/memory/`
* **Referencia:** [`docs/MEMORY_CONTRACT.md`](MEMORY_CONTRACT.md)

* **Implementado:** Aislamiento de contexto de tarea (`BoundedTaskContext`), adaptador en memoria `InMemoryMemoryGateway` con particionado por agente y tenant.
* **Diseñado / Futuro:** Almacenamiento vectorial persistente, compactación semántica y cuotas de retención por TTL en SQLite.

---

## 13. Security & Governance (RBAC)

* **Estado:** IMPLEMENTADO
* **Ubicación:** `src/domain/security/`
* **Referencia:** [`docs/SECURITY_ARCHITECTURE.md`](SECURITY_ARCHITECTURE.md), [`docs/AUTHORIZATION.md`](AUTHORIZATION.md)

* **Default-Deny:** Toda invocación no autorizada explícitamente resulta en rechazo inmediato (`PolicyViolationError`).
* **RBAC:** Roles formales (`Admin`, `Operator`, `Viewer`, `Agent`) con matriz de permisos granular.
* **Aislamiento Multi-Tenant:** Validación en cada capa de que el `tenantId` del token coincide con el recurso solicitado.

---

## 14. Observability & OpenTelemetry

* **Estado:** IMPLEMENTADO
* **Ubicación:** `src/infrastructure/observability/`
* **Referencia:** [`docs/OBSERVABILITY.md`](OBSERVABILITY.md)

* **Telemetría Estructurada:** Registro de logs en formato JSON uniforme con `traceId`, `aggregateId` y `occurredAt`.
* **OpenTelemetry Compatible:** Exportador de trazas distribuidas y métricas compatible con Prometheus, Grafana y Datadog.

---

## 15. Durable Events & Audit Infrastructure

* **Estado:** IMPLEMENTADO
* **Ubicación:** `src/infrastructure/persistence/sqlite/`
* **Referencia:** [`docs/decisions/0021-durable-events-and-audit-infrastructure.md`](decisions/0021-durable-events-and-audit-infrastructure.md)

* **EventStore Append-Only:** Persistencia de eventos de dominio en SQLite en modo WAL (`data/app.db`).
* **Secuencia Monótona:** Cada evento recibe un número de secuencia global e incremental.
* **Auditoría Forense:** Capacidad de consultar el historial exacto de decisiones tomadas por cualquier agente en cualquier instante del tiempo.

---

## 16. Multi-Agent Coordination

* **Estado:** IMPLEMENTADO
* **Ubicación:** `src/application/multi-agent-coordinator.ts`
* **Referencia:** [`docs/MULTI_AGENT_RUNTIME.md`](MULTI_AGENT_RUNTIME.md)

* **Orquestación Acotada:** Coordinación jerárquica de agentes con presupuestos globales y timeouts estrictos.
* **Paso de Mensajes:** Protocolo tipado inter-agente sin memoria mutable compartida.
* **Recuperación:** Cancelación en cascada y liberación segura de recursos ante fallos de agentes secundarios.

---

## 17. Developer Platform

* **Estado:** IMPLEMENTADO
* **Ubicación:** `src/sdk/`
* **Referencia:** [`docs/DEVELOPER_PLATFORM.md`](DEVELOPER_PLATFORM.md)

* **SDK Oficial:** Librería cliente en TypeScript para integración de aplicaciones externas.
* **Contratos Tipados:** Tipado estricto para despacho de tareas, consultas de eventos y subscripciones en tiempo real.

---

## 18. Application Factory & Tentaciones AI Commerce

### 18. Tentaciones AI Commerce
* **Estado:** IMPLEMENTADO
* **Ubicación:** `src/factory/` y `src/infrastructure/adapters/tentaciones-adapter.ts`
* **Referencia:** [`docs/APPLICATION_FACTORY_2.md`](APPLICATION_FACTORY_2.md), [`docs/TENTACIONES_PLATFORM_INTEGRATION.md`](TENTACIONES_PLATFORM_INTEGRATION.md)

La **Application Factory** permite generar micro-frontends y backends de agentes gobernados a partir de manifiestos declarativos. La primera gran aplicación generada y conectada bajo este modelo es **18. Tentaciones AI Commerce**, la cual integra búsqueda asistida por IA, catálogo de calzado y carrito multi-paso.

---

## 19. Application Ecosystem

* **Estado:** IMPLEMENTADO
* **Ubicación:** `src/marketplace/`
* **Referencia:** [`docs/APPLICATION_ECOSYSTEM.md`](APPLICATION_ECOSYSTEM.md)

* **Directorio de Aplicaciones:** Registro centralizado de aplicaciones empresariales verificadas.
* **Trust Engine:** Niveles de verificación (`VERIFIED`, `COMMUNITY`, `EXPERIMENTAL`) con firma criptográfica.

---

## 20. Enterprise Control Plane & AR / 3D Virtual Fitting

### 20. AR / 3D Virtual Fitting
* **Estado:** IMPLEMENTADO
* **Ubicación:** `src/platform/web/` y `public/ar-viewer.html`
* **Referencia:** [`docs/CONTROL_PLANE.md`](CONTROL_PLANE.md), [`docs/AR_VIRTUAL_FITTING.md`](AR_VIRTUAL_FITTING.md)

El **Enterprise Control Plane** proporciona supervisión en tiempo real para todos los subsistemas. Dentro de las capacidades de vanguardia integradas se encuentra **20. AR / 3D Virtual Fitting** (Probador Virtual 3D y Realidad Aumentada), que permite renderizar modelos 3D GLTF de calzado en navegadores móviles y desktop mediante WebXR con validación criptográfica de integridad SHA-256.

---

## 21. Business Devices & End-to-End Journey

### 21. End-to-End Journey
* **Estado:** IMPLEMENTADO
* **Ubicación:** `src/infrastructure/hardware/` y `tests/e2e/golden-journey.test.ts`
* **Referencia:** [`docs/BUSINESS_DEVICES.md`](BUSINESS_DEVICES.md)

La integración de **Business Devices** (dispositivos físicos como impresoras POS) culmina la prueba de oro del sistema: **21. End-to-End Journey**. En esta travesía completa de extremo a extremo, un usuario solicita un calzado mediante lenguaje natural, se valida el stock, se prueba virtualmente en 3D, se aprueba el checkout gobernado y se emite la orden de impresión física de comprobante en la impresora local.

---

## 22. Printing & Brother Adapter

* **Estado:** IMPLEMENTADO / VERIFICADO LOCALMENTE
* **Ubicación:** `src/infrastructure/hardware/brother-printer-adapter.ts`
* **Referencia:** [`docs/PRINT_OPERATIONS.md`](PRINT_OPERATIONS.md)

* **Hardware Detectado:** Impresora multifunción **Brother DCP-1600 series**.
* **Puerto de Comunicación:** `USB001`.
* **Estado Actual Reportado:** Fuera de línea / Trabajo desconectado (*WorkOffline*).
* **Capacidades Declaradas:**
  * `device.print`: SOPORTADO
  * `device.health`: SOPORTADO
  * `device.status`: SOPORTADO
  * `device.consumables`: NO SOPORTADO

---

## 23. Platform SDK

* **Estado:** IMPLEMENTADO
* **Ubicación:** `src/sdk/client-sdk.ts`
* **Referencia:** [`docs/PLATFORM_CLIENT.md`](PLATFORM_CLIENT.md)

```typescript
const client = new PlatformClient({ baseUrl: "http://127.0.0.1:3000", apiKey: "sk_test_..." });
const task = await client.submitTask({ agentId: "support-agent", input: { query: "Estado de orden" } });
const result = await client.awaitExecution(task.executionId);
```

---

## 24. Applications (Aplicaciones Gobernadas)

* **Estado:** IMPLEMENTADO
* **Referencia:** [`docs/APPLICATION_INTEGRATION.md`](APPLICATION_INTEGRATION.md)

Las aplicaciones son sistemas de software independientes que utilizan la plataforma para incorporar inteligencia artificial gobernada:
* Mantienen sus propias bases de datos y lógica comercial.
* No importan código del dominio interno de la plataforma.
* Se autentican mediante llaves de API únicas y tokens de contexto.

---

## 25. Tentaciones AI Commerce Deep Dive

* **Estado:** IMPLEMENTADO
* **Referencia:** [`docs/case-study-tentaciones.md`](case-study-tentaciones.md)

Detalles del motor de comercio electrónico de Tentaciones: catálogo, cálculo de tallas inteligentes y flujo de pago con Webpay Demo.

---

## 26. Vehicle Parts & Diagnostics Platform

* **Estado:** IMPLEMENTADO
* **Ubicación:** `examples/vehicle-parts-app/`
* **Referencia:** [`docs/VEHICLE_PARTS_REFERENCE.md`](VEHICLE_PARTS_REFERENCE.md)

Aplicación de referencia para e-commerce automotriz con motor de compatibilidad determinista de autopartes.

---

## 27. Automation & n8n Workflows

* **Estado:** IMPLEMENTADO
* **Ubicación:** `src/infrastructure/integrations/n8n-connector.ts`
* **Referencia:** [`docs/AUTOMATION_INTEGRATION.md`](AUTOMATION_INTEGRATION.md)

Conector bidireccional para flujos de automatización empresarial en n8n.

---

## 28. Configuration & Environment

* **Estado:** IMPLEMENTADO
* **Ubicación:** `src/infrastructure/config/config.ts`

Variables de entorno: `PORT`, `PERSISTENCE_DRIVER`, `SQLITE_DB_PATH`, `MODEL_PROVIDER`, `LOG_LEVEL`.

---

## 29. Testing & Verification Suites

* **Estado:** IMPLEMENTADO
* **Resultado:** 955 PASS / 0 FAIL (100% Determinista).

---

## 30. Diagnostics & Runtime Truth

* **Estado:** IMPLEMENTADO
* **Ubicación:** `src/platform/api/routes/diagnostics.ts`
* **Referencia:** [`docs/PLATFORM_TRUTH_MATRIX.md`](PLATFORM_TRUTH_MATRIX.md)

Verificación de salud y reconciliación de estado tras caídas del sistema (ADR 0020).

---

## 31. Production Readiness

* **Estado:** VERIFICADO PARA PRODUCCIÓN LOCAL & CONTENEDOR
* **Referencia:** [`docs/PRODUCTION_READINESS.md`](PRODUCTION_READINESS.md)

---

## 32. Roadmap Oficial

* **Referencia:** [`docs/ROADMAP_OFICIAL.md`](ROADMAP_OFICIAL.md)

Hitos completados (Fases 1 a 53), hito en desarrollo (Fase 54) y planificación futura.

---

## 33. Limitaciones Conocidas

* **Referencia:** [`docs/KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md)

Limitaciones reales documentadas de almacenamiento local, pre-emption inter-paso y controladores de impresión.

---

## 34. Glosario Oficial

* **Referencia:** [`docs/GLOSARIO.md`](GLOSARIO.md)

Definiciones normativas de todos los conceptos técnicos y de código de la plataforma.

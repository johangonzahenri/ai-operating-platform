# Glosario Oficial de AI Operating Platform
## Términos Técnicos, Conceptos Arquitectónicos y Nombres en Código (v1.1.0)

Este glosario define de forma normativa todos los conceptos y términos utilizados en la arquitectura, código y documentación de la **AI Operating Platform**.

---

### AI Operating Platform (Plataforma Operacional de IA)
* **Definición:** Plataforma de software diseñada para orquestar, gobernar y observar múltiples agentes de IA, modelos LLM y herramientas operacionales bajo principios de determinismo y seguridad.
* **Función:** Actuar como capa intermedia entre modelos probabilísticos de inteligencia artificial y sistemas deterministas del mundo exterior.
* **Relación:** Coordina al Core Engine, Platform Product y Applications.
* **Nombre en Código:** `AIOperatingPlatform`, `PlatformService`.

---

### Core Engine (Motor Principal)
* **Definición:** Núcleo de dominio puro que implementa la máquina de estados finita de tareas y ejecuciones sin dependencias tecnológicas externas.
* **Función:** Garantizar el determinismo, la inmutabilidad de estados y la validación de transiciones de ciclo de vida.
* **Relación:** Es envuelto por el Platform Product y consumido a través de puertos formales.
* **Nombre en Código:** `CoreRuntime`, `src/domain/`.

---

### Platform Product (Producto Plataforma)
* **Definición:** Capa de servicios que expone el motor de IA hacia el exterior mediante APIs REST y consolas operacionales.
* **Función:** Proveer enrutamiento HTTP, autenticación perimetral, internacionalización y el plano de control web.
* **Relación:** Media entre clientes externos (SDK/SPA) y el Core Engine.
* **Nombre en Código:** `src/platform/`.

---

### Application (Aplicación de Negocio)
* **Definición:** Sistema informático externo que implementa casos de uso de negocio reales (ej. e-commerce Tentaciones).
* **Función:** Consumir inteligencia artificial mediante el Platform SDK para asistir a usuarios humanos o procesos.
* **Relación:** Opera de forma desacoplada; consume la Platform API mediante credenciales autenticadas.
* **Nombre en Código:** `ApplicationRecord`, `ApplicationManifest`.

---

### Agent (Agente de Primera Clase)
* **Definición:** Agregado de dominio que modela un trabajador de IA con identidad única, rol, modelo asignado y lista blanca de herramientas.
* **Función:** Recibir tareas operacionales, razonar dentro de sus límites y emitir invocaciones a herramientas permitidas.
* **Relación:** Asociado a un `ModelGateway` y administrado por `AgentRegistry`.
* **Nombre en Código:** `Agent` (`src/domain/agents/agent.ts`).

---

### Planner (Planificador / LLM Planner)
* **Definición:** Componente que descompone un objetivo de alto nivel en un Grafo Acíclico Dirigido (DAG) de pasos secuenciales y paralelos.
* **Función:** Construir planes de ejecución estructurados y validar que no contengan dependencias circulares ni código malicioso.
* **Relación:** Asiste al `AutonomousOrchestrator` durante el ciclo de vida de operaciones autónomas.
* **Nombre en Código:** `LLMPlanner`, `Plan`, `PlanStep`.

---

### Model (Modelo de Lenguaje / Inferencia)
* **Definición:** Motor de inteligencia artificial externo o local capaz de generar texto o llamadas estructuradas a funciones.
* **Función:** Procesar prompts normalizados y retornar decisiones o respuestas en lenguaje natural.
* **Relación:** Desacoplado del dominio mediante el puerto `ModelGateway`.
* **Nombre en Código:** `ModelGateway`, `ModelRequest`, `ModelResponse`.

---

### Tool (Herramienta / Capacidad Ejecutable)
* **Definición:** Función de software parametrizada que ejecuta una acción concreta (consultar clima, calcular impuestos, consultar base de datos).
* **Función:** Permitir que los agentes interactúen con el mundo real bajo estrictos esquemas de validación de entrada.
* **Relación:** Registrada en `ToolRegistry` y gobernada por `PolicyGateway`.
* **Nombre en Código:** `ToolCapability`, `ToolDefinition`.

---

### Memory (Capa de Memoria)
* **Definición:** Subsistema de almacenamiento de contexto conversacional y datos de trabajo acotados a corto y largo plazo.
* **Función:** Retener observaciones y hechos relevantes entre turnos de ejecución sin violar los límites multi-tenant.
* **Relación:** Aislada por `tenantId` y regulada mediante `MemoryGateway`.
* **Nombre en Código:** `MemoryGateway`, `BoundedTaskContext`.

---

### Task (Tarea de Dominio)
* **Definición:** Entidad que representa la solicitud formal de una operación a ser procesada por un agente.
* **Función:** Registrar el requerimiento de entrada, la traza de correlación y la máquina de estados (`SUBMITTED`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`).
* **Relación:** Ejecutada por el `CoreRuntime` y asociada a una o más `Execution`.
* **Nombre en Código:** `Task` (`src/domain/execution/task.ts`).

---

### Execution (Ejecución de Tarea)
* **Definición:** Registro inmutable del intento de procesar una tarea específica en el tiempo.
* **Función:** Almacenar timestamps de inicio/fin, resultados, métricas de consumo y posibles excepciones técnicas.
* **Relación:** Hija de una `Task`, emitida como resultado determinista del `CoreRuntime`.
* **Nombre en Código:** `Execution` (`src/domain/execution/execution.ts`).

---

### Event (Evento de Dominio)
* **Definición:** Registro inmutable de un hecho significativo ocurrido en el sistema (`context.created`, `task.started`, `policy.allowed`).
* **Función:** Facilitar la trazabilidad forense, la reactividad de la interfaz y la reconstrucción histórica de estados.
* **Relación:** Persistido en el `DurableEventStore` (SQLite WAL) y transmitido vía SSE.
* **Nombre en Código:** `DomainEvent`, `DurableEventRecord`.

---

### Tenant (Inquilino Lógico / Organización)
* **Definición:** Frontera lógica de partición multi-inquilino que agrupa aplicaciones, agentes, datos y presupuestos.
* **Función:** Garantizar que ninguna organización pueda acceder a datos o consumir cuotas de otra organización.
* **Relación:** Cada petición y registro en base de datos valida el `tenantId`.
* **Nombre en Código:** `Tenant`, `tenantId`.

---

### Principal (Identidad de Invocación)
* **Definición:** Entidad autenticada (usuario, servicio o aplicación) que realiza una solicitud a la plataforma.
* **Función:** Portar roles, identificadores y contexto de seguridad verificados.
* **Relación:** Evaluada por `AuthorizationService` para aplicar controles RBAC.
* **Nombre en Código:** `SecurityContext`, `Principal`.

---

### Capability (Capacidad Declarada)
* **Definición:** Característica técnica o funcional expuesta por la plataforma o un dispositivo de hardware.
* **Función:** Permitir que los consumidores consulten qué operaciones están disponibles y soportadas formalmente.
* **Relación:** Las herramientas y los dispositivos declaran sus capacidades como listas inmutables.
* **Nombre en Código:** `Capability`, `declaredCapabilities`.

---

### Policy (Política de Gobernanza)
* **Definición:** Regla declarativa que decide si una operación, invocación de herramienta o consumo de modelo es permitida.
* **Función:** Implementar el principio *Default-Deny* (todo denegado salvo que exista una regla positiva explícita).
* **Relación:** Evaluada por `PolicyGateway` antes de que el `CoreRuntime` ejecute cualquier acción.
* **Nombre en Código:** `PolicyGateway`, `PolicyDecision`.

---

### Control Plane (Plano de Control)
* **Definición:** Consola operacional y endpoints administrativos que permiten gobernar y monitorear la plataforma en tiempo real.
* **Función:** Ofrecer dashboards visuales, exploradores de eventos, métricas de telemetría y configuración de flota.
* **Relación:** Implementado en `src/platform/web` (SPA) y servido por `http-router.ts`.
* **Nombre en Código:** `ControlPlane`, `src/platform/web/app.js`.

---

### Developer Platform (Plataforma para Desarrolladores)
* **Definición:** Conjunto de herramientas, especificaciones y SDKs destinados a ingenieros que construyen aplicaciones sobre la plataforma.
* **Función:** Reducir la fricción de integración y garantizar que los clientes respeten los contratos de tipos y seguridad.
* **Relación:** Aloja el SDK de TypeScript y la documentación de referencia de APIs.
* **Nombre en Código:** `src/sdk/`.

---

### Application Factory (Fábrica de Aplicaciones)
* **Definición:** Motor generativo que ensambla aplicaciones de software gobernadas a partir de manifiestos declarativos y plantillas validadas.
* **Función:** Acelerar la creación de micro-frontends y backends de agentes cumpliendo automáticamente con los contratos del sistema.
* **Relación:** Consume capacidades de la plataforma y produce aplicaciones registradas en el ecosistema.
* **Nombre en Código:** `ApplicationFactory`, `src/factory/`.

---

### Application Ecosystem (Ecosistema de Aplicaciones)
* **Definición:** Catálogo empresarial de aplicaciones, plugins y extensiones verificadas que operan sobre la plataforma.
* **Función:** Proveer descubrimiento de soluciones de negocio y gobernanza de confianza entre componentes heterogéneos.
* **Relación:** Integra a Tentaciones, Repuestos de Vehículos y extensiones de la comunidad.
* **Nombre en Código:** `ApplicationEcosystem`, `src/marketplace/`.

---

### Trust (Nivel de Confianza y Verificación)
* **Definición:** Mecanismo criptográfico y de auditoría que clasifica la integridad y procedencia de una aplicación o herramienta.
* **Función:** Asignar tiers (`VERIFIED`, `COMMUNITY`, `EXPERIMENTAL`) para mitigar riesgos de seguridad.
* **Relación:** Verificado por el `TrustEngine` antes de admitir una extensión.
* **Nombre en Código:** `TrustEngine`, `TrustLevel`.

---

### Lifecycle (Ciclo de Vida)
* **Definición:** Conjunto ordenado y finito de estados y transiciones legales por los que transita una entidad de dominio.
* **Función:** Asegurar que ninguna entidad pase a estados inválidos (e.g. de `FAILED` a `COMPLETED`).
* **Relación:** Validado por la máquina de estados finita del `CoreRuntime`.
* **Nombre en Código:** `LifecycleStatus`, `TaskStatus`.

---

### Observability (Observabilidad)
* **Definición:** Capacidad de inferir el estado interno del sistema a partir de sus salidas externas: métricas, logs y trazas distribuidas.
* **Función:** Diagnosticar cuellos de botella, medir latencias de inferencia y auditar fallos operacionales.
* **Relación:** Integrada con OpenTelemetry y proyectada en el Control Plane.
* **Nombre en Código:** `StructuredLogger`, `OtelExporter`.

---

### Business Device (Dispositivo Empresarial)
* **Definición:** Periférico físico de hardware (impresora POS, escáner, terminal) conectado a la infraestructura operativa.
* **Función:** Ejecutar acciones mecánicas del mundo real como resultado de flujos orquestados por agentes de IA.
* **Relación:** Registrado en el `DeviceRegistry` y controlado por adaptadores de hardware dedicados.
* **Nombre en Código:** `BusinessDevice`, `DeviceRegistry`.

---

### Print Job (Trabajo de Impresión)
* **Definición:** Orden atómica de impresión gestionada por el spooler local de la plataforma hacia una impresora empresarial.
* **Función:** Encapsular el contenido del documento, formato, número de copias y estado del ciclo de impresión (`QUEUED`, `PRINTING`, `COMPLETED`, `FAILED`).
* **Relación:** Despachado por `BrotherPrinterAdapter` hacia impresoras conectadas en puertos locales.
* **Nombre en Código:** `PrintJob`, `PrintJobStatus`.

---

### Adapter (Adaptador Concreto)
* **Definición:** Clase de infraestructura que implementa un puerto de dominio traduciendo tipos internos a tecnologías externas concretas.
* **Función:** Aislar al dominio de los detalles de bajo nivel de bases de datos, redes o hardware.
* **Relación:** Componente periférico en la arquitectura hexagonal concéntrica.
* **Nombre en Código:** `SqliteOperationRepository`, `OpenAiModelGateway`, `BrotherPrinterAdapter`.

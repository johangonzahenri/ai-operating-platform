# Mapa Maestro de Fases de Ingeniería (Fases 1 a 56)
## AI Operating Platform — Registro Factual de Evolución y Madurez Técnica

---

## 1. Síntesis Global de la Evolución por Versiones

| Ciclo / Hito | Fases Comprendidas | Línea Base de Tests | Hito Principal de Arquitectura |
| :--- | :--- | :--- | :--- |
| **v0.1 – v0.6** | Fases 1 a 6 | 45 PASS | Primitivas del Core Engine, máquina de estados y bus de eventos. |
| **v0.7** | Fase 7 | 82 PASS | Platform API Gateway y servidor HTTP nativo sin dependencias. |
| **v0.8** | Fase 8 | 120 PASS | Agregado `Agent` de primera clase con listas blancas de herramientas. |
| **v0.9** | Fase 9 | 268 PASS | Operaciones autónomas acotadas (`AutonomyBudget` y `AutonomousOrchestrator`). |
| **v0.10 – v0.13**| Fases 10 a 20 | 480 PASS | Persistencia relacional SQLite WAL, rehidratación formal y reconciliación post-crash. |
| **v1.0.0** | Fases 21 a 35 | 680 PASS | Fundación de producto: `PlatformClient` SDK y *Tentaciones AI Commerce*. |
| **v1.1.0** | Fases 36 a 54 | 966 PASS | Ecosistema extendido: Modelos reales (OpenAI, Claude, Ollama), impresora Brother, Vehicle Parts y SPA bilingüe. |
| **v1.2.0 (Alpha)**| Fase 55 (Prompt 101) | 985 PASS | Cloud Foundation: Google Gemini, SQLite Memory Gateway, JWT asimétrico con rotación y TLS. |
| **v1.2.0 (Beta)** | Fase 56 (Prompt 102) | 1019 PASS | Virtual Organization Foundation: Organizaciones, Áreas, Equipos y Membresía gobernada de agentes. |

---

## 2. Registro Factual Fase por Fase

### Épica 1: Cimientos del Motor Central & Ejecución Determinista (Fases 1 – 6)
* **Fase 1:** Especificación del modelo conceptual de `Task` con identidades deterministas y tipos de payload inmutables.
* **Fase 2:** Máquina de estados de `Execution` con transiciones lineales (`CREATED` -> `RUNNING` -> `COMPLETED` / `FAILED`).
* **Fase 3:** Bus de eventos de dominio correlacionados mediante `traceId` universal.
* **Fase 4:** Frontera de aislamiento entre Core Engine, Plataforma y Aplicaciones satélites (ADR 0006).
* **Fase 5:** Registro tipado de herramientas gobernadas con esquemas de parámetros JSON Schema (ADR 0005).
* **Fase 6:** Evaluación previa de políticas de seguridad con regla `Default-Deny` fail-closed (ADR 0009).

### Épica 2: Producto de Plataforma & Gateway de API (Fases 7 – 8)
* **Fase 7:** Servidor HTTP nativo en `node:http` con control de tamaño de carga (1MB Max) y cabeceras de correlación (ADR 0010).
* **Fase 8:** Modelado formal del Agente como agregado de primera clase independiente de la ejecución (ADR 0011).

### Épica 3: Autonomía Acotada & Presupuestos Operacionales (Fase 9)
* **Fase 9:** Creación de `AutonomyBudget`, `DecisionEvaluator` y `AutonomousOrchestrator` para bucles iterativos seguros con topes de pasos, costo y tiempo (ADR 0012, ADR 0013).

### Épica 4: Persistencia Durable Relacional & Resiliencia (Fases 10 – 20)
* **Fase 10:** Adopción de SQLite nativo en modo WAL con `SqliteDatabase` en `data/app.db` (ADR 0015).
* **Fase 11:** Fronteras formales de rehidratación estática (`Task.rehydrate`, `Execution.rehydrate`, `Agent.rehydrate`) sin reflexión (ADR 0016, ADR 0017, ADR 0018).
* **Fase 12:** Repositorios relacionales duraderos para tareas y ejecuciones con control OCC (ADR 0019).
* **Fase 13:** Implementación de `RestartRecoveryService` para transición atómica de operaciones interrumpidas y almacén append-only `SqliteEventStore` (ADR 0020, ADR 0021).
* **Fases 14 – 20:** Diagnósticos forenses CQRS y reconstrucción inmutable de líneas de tiempo por `traceId` (ADR 0022).

### Épica 5: SDK Oficial, Consola Web & Comercio Electrónico (Fases 21 – 35)
* **Fases 21 – 25:** Cliente SDK oficial en TypeScript (`PlatformClient`) y primera versión de la consola web SPA.
* **Fases 26 – 30:** Endpoints de ejecución Playground, histórico de ejecuciones y auditoría de eventos.
* **Fases 31 – 35:** Integración con *Tentaciones AI Commerce* como consumidor externo desacoplado (ADR-008).

### Épica 6: Modelos Reales, Herramientas & Seguridad Avanzada (Fases 36 – 49)
* **Fases 36 – 39:** Adaptadores directos sin SDKs externos para OpenAI, Anthropic Claude, Ollama y ProviderFactory.
* **Fases 40 – 42:** Sandbox de herramientas, protección contra Prototype Pollution y tokens de aprobación para riesgo `CRITICAL`.
* **Fases 43 – 48:** Aislamiento multi-tenant estricto por `tenantId`, matriz RBAC y pruebas de estrés adversarial.
* **Fase 49:** Gestión avanzada de agentes con versionado optimista OCC y listas blancas inmutables.

### Épica 7: Ecosistema Extendido, AR & Hardware Comercial (Fases 50 – 54)
* **Fase 50:** Descubrimiento inteligente de calzado y asistencia de carrito en Tentaciones AI Commerce.
* **Fase 51:** Probador Virtual 3D / Realidad Aumentada con modelos GLB y perfiles de avatar (ADR-009).
* **Fase 52:** Adaptador de hardware para impresora Brother DCP-1600 series en `USB001` y spooler durable (ADR 0010).
* **Fase 53:** Aplicación de referencia industrial *Vehicle Parts Platform* con compatibilidad mecánica determinista.
* **Fase 54:** Consola Web bilingüe nativa (`es-419` / `en`) con 0 `innerHTML` y Fábrica de Aplicaciones 2.0.

### Épica 8: Cloud Foundation & Virtual Organization (Fases 55 – 56)
* **Fase 55 (Prompt 101):**
  * Adaptador oficial Google Gemini / Vertex AI (`GeminiModelGateway`, ADR 0023).
  * Pasarela duradera de memoria contextual en SQLite WAL (`SqliteMemoryGateway`, ADR 0024).
  * Verificación criptográfica JWT asimétrica RS256/ES256 con rotación de claves (`JwtTokenVerifier`, ADR 0025).
  * Topología perimetral de red TLS con Nginx y Caddy (`deploy/`, ADR 0026).
  * Convergencia de API REST en `/api/v1/*` con avisos RFC 8594 en alias legados.
  * Línea base: 985 tests PASS.
* **Fase 56 (Prompt 102):**
  * Virtual Organization Foundation (`Organization`, `Area`, `Team`, `AgentMembership`, ADR 0027).
  * Ciclo de vida blando (las organizaciones archivadas no pueden reactivarse).
  * Repositorio relacional `SqliteOrganizationRepository` con índices compuestos y OCC.
  * API canónica en `/api/v1/organizations/*` y bloqueo estricto en alias legados.
  * Vista interactiva jerárquica en el Web Control Plane (0 `innerHTML`).
  * Línea base: **1019 tests PASS / 0 FAIL**.

---

## 3. Backlog Futuro Formal (Fase 57+)

| Fase Planificada | Título de la Iniciativa | Objetivo Técnico | Estado Kanban |
| :--- | :--- | :--- | :--- |
| **Fase 57** | Presupuestos por Equipo de Trabajo | Cuotas de inferencia y presupuestos acotados asignados a nivel de `Team`. | `TO DO` |
| **Fase 58** | Certificación Final de Criterios de Release | Auditoría de producción masiva y pruebas de estrés (`AOP-V1-EXIT`). | `IN REVIEW` |
| **Fase 59** | WebSockets Bidireccionales sobre HTTP/2 | Streaming de eventos y telemetría interactiva de baja latencia sin polling. | `BACKLOG` |
| **Fase 60+** | Checkpoint Distribuido Multi-Nodo | Sincronización multi-región para despliegues federados (v2.0). | `BACKLOG` |

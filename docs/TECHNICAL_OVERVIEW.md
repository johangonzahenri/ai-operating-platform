# AI Operating Platform (v1.1.0) &mdash; Technical Overview

## 1. Arquitectura Hexagonal y Puertos de Dominio

La plataforma está diseñada según los principios de la Arquitectura Hexagonal (Ports & Adapters). El dominio central no posee conocimiento directo de bases de datos, librerías de inferencia de terceros ni protocolos de transporte HTTP.

```text
               +--------------------------------------------+
               |             PLATFORM API / HTTP            |
               +--------------------------------------------+
                                      |
                                      v
+--------------------------------------------------------------------------+
|                            APPLICATION LAYER                             |
|  [SubmitTask]    [ExecuteOrchestration]    [AutonomousOrchestrator]     |
|  [QuotaService]  [GovernanceService]       [RestartRecoveryService]     |
+--------------------------------------------------------------------------+
                                      |
                                      v
+--------------------------------------------------------------------------+
|                              DOMAIN CORE                                 |
|  [Task]         [Execution]        [Agent]          [Tenant]             |
|  [Plan]         [AutonomyBudget]   [Decision]       [SecurityContext]    |
+--------------------------------------------------------------------------+
                                      |
                                      v
+--------------------------------------------------------------------------+
|                         INFRASTRUCTURE ADAPTERS                          |
|  [SqliteTaskRepo]  [SqliteEventStore]  [OpenAIModelGW]  [OllamaModelGW]  |
|  [PostgresTaskRepo][OTelExporter]      [ToolRuntime]    [InMemoryQueues] |
+--------------------------------------------------------------------------+
```

---

## 2. Gobernanza de Modelos e Inferencia

El `GovernedModelRouter` gestiona las peticiones de inferencia aplicando:
1. **Límites de Entrada (Guardrails):** Verificación de longitud máxima de prompt y detección de patrones de inyección (*prompt injection*).
2. **Cadena de Fallback Dinámica:** Encaminamiento ordenado:
   $$\text{Primary Gateway} \longrightarrow \text{Secondary Gateway} \longrightarrow \text{Ollama Local} \longrightarrow \text{Stub Gateway}$$
3. **Manejo de Errores Tipados:** Distinción explícita de `ModelAuthenticationError`, `ModelRateLimitError`, `ModelTimeoutError` y `ModelSecurityViolationError`.
4. **Protección de Secretos:** Sanitización total de claves de API y cabeceras en registros de auditoría y trazas de eventos.

---

## 3. Seguridad Fail-Closed y Aislamiento Multi-Inquilino

* **Modelo RBAC:** Roles estándar (`ADMIN`, `OPERATOR`, `DEVELOPER`, `SERVICE`, `ANONYMOUS`) con precedencia de denegación explícita (*Deny overrides Allow*).
* **Aislamiento Multi-Inquilino:** Cada petición vincula un `tenantId` inmutable desde el `SecurityContext`. Las consultas y accesos inter-inquilino se bloquean *fail-closed*.
* **Presupuestos de Autonomía:** `AutonomyBudget` limita el número máximo de pasos (`maxSteps`), la duración en milisegundos (`maxDurationMs`) y las invocaciones de herramientas permitidas (`maxToolCalls`).
* **Invocación Segura de Herramientas:** Detección y bloqueo de *prototype pollution*, validación de esquemas JSON, límites de ejecución y requisito de token de aprobación humana para herramientas de riesgo crítico (`CRITICAL`).

---

## 4. Persistencia Durable y Recuperación de Fallos

* **SQLite WAL v3:** Registro de eventos inmutable con números de secuencia monótonos y árboles de correlación causal (`traceId`, `correlationId`, `causationId`).
* **RestartRecoveryService:** Reconciliación automática e idempotente de ejecuciones o tareas interrumpidas tras un reinicio forzado del sistema.
* **Soporte PostgreSQL:** Adaptador transaccional con soporte para operaciones CRUD, migraciones de esquema y reversión de transacciones (*rollback*).

---

## 5. Rendimiento y Métricas Verificables

* **Suite de Pruebas:** +890 pruebas unitarias, de contrato, de integración y de plataforma ejecutándose en menos de 40 segundos.
* **Cero Vulnerabilidades:** Aprobado en `npm run check` y `npm audit` sin paquetes maliciosos ni vulnerabilidades críticas.
* **Seguridad DOM Frontend:** Cero mutaciones inseguras (`0 innerHTML`, `0 outerHTML`, `0 eval`, `0 document.write`) en todos los archivos de la Consola Web.

# Proyecto 01: Core Engine & Tiempo de Ejecución Autónomo
## Especificación de Ingeniería, Dominio y Estado Kanban

### 1. Ficha Técnica del Proyecto
* **Identificador:** `PRJ-01-CORE`
* **Área de Responsabilidad:** Núcleo de Ejecución, Máquina de Estados, Persistencia WAL y Autonomía
* **Ubicación en Repositorio:** `src/domain/`, `src/application/`, `src/infrastructure/persistence/sqlite/`
* **Línea Base de Pruebas:** 226 tests pass dedicados
* **Estado Kanban:** `DONE` (Operativo y Verificado en Producción)

---

### 2. Objetivos e Invariantes Fundamentales
1. **Determinismo y Máquina de Estados:** `Task` y `Execution` transicionan estrictamente a través de estados legales (`QUEUED` -> `RUNNING` -> `COMPLETED` | `FAILED` | `CANCELLED`). Los estados terminales son inmutables.
2. **Rehidratación Formal de Dominio:** Eliminación absoluta de `Reflect.construct` y mappers opacos; cada agregado implementa métodos estáticos puros (`Task.rehydrate()`, `Execution.rehydrate()`) que validan la integridad temporal e invariantes (ADR 0016, ADR 0017).
3. **Bucle Autónomo Acotado (`AutonomyBudget`):** Ninguna operación autónoma puede ejecutarse sin un presupuesto inmutable que fije topes estrictos de tiempo (`maxDurationMs`), pasos iterativos (`maxSteps`) y llamadas a herramientas (`maxToolCalls`) (ADR 0013).
4. **Persistencia Relacional SQLite WAL:** Uso exclusivo del motor relacional nativo `node:sqlite` en modo WAL (`data/app.db`) con control de concurrencia optimista (OCC) mediante columnas de versión (ADR 0015, ADR 0019).
5. **Reconciliación Atómica ante Caídas:** `RestartRecoveryService` detecta en el arranque cualquier tarea o ejecución en estado no terminal y la conmuta atómicamente a `FAILED` con el código canónico `CRASH_RECOVERY_RECONCILED` (ADR 0020).

---

### 3. Tablero Kanban Detallado de Fases

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [DONE] Fases 1 a 6: Primitivas del Motor Central (v0.1 - v0.6)                        │
│ • Máquina de estados de tareas y ejecuciones con inmutabilidad de payloads.           │
│ • Contexto de ejecución delimitado y bus de eventos de dominio inmutables.            │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ [DONE] Fase 9: Operaciones Autónomas Acotadas (v0.9)                                  │
│ • Entidad `AutonomousOperation`, presupuestos `AutonomyBudget`, `AutonomousOrchestrator`. │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ [DONE] Fases 10 a 13: Persistencia SQLite WAL y Resiliencia (v0.10 - v0.13)           │
│ • `SqliteDatabase`, `SqliteTaskRepository`, `SqliteExecutionRepository`.              │
│ • Rehidratación formal estática y reconciliación post-crash (`RestartRecoveryService`).│
├────────────────────────────────────────────────────────────────────────────────────────┤
│ [BACKLOG] Fase 60+: Checkpoint Distribuido Multi-Nodo (v2.0)                          │
│ • Replicación de estado distribuido y particionamiento entre clusters multi-región.    │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

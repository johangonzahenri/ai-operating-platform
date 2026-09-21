# ADR 0046: Governed Mandate Reconciliation & Runtime Consistency

## Estado
**APROBADA** (Fase 77 / `AOP-V1.4-MANDATE-RECONCILIATION`)

## Fecha
Septiembre de 2026

## Contexto
En las Fases 75 y 76 se consolidó el modelo de gobernanza multi-empresarial (`EnterprisePortfolio`, `EnterpriseGovernanceMandate`, `PortfolioObjective`) y su acoplamiento con el runtime operacional. Sin embargo, en un entorno dinámico, los mandatos de gobernanza corporativa pueden sufrir mutaciones de ciclo de vida (expiración temporal, revocación ejecutiva, cancelación explícita, reducción de alcance operacional o decremento de límites de autonomía) mientras existen instancias de flujos de trabajo (`WorkflowInstance`), planes o solicitudes de aprobación (`ApprovalRequest`) en vuelo.

La plataforma requería una capacidad determinista, idempotente, transaccional y auditable que reconcilie el runtime con los cambios de autoridad sin introducir agentes autónomos no gobernados ni decisiones heurísticas/LLM.

### Axiomas de Reconciliación Gobernada:
1. **Jerarquía Canónica de Fuente de Verdad:**
   $$\text{Código} > \text{Tests} > \text{Evidencia Git} > \text{Documentación Oficial} > \text{Roadmap} > \text{Excel/Kanban}$$

2. **Inmutabilidad de Estados Terminales (0 Mutación Retroactiva):**
   Los registros en estados terminales (`COMPLETED`, `FAILED`, `CANCELLED`, `EXPIRED`, `REJECTED`, `BUDGET_EXHAUSTED`) representan verdades históricas inmutables y **NUNCA** son alterados retroactivamente por una reconciliación.

3. **Fail-Closed y Preservación de Negación por Defecto (Default-Deny):**
   Cualquier recurso activo cuya autorización quede invalidada por el mandato modificado se transiciona de forma determinista y segura:
   - Tareas en cola (`QUEUED` / `ASSIGNING`): se cancelan (`CANCELLED`).
   - Tareas en ejecución (`RUNNING` / `DISPATCHED`): se pausan para supervisión (`PAUSED`) o se cancelan según la severidad del disparador.
   - Aprobaciones pendientes (`AWAITING_APPROVAL`): se reevalúan o rechazan (`REJECTED`) si el mandato expiró o fue revocado.

4. **Cero Autoridad Autónoma / 0 Inferencia LLM:**
   La matriz de reconciliación es 100% matemática y determinista (`evaluateMandateReconciliation()`).

5. **Aislamiento Multi-Inquilino Estricto y Control de Concurrencia Optimista (OCC):**
   Cada operación de reconciliación valida el inquilino (`tenantId`) y el número de versión de concurrencia (`concurrencyVersion`), detectando y rechazando estados obsoletos (`409 Concurrency Conflict`).

6. **Prioridad Absoluta de Parada de Emergencia (Emergency Halt Priority):**
   Si existe un estado de parada de emergencia (`EMERGENCY_HALT`), cualquier intento de reconciliación mutativa es abortado inmediatamente (*fail-closed*).

## Decisión

1. **Dominio de Reconciliación de Mandatos (`src/domain/portfolio/`):**
   - **`mandate-reconciliation-policy.ts`**: Motor puro de evaluación de políticas (`evaluateMandateReconciliation()`) con matriz determinista de acciones (`NO_OP`, `CONTINUE`, `PAUSE`, `CANCEL`, `REAUTHORIZATION_REQUIRED`).
   - **`mandate-reconciliation-errors.ts`**: Jerarquía formal de excepciones (`ReconciliationValidationError`, `ReconciliationConcurrencyConflictError`, `ReconciliationStaleMandateError`, `ReconciliationPolicyViolationError`, `ReconciliationEmergencyHaltActiveError`, `ReconciliationTenantMismatchError`, `ReconciliationPolicyDeniedError`).
   - **`mandate-reconciliation-events.ts`**: Eventos inmutables de dominio (`mandate.reconciliation.started`, `mandate.reconciliation.completed`, `workflow.reconciled`, `approval_request.reconciled`).
   - **`governance-mandate.ts`**: Métodos inmutables de transición de ciclo de vida (`expire()`, `cancel()`, `updateScope()`, `updateAutonomyLimit()`).

2. **Capa de Aplicación y Servicio de Reconciliación (`src/application/portfolio/`):**
   - **`MandateReconciliationService` (`mandate-reconciliation-service.ts`)**:
     - Detección de impacto en recursos en vuelo (`WorkflowInstance`, `ApprovalRequest`).
     - Caché de idempotencia en memoria (`idempotencyKey`).
     - Soporte para escaneo periódico de mandatos expirados (`reconcileExpiredMandates()`).
   - **`PortfolioGovernanceService`**: Inyección e integración de `MandateReconciliationService`, exponiendo `reconcileMandate()` y `reconcileExpiredMandates()`.

3. **Exposición REST API y SDK Client (`src/platform/api/`, `src/platform-client/`):**
   - **Endpoints REST**:
     - `POST /api/v1/mandates/:id/reconcile`: Ejecuta la reconciliación puntual de un mandato con control OCC.
     - `POST /api/v1/mandates/reconcile-expired`: Ejecuta el barrido/daemon de reconciliación de todos los mandatos expirados del inquilino.
   - **SDK Client**: Métodos `client.portfolios.reconcileMandate()` y `client.portfolios.reconcileExpiredMandates()`.

4. **Suite Completa de Pruebas Automatizadas:**
   - `tests/unit/mandate-reconciliation.test.ts`: 25 pruebas unitarias cubriendo los axiomas invariantes, OCC, aislamiento de inquilinos, idempotencia, preservación histórica y parada de emergencia.
   - `tests/platform/mandate-reconciliation.test.ts`: 10 pruebas de plataforma HTTP REST y SDK Client.

## Consecuencias

* **Positivas:**
  * Consistencia total y garantizada entre el ciclo de vida de los mandatos corporativos y las ejecuciones operacionales en curso.
  * Preservación matemática de la historia operativa sin mutaciones retroactivas.
  * Trazabilidad completa mediante eventos inmutables correlacionados por `traceId` y `reconciliationId`.
  * Capacidad de escaneo y reconciliación desatendida para daemons o tareas programadas de gobierno.
* **Invariantes Mantenidos:**
  * 0 dependencias npm runtime externas (`node:*` nativo únicamente).
  * 0 inferencia LLM en decisiones de reconciliación o cambio de estados.
  * Preservación del aislamiento local estricto.

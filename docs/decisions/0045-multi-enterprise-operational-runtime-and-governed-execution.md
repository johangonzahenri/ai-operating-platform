# ADR 0045: Multi-Enterprise Operational Runtime & Governed Execution

## Estado
**APROBADA** (Fase 76 / `AOP-V1.4-MULTI-ENTERPRISE-RUNTIME`)

## Fecha
Septiembre de 2026

## Contexto
En la Fase 75 se introdujo la capa de modelo y gobernanza multi-empresarial (`EnterprisePortfolio`, `EnterpriseGovernanceMandate`, `PortfolioObjective`). La **Fase 76** conecta orgánicamente esta arquitectura de gobernanza de portafolio con el **runtime de ejecución operacional real** de la plataforma, cerrando la cadena canónica completa de extremo a extremo:

$$\text{Portfolio} \to \text{Enterprise} \to \text{Objective} \to \text{Initiative} \to \text{Workflow} \to \text{Plan} \to \text{Mandate} \to \text{Policy} \to \text{Scope} \to \text{Budget} \to \text{Assignment} \to \text{Execution} \to \text{Verification} \to \text{Approval} \to \text{Metric} \to \text{Portfolio Aggregation} \to \text{Audit / Events}$$

### Axiomas de Ejecución Operacional Gobernada:
1. **Negación por Defecto en Ejecución Cruzada (Cross-Enterprise Default Deny):**
   - Si $\text{sourceEnterpriseId} === \text{targetEnterpriseId}$, la ejecución procede bajo las políticas y presupuestos locales de la empresa.
   - Si $\text{sourceEnterpriseId} \neq \text{targetEnterpriseId}$, la ejecución es **DENEGADA POR DEFECTO** a menos que exista un `EnterpriseGovernanceMandate` explícito, activo, no expirado y no revocado que cubra exactamente el principal ejecutor, la operación requerida y el nivel de autonomía solicitado.

2. **Segregación Estricta de Funciones (Segregation of Duties - SoD):**
   - El agente o principal ejecutor de un paso no puede ser el verificador del resultado ($\text{Executor} \neq \text{Verifier}$).
   - El agente o principal ejecutor de un paso no puede ser el aprobador humano de la acción ($\text{Executor} \neq \text{Approver}$).
   - El verificador no puede ser el aprobador de la misma acción ($\text{Verifier} \neq \text{Approver}$).
   - Cualquier intento de autoverificación o autoaprobación es rechazado inmediatamente (*fail-closed*) mediante excepciones de dominio (`SelfVerificationError`, `SelfApprovalError`).

3. **Trazabilidad y Agregación Determinista de Métricas (0 LLM Estimation):**
   - La compleción de tareas y pasos operacionales registra mediciones exactas en métricas empresariales (`BusinessMetric`) vinculadas a objetivos de negocio (`BusinessObjective`).
   - Las métricas registradas alimentan en cascada la agregación determinista en los objetivos consolidados de portafolio (`PortfolioObjective`) sin cálculo ni alucinación por LLM.

## Decisión

1. **Integración en `WorkflowOrchestratorService` (`src/application/workflow/workflow-orchestrator-service.ts`):**
   - Se inyectaron dependencias opcionales hacia `PortfolioGovernanceService` y `EnterpriseOperatingService`.
   - Verificación de Segregación de Funciones (SoD) antes de asignar o despachar la tarea.
   - Verificación de Autoridad Inter-Empresarial (`validateCrossEnterpriseAuthority`) ante operaciones entre distintas entidades empresariales.
   - Propagación automática de mediciones de métricas tras la finalización exitosa del paso (`handleStepMetrics`) y cascada de agregación a nivel de portafolio.

2. **Tipado de Flujo de Trabajo Multi-Empresarial (`src/domain/workflow/workflow-definition.ts`):**
   - Inclusión de metadatos de gobernanza en pasos y definiciones: `sourceEnterpriseId`, `targetEnterpriseId`, `portfolioId`, `requestedAutonomy`, `verifierPrincipalId`, `approverPrincipalId`.

3. **Evaluación de Límites de Autonomía en Mandatos (`src/domain/portfolio/governance-mandate.ts`):**
   - Evaluación jerárquica estricta de niveles de autonomía (`LEVEL_0_MANUAL` a `LEVEL_4_MULTI_ENTERPRISE_AUTONOMOUS`) en `evaluateAuthority()`, denegando ejecuciones que soliciten un nivel superior al límite concedido en el mandato (`autonomyLimit` / `maxAutonomyLevel`).

4. **Suite Completa de Pruebas Unitarias y de Plataforma:**
   - `tests/unit/multi-enterprise-operational-runtime.test.ts`: 15 casos de prueba unitarios que verifican la cadena canónica, default-deny, expiración de mandatos, revocación, violaciones de alcance, violaciones de autonomía, SoD (ejecutor $\neq$ verificador $\neq$ aprobador), aislamiento de tenants, OCC y agregación de métricas.
   - `tests/platform/multi-enterprise-operational-runtime.test.ts`: 18 casos de prueba de integración HTTP REST y SDK Client validando el comportamiento integral del servidor.

## Consecuencias

* **Positivas:**
  * Conexión real, auditable y verificada entre el modelo de gobernanza de portafolio y la orquestación operativa.
  * Blindaje matemático de Segregación de Funciones en todos los pasos de flujos de trabajo corporativos.
  * Automatización segura y progresiva con verificación de mandatos antes de despachar tareas a agentes o runtime.
  * Consolidación determinista de métricas corporativas desde el suelo operativo hasta el holding.
* **Invariantes Mantenidos:**
  * 0 dependencias npm externas en tiempo de ejecución.
  * 0 cálculos heurísticos o por LLM en agregaciones financieras o de KPIs corporativos.
  * Preservación del aislamiento local estricto.

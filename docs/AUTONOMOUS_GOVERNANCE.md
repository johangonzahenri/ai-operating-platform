# Gobernanza Continua de Operaciones Autónomas (Continuous Autonomous Governance)

## 1. Principios y Postura de Seguridad Default-Deny

En la arquitectura de **AI Operating Platform**, la autonomía no otorga soberanía ejecutiva ilimitada. Todo proceso autónomo se somete a los siguientes principios inmutables:

1. **Aislamiento Estricto Multi-Inquilino (Multi-Tenant Isolation)**:
   - Todo disparador, ciclo, arrendamiento o decisión está vinculado de forma obligatoria a un `tenantId` e `enterpriseId`.
   - Las consultas y ejecuciones entre diferentes inquilinos fallan de inmediato de forma cerrada (*fail-closed*).

2. **Segregación Estricta de Funciones (Segregation of Duties)**:
   - El agente o componente que ejecuta una acción **nunca puede auto-verificarse**.
   - La verificación es llevada a cabo por un `DeterministicVerifier` o un agente evaluador independiente con perfil asignado.

3. **Gobernanza de Presupuestos Acotados (Bounded Resource Budgets)**:
   - `AutonomyBudget` y `TeamResourceBudget` imponen límites estrictos a:
     - Número máximo de pasos autónomos (`maxAutonomousSteps`).
     - Duración máxima acumulada (`maxDurationMs`).
     - Número máximo de invocaciones a modelos (`maxModelCalls`).
     - Número máximo de llamadas a herramientas (`maxToolCalls`).
   - Al agotarse el presupuesto, la operación se suspende automáticamente con estado `BUDGET_EXHAUSTED`.

4. **Detención por Circuit Breaker (Safety Halt)**:
   - Si se detectan fallos consecutivos que superan el umbral configurado (`failureThreshold`), el runtime transiciona a `SAFETY_HALTED`.
   - Ningún ciclo adicional se ejecuta hasta que un operador humano revise la causa raíz e invoque explícitamente `resumeRuntime`.

---

## 2. Matriz de Niveles de Autonomía y Supervisión

| Nivel de Riesgo | Nivel de Autonomía | Puerta de Política (`PolicyGateway`) | Verificación Requerida | Supervisión Humana |
|---|---|---|---|---|
| **LOW** | Ejecución Automática Bucle Cerrado | Evaluación Determinista Automática | Esquema y Rango Determinista | Auditoría Asíncrona |
| **MEDIUM** | Bounded Autonomous Execution | Evaluación de Cuotas y Límites | Verificación Cruzada Determinista | Consentimiento de Usuario / Notificación |
| **HIGH** | Coordinated Multi-Step | Aprobación de Plan Previsto | Verificación de Estado Monotónico | Aprobación Previa de Plan Requerida |
| **CRITICAL** | Suspended Autonomous Dispatch | Requisitos de Firma Dual / Admin | Verificación Exhaustiva + Snapshot | Aprobación y Firma Humana Obligatoria |

---

## 3. Prevención de Riesgos de IA Autónoma

- **Cero Auto-Escalación de Privilegios**: Los permisos de un agente no pueden ser alterados por el propio agente ni por otro agente sin intervención del Administrador.
- **Control de Concurrencia Optimista (OCC)**: Las entidades de dominio (`AutonomousTrigger`, `RuntimeLease`, `BusinessDecision`, `ExecutiveCycle`) poseen versiones numéricas estrictas que evitan sobreescrituras concurrentes.
- **Trazabilidad Forense Completa**: Toda decisión, evaluación y mutación queda registrada en el libro inmutable de eventos SQLite WAL con `traceId` y `correlationId`.

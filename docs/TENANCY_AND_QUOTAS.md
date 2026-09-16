# TENANCY, QUOTAS & METERING SPECIFICATION

## 1. Aislamiento Multi-Tenant (Tenant Isolation)

- **Fail-Closed Isolation**: Toda consulta o ejecución a tareas, ejecuciones, eventos, herramientas o assets AR está estrictamente restringida al `tenantId` del llamador autenticado.
- **Cross-Tenant Prevention**: Las llamadas que intentan acceder a recursos de un tenant diferente son rechazadas con error HTTP 403 / `UNAUTHORIZED_TENANT_ACCESS`.

---

## 2. Motor de Evaluación de Cuotas (Quota Engine)

El [`QuotaService`](../src/application/billing/quota-service.ts) evalúa el consumo en ventanas mensuales:

$$\text{Remaining} = \max(0, \text{Limit} - \text{CurrentUsage})$$

Cuando se excede el límite del plan, el motor rechaza la operación fail-closed con `QuotaExceededError`.

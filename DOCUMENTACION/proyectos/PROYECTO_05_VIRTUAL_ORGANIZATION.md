# Proyecto 05: Virtual Organization Foundation & Agentes
## Especificación de Ingeniería, Dominio y Estado Kanban

### 1. Ficha Técnica del Proyecto
* **Identificador:** `PRJ-05-VIRTUAL-ORG`
* **Área de Responsabilidad:** Estructura Jerárquica Organizacional, Áreas, Equipos y Membresía de Agentes
* **Ubicación en Repositorio:** `src/domain/organization/`, `src/application/organization/`, `src/infrastructure/organization/`
* **Línea Base de Pruebas:** 58 tests pass dedicados (+ 32 tests de agentes = 90 tests)
* **Estado Kanban:** `DONE` (Operativo y Verificado en Producción)

---

### 2. Objetivos e Invariantes Fundamentales
1. **`Tenant ≠ Organization`:** Un Tenant es el límite de aislamiento de infraestructura y facturación; una Organización es una entidad de negocio lógica que vive estrictamente dentro de un `tenantId`. Múltiples organizaciones pueden convivir en un tenant, pero una organización nunca cruza fronteras de tenant.
2. **`Membership ≠ Permission`:** `AgentMembership` modela pertenencia operativa y roles (`LEAD`, `SPECIALIST`, `OPERATOR`, `REVIEWER`). Pertenecer a un equipo **no otorga herramientas ni modelos** automáticamente; las listas blancas de herramientas del Agente y el RBAC siguen gobernando de forma fail-closed.
3. **`Membership ≠ Budget` y `Budget ≠ Authorization`:** Un equipo dispone de un `TeamResourceBudget` explícito para limitar el consumo operativo; la presencia de presupuesto no otorga permisos y la pertenencia a un equipo no elude la evaluación de `PolicyGateway`.
4. **Ciclo de Vida Blando (Soft Lifecycle):** Una organización archivada (`ARCHIVED`) no puede volver a ser activada ni desactivada, preservando la inmutabilidad histórica forense.
5. **Persistencia, Transacciones Atómicas y OCC:** `SqliteOrganizationRepository` y `SqliteTeamResourceBudgetRepository` gestionan índices compuestos, transacciones `BEGIN IMMEDIATE` y control de versiones optimista (ADR 0027, ADR 0028) con prevención estricta de condiciones de carrera en la última unidad (Last-Unit Race Condition).

---

### 3. Tablero Kanban Detallado de Fases

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [DONE] Fases 8, 49: Agregado Agent de Primera Clase (v0.8, v1.1)                       │
│ • Agente formal con instrucciones inmutables y lista blanca de herramientas.           │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ [DONE] Fase 56: Virtual Organization Foundation (`AOP-ORG-FOUNDATION`) (v1.2)          │
│ • Agregado `Organization`, entidades `Area`, `Team`, `AgentMembership`.                │
│ • Repositorio SQLite duradero, API REST canónica `/api/v1/organizations/*`.            │
│ • Consola visual interactiva en el Control Plane Web con 0 `innerHTML`.               │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ [DONE] Fase 57: Presupuestos y Asignación de Recursos por Equipo (v1.2) (`AOP-ORG-BUDGET`) │
│ • Agregado `TeamResourceBudget`, límites multidimensionales y transacciones atómicas. │
│ • Prevención de carreras (1 ALLOW / 1 DENY), endpoints `/api/v1/teams/:id/budget*`.    │
└────────────────────────────────────────────────────────────────────────────────────────┘
```


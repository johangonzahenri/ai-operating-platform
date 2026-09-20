# ADR 0044: Multi-Enterprise Governance, Holding Operating Model & Cross-Enterprise Mandates

## Estado
**APROBADA** (Fase 75 / `AOP-V1.4-PORTFOLIO-GOVERNANCE`)

## Fecha
Septiembre de 2026

## Contexto
AI Operating Platform (AOP) ha evolucionado progresivamente desde un runtime de ejecución y orquestación de agentes individuales, pasando por el modelado organizacional (Áreas, Equipos, Roles, Presupuestos) y el Sistema Operativo Empresarial (Empresa, Objetivos, Iniciativas, Decisiones Ejecutivas), hasta alcanzar la necesidad de operar bajo un **Modelo Operativo de Portafolio / Grupo Empresarial (Holding)**.

En organizaciones complejas, un grupo corporativo gobierna múltiples entidades empresariales autónomas o subsidiarias (e.g. Tentaciones Commerce, Vehicle Parts Platform, Shared Logistics, Shared Finance). Para gobernar este ecosistema sin comprometer la seguridad, se requiere establecer una jerarquía formal y axiomas estrictos de aislamiento:

1. **Jerarquía Unificada:**
   $$\text{Platform} \to \text{Portfolio / Group} \to \text{Enterprise} \to \text{Organization} \to \text{Area} \to \text{Team} \to \text{Agents / Solutions / Workflows}$$

2. **Axiomas de Seguridad y Separación:**
   $$\text{NETWORK} \neq \text{IDENTITY} \neq \text{AUTHORIZATION} \neq \text{MANDATE} \neq \text{POLICY} \neq \text{SCOPE}$$
   $$\text{Tenant} \neq \text{Enterprise} \neq \text{Portfolio}$$
   - `tenantId` es el límite de aislamiento criptográfico y de datos (Multi-Tenant Isolation).
   - `Enterprise` es la entidad de negocio legal y operativa.
   - `Portfolio` es la agrupación de gobernanza y coordinación estratégica.

3. **Principio de Negación por Defecto Inter-Empresarial (Cross-Enterprise Default Deny):**
   La simple membresía de dos empresas en el mismo Portafolio **NO** otorga acceso recíproco a datos, flujos de trabajo, recursos ni agentes. Toda operación o servicio compartido inter-empresarial requiere un mandato explícito, activo, no expirado y no revocado (`EnterpriseGovernanceMandate`).

4. **Agregación Determinista de Métricas Corporativas (0 LLM Estimation):**
   La consolidación de métricas de portafolio y KPIs estratégicos debe realizarse mediante algoritmos matemáticos deterministas (`SUM`, `AVERAGE`, `WEIGHTED_AVERAGE`, `MIN`, `MAX`, `COUNT`) con políticas explícitas de manejo de datos faltantes (`EXCLUDE`, `FAIL_CLOSED`, `FLAG_PARTIAL`), sin depender de cálculos o alucinaciones de modelos de lenguaje.

## Decisión

1. **Entidades del Dominio (`src/domain/portfolio/`):**
   - **`EnterprisePortfolio`**: Agregado raíz que representa el portafolio corporativo, gestionando el ciclo de vida de membresías de empresas (`EnterprisePortfolioMembership`), alcances de gobernanza (`COORDINATION`, `SHARED_RESOURCE`, `REPORTING`) y control de concurrencia optimista (`concurrencyVersion`).
   - **`EnterpriseGovernanceMandate`**: Agregado raíz que define la autoridad delegada a un principal o servicio compartido sobre empresas destino, restringido por alcances (`PORTFOLIO_COORDINATION`, `SHARED_SERVICE`, `EXECUTIVE_AUDIT`, `RESTRICTED_OPERATION`), operaciones permitidas, objetivos vinculados, límites de autonomía (`AutonomyLevel`) y vigencia temporal (`validFrom`, `validTo`). Método `evaluateAuthority()` con evaluación *fail-closed*.
   - **`PortfolioObjective`**: Agregado raíz para objetivos estratégicos y operacionales consolidados de portafolio, con agregación determinista de métricas de subsidiarias y cómputo exacto de brechas (*target gap*).

2. **Puertos y Persistencia Dual (`src/application/ports/portfolio-repository-port.ts`, InMemory y SQLite WAL):**
   - Repositorios dedicados para portafolios, mandatos y objetivos con verificación estricta de concurrencia optimista (OCC) y aislamiento multi-tenant en consultas y mutaciones.

3. **Capa de Aplicación y Servicio de Gobernanza (`src/application/portfolio/portfolio-governance-service.ts`):**
   - Orquestación del ciclo de vida de portafolios, validación de autoridades cruzadas, agregación de métricas y generación de contexto operativo de portafolio (`PortfolioOperatingContext`).

4. **Exposición de API REST y SDK de Cliente (`src/platform/api/http-router.ts`, `src/platform-client/index.ts`):**
   - Endpoints seguros bajo `/api/v1/portfolios*` y `/api/v1/mandates*` protegidos por RBAC, auditoría y trazabilidad distribuida (`requestId`, `correlationId`).

5. **Consola de Control Web Segura (0 innerHTML):**
   - Interfaz en `#tab-portfolios` en `src/platform/web/` con evaluador interactivo de autoridad inter-empresarial, visualización de estado de mandatos y KPIs consolidados, construido 100% mediante manipulación segura del DOM (`document.createElement`, `textContent`).

## Consecuencias

* **Positivas:**
  * Gobernanza jerárquica y transparente para grupos empresariales complejos con múltiples subsidiarias.
  * Inmunidad ante accesos no autorizados entre empresas subsidiarias gracias a la verificación estricta de mandatos delegados.
  * Agregación confiable, determinista y auditable de métricas corporativas y estados de cumplimiento.
  * Compatibilidad total con el Autonomous Operations Runtime, Executive Orchestrator y AI Solutions Factory.
* **Invariantes Mantenidos:**
  * 0 dependencias npm externas en tiempo de ejecución (`dependencies: {}`).
  * 0 asignaciones de `.innerHTML` en frontend.
  * Aislamiento local absoluto del hardware comercial Brother DCP-1600.

# FASE 79: DISCOVERY ARCHITECTURE + PRODUCT
# ENTERPRISE CONTROL PLANE — PORTFOLIO & GOVERNANCE UI DISCOVERY

**Iniciativa Relacionada:** `AOP-PORTFOLIO-UI`  
**Estado Actual de la Iniciativa:** `ANALYSIS` (No implementada, en fase de descubrimiento y diseño formal)  
**Fecha de Auditoría:** Septiembre de 2026  
**Baseline Certificado Previo:** Fase 77 (`AOP-MANDATE-RECONCILIATION-DAEMON`) & Fase 78 (`AOP-COMPLIANCE-EXPORT`)  
**Autoridad de Fuente de Verdad:**  
$$\text{Código} > \text{Tests} > \text{Evidencia Git} > \text{Documentación Oficial} > \text{Roadmap} > \text{Excel/Kanban}$$

---

## 1. Frontend Architecture Actual

La arquitectura frontend actual de la AI Operating Platform es una **Single-Page Application (SPA) nativa / Vanilla ES Modules**, servida directamente por el servidor HTTP nativo (`src/platform/api/http-router.ts`).

### Características Estructurales:
* **Framework:** Vanilla JavaScript (ES2022+ Modules) nativo en el navegador. **0 frameworks externos** (sin React, Vue, Angular o Svelte), preservando estrictamente la política de `dependencies: {}` en tiempo de ejecución.
* **Entry Point:** `src/platform/web/index.html` (interfaz HTML5 semántica) que carga `app.js` mediante `<script type="module" src="app.js"></script>`.
* **Routing:** Tab-based client-side state switching (`data-tab="..."` en botones de navegación, gestionado por `PlatformApp.switchTab(tabId)` y persistido opcionalmente en el hash de la URL sin recargar la página). El router HTTP de backend (`http-router.ts`) implementa fallback SPA devolviendo `index.html` para rutas no reconocidas.
* **State Management:** Estado en memoria encapsulado en la clase controladora `PlatformApp` (`src/platform/web/app.js`), complementado con cachés de entidades (`cachedModels`, `cachedTools`, `cachedAgents`, `cachedTasks`, `cachedEvents`, `cachedCredentials`).
* **Data Fetching:** Módulo desacoplado `src/platform/web/api-client.js` que implementa llamadas `fetch()` estrictamente tipadas contra los contratos REST `/api/v1/*`.
* **Rendering Strategy:** Construcción imperativa y segura del DOM mediante APIs nativas (`document.createElement`, `textContent`, `append`, `appendChild`, `classList`). **Estricto 0 `.innerHTML`, 0 `.outerHTML`, 0 `eval()` y 0 `document.write()`**, blindado por tests de regresión estáticos.
* **Design System:** `src/platform/web/styles.css` con sistema unificado de tokens CSS nativos (variables `--bg-*`, `--text-*`, `--accent-*`, `--radius-*`), tipografía de sistema (`-apple-system`, `JetBrains Mono`), paleta ejecutiva clara por defecto y modo oscuro alternativo (`[data-theme="dark"]`).
* **Componentes Reutilizables:** Modales dinámicos (`modal-backdrop`, `modal-container`), tarjetas métricas (`ops-status-card`, `card`), tablas con paginación (`table`, `pagination-controls`), badges semánticos (`badge-success`, `badge-danger`, `badge-info`, `badge-agent`, etc.), timelines de eventos y diálogos de confirmación gobernada.

---

## 2. Control Plane Actual: Secciones y Pestañas Existentes

La navegación lateral (`src/platform/web/index.html`) organiza 17 pestañas en 3 secciones funcionales:

```
AI Operating Platform | Control Plane (v1.1.0/v1.4.0)
│
├── Enterprise Control Plane
│   ├── [platform-operations]  Overview / Ops (Consola Operacional e Inteligencia)
│   ├── [applications]         Applications (Tentaciones AI Commerce, Vehicle Parts, etc.)
│   ├── [agents]               Agents (Gestión de Agentes de Primera Clase)
│   ├── [tasks]                Tasks (Despacho y Monitoreo de Tareas)
│   ├── [executions]           Executions (Historial Forense e Inspección de Trazas)
│   ├── [events]               Events Stream (Flujo de Eventos Durables SQLite WAL)
│   ├── [models]               Models Gateway (OpenAI, Anthropic, Ollama, Gemini)
│   ├── [tools]                Tools Registry (Herramientas y Capacidades Gobernadas)
│   ├── [tenants]              Tenants & Quotas (Aislamiento Multi-Inquilino y Cuotas)
│   ├── [organizations]        Organizations & Teams (Estructura Virtual Organizacional)
│   └── [portfolios]           Portfolios & Mandates (Portafolios Multi-Empresariales - Fase 75)
│
├── Governance & Ecosystem
│   ├── [security]             Security Center & Credential Governance (API Keys, RBAC)
│   ├── [governance]           Policies & Precedence (Políticas Fail-Closed)
│   ├── [factory]              Application Factory 2.0 (Planos y Soluciones)
│   ├── [ecosystem]            Ecosystem & Marketplace (Blueprints y Paquetes)
│   └── [diagnostics]          Diagnostics Center (Probes de Liveness, WAL y Recuperación)
│
└── Operations & Observability
    ├── [dashboard]            Telemetry & Metrics (Métricas Agregadas)
    ├── [capabilities]         Capabilities Catalog (Catálogo de Capacidades de Agentes)
    ├── [integrations]         Integraciones & Truth Model (Verificación de Integraciones)
    ├── [operations]           Operations & Automation (Daemon Autónomo 24/7)
    ├── [usage]                Usage Summary (Consumo y Cuotas)
    ├── [blueprints]           System Blueprint (Diagrama Arquitectónico)
    ├── [devices]              Devices & Printing (Impresora Brother USB001)
    └── [showcase]             Product Tour & Demo
```

---

## 3. Matriz de Superficie API y SDK: UI Feature vs REST vs SDK vs Origen de Datos

| UI Feature / Dominio | REST Endpoint (`http-router.ts`) | Método SDK (`PlatformClient`) | Data Source / Repositorio Backend | Estado UI Real |
| :--- | :--- | :--- | :--- | :--- |
| **Portfolios List** | `GET /api/v1/portfolios` | `client.portfolios.list()` | `PortfolioRepository.findAll()` | **IMPLEMENTADO** (`#tab-portfolios`) |
| **Portfolio Detail & Context** | `GET /api/v1/portfolios/:id/context` | `client.portfolios.getContext()` | `PortfolioGovernanceService.getOperatingContext()` | **PARCIAL** (API existe, UI básica) |
| **Create Portfolio** | `POST /api/v1/portfolios` | `client.portfolios.create()` | `PortfolioGovernanceService.createPortfolio()` | **IMPLEMENTADO** (Modal en `#tab-portfolios`) |
| **Enterprise Membership** | `POST /api/v1/portfolios/:id/enterprises` | `client.portfolios.addEnterprise()` | `PortfolioGovernanceService.addEnterprise()` | **GAP UI** (Endpoint existe en backend) |
| **Enterprise List / Detail** | `GET /api/v1/enterprises` | `client.enterprises.list()` | `BusinessRepository.listEnterprises()` | **IMPLEMENTADO** (`#tab-organizations`) |
| **Business Objectives** | `GET /api/v1/enterprises/:id/objectives` | `client.enterprises.getObjectives()` | `BusinessRepository.listObjectives()` | **IMPLEMENTADO** (`#tab-organizations`) |
| **Business Initiatives** | `GET /api/v1/enterprises/:id/initiatives` | `client.enterprises.getInitiatives()` | `BusinessRepository.listInitiatives()` | **IMPLEMENTADO** (`#tab-organizations`) |
| **Business Metrics** | `GET /api/v1/enterprises/:id/metrics` | `client.enterprises.getMetrics()` | `BusinessRepository.listMetrics()` | **IMPLEMENTADO** (`#tab-organizations`) |
| **Portfolio Objectives** | `GET /api/v1/portfolios/:id/objectives` | `client.portfolios.getObjectives()` | `PortfolioRepository.findObjectivesByPortfolioId()` | **IMPLEMENTADO** (`#tab-portfolios`) |
| **Create Portfolio Objective** | `POST /api/v1/portfolios/objectives` | `client.portfolios.createObjective()` | `PortfolioGovernanceService.createPortfolioObjective()` | **GAP UI** (Endpoint existe en backend) |
| **Activate Portfolio Objective**| `POST /api/v1/portfolio-objectives/:id/activate` | `client.portfolios.activateObjective()` | `PortfolioGovernanceService.activatePortfolioObjective()` | **GAP UI** (Endpoint existe en backend) |
| **Link Enterprise Objective** | `POST /api/v1/portfolio-objectives/:id/link-enterprise-objective` | `client.portfolios.linkEnterpriseObjective()` | `PortfolioGovernanceService.linkEnterpriseObjective()` | **GAP UI** (Endpoint existe en backend) |
| **Aggregate Portfolio Metrics** | `POST /api/v1/portfolio-objectives/:id/aggregate` | `client.portfolios.aggregateMetrics()` | `PortfolioGovernanceService.aggregatePortfolioMetrics()` | **GAP UI** (Endpoint existe en backend) |
| **Governance Mandates List** | `GET /api/v1/portfolios/:id/mandates` | `client.portfolios.getMandates()` | `PortfolioRepository.findMandatesByPortfolioId()` | **IMPLEMENTADO** (`#tab-portfolios`) |
| **Grant Governance Mandate** | `POST /api/v1/portfolios/mandates` | `client.portfolios.grantMandate()` | `PortfolioGovernanceService.grantMandate()` | **GAP UI** (Endpoint existe en backend) |
| **Revoke Governance Mandate** | `POST /api/v1/mandates/:id/revoke` | `client.portfolios.revokeMandate()` | `PortfolioGovernanceService.revokeMandate()` | **GAP UI** (Endpoint existe en backend) |
| **Validate Cross-Enterprise Authority** | `POST /api/v1/portfolios/validate-authority` | `client.portfolios.validateCrossEnterpriseAuthority()` | `PortfolioGovernanceService.validateCrossEnterpriseAuthority()` | **IMPLEMENTADO** (Evaluador en `#tab-portfolios`) |
| **Mandate Reconciliation (Single)** | `POST /api/v1/mandates/:id/reconcile` | `client.portfolios.reconcileMandate()` | `MandateReconciliationService.reconcileMandate()` | **GAP UI** (Fase 77 backend lista, UI pendiente) |
| **Reconcile Expired Mandates (Daemon)**| `POST /api/v1/mandates/reconcile-expired` | `client.portfolios.reconcileExpiredMandates()` | `MandateReconciliationService.reconcileExpiredMandates()` | **GAP UI** (Fase 77 backend lista, UI pendiente) |
| **Workflows & DAG Steps** | `GET /api/v1/workflows` | `client.workflows.list()` | `WorkflowRepository.findAll()` | **IMPLEMENTADO** (`#tab-operations`) |
| **Workflow Instances & Executions** | `GET /api/v1/workflow-instances` | `client.workflows.listInstances()` | `WorkflowRepository.findAllInstances()` | **IMPLEMENTADO** (`#tab-operations`) |
| **Workflow Step Verification** | `POST /api/v1/workflow-steps/:id/verify`| `client.workflows.verifyStep()` | `WorkflowVerificationService.verifyStep()` | **GAP UI** (Endpoint existe en backend) |
| **Human Oversight / Approvals** | `GET /api/v1/approvals` | `client.approvals.list()` | `HumanOversightService.listApprovals()` | **IMPLEMENTADO** (`#tab-operations`) |
| **Decide Approval (Approve/Reject)** | `POST /api/v1/approvals/:id/decide` | `client.approvals.decide()` | `HumanOversightService.decide()` | **IMPLEMENTADO** (`#tab-operations`) |
| **Evidence Export Package** | `POST /api/v1/governance/evidence/export` | `client.exportEvidence()` | `EvidenceExportService.exportEvidence()` | **GAP UI** (Fase 78 backend lista, UI pendiente) |
| **Durable Audit Trail Stream** | `GET /api/v1/events` (REST/SSE) | `client.events.list()` / SSE | `SqliteEventStore.query()` | **IMPLEMENTADO** (`#tab-events`, `#tab-platform-operations`) |
| **RBAC Roles & Principals** | `GET /api/v1/credentials` | `client.credentials.list()` | `SqliteRoleRepository` / `SqliteApiCredentialRepository` | **IMPLEMENTADO** (`#tab-security`) |

---

## 4. Modelo de Seguridad y Autorización

1. **Principio Fundamental:**  
   El Control Plane web es **exclusivamente una superficie de gestión y visibilidad**, nunca la fuente de verdad. La persistencia reside en SQLite WAL y el dominio.
2. **Frontend Visibility $\neq$ Backend Authorization:**  
   Ninguna validación del lado del cliente (botones deshabilitados, pestañas ocultas o atributos `hidden`) constituye una barrera de seguridad. Toda petición REST que ejecuta el frontend transmite las cabeceras de autorización (`Authorization: Bearer <token>` o `X-Api-Key: <key>`), `X-Tenant-Id` y `X-Application-Id`.
3. **Fail-Closed & Default-Deny:**  
   El backend intercepta cada llamada en `http-router.ts` evaluando el contexto de seguridad (`SecurityContext`), los roles requeridos (e.g. `system-admin`, `portfolio-manager`, `compliance-officer`, `auditor`) y la política de aislamiento multi-inquilino. Si la autorización falla, el backend retorna `401 Unauthorized` o `403 Forbidden` y el frontend renderiza el error sin alterar su estado local.
4. **Segregación de Funciones (SoD):**  
   En operaciones de aprobación humana (`POST /api/v1/approvals/:id/decide`) y verificación de pasos de workflow (`POST /api/v1/workflow-steps/:id/verify`), el backend rechaza activamente cualquier colisión de identidad ($\text{Executor} \neq \text{Verifier} \neq \text{Approver}$) mediante excepciones de dominio.

---

## 5. Internacionalización (I18n)

* **Motor Actual:** `src/platform/web/i18n/index.js` implementa `I18nService`, `TranslationRegistry` y `LocaleResolver`.
* **Idioma por Defecto:** **Español Latinoamericano (`es-419`)**, con selector bilingüe dinámico hacia Inglés (`en`).
* **Persistencia:** Almacenamiento seguro de preferencia en `localStorage.getItem('ai_platform_locale')`.
* **Invariantes de Traducción:**
  * Rutas API (`/api/v1/*`), nombres de campos JSON (`tenantId`, `portfolioId`), nombres de clases TypeScript, códigos de error (`PORTFOLIO_NOT_FOUND`, `MANDATE_EXPIRED`), métodos del SDK y tipos de eventos (`mandate.reconciliation.completed`) **NUNCA se traducen**.
  * Todos los títulos de vistas, etiquetas de formularios, descripciones de estado y mensajes de usuario soportan claves estructuradas en `locale-es-419.js` y `locale-en.js`.

---

## 6. Diagnóstico de Disponibilidad de Datos (Data Readiness)

### 6.1. Portfolio Data Readiness: `ALTO (85%)`
* **Entidades de Dominio:** `EnterprisePortfolio`, `EnterprisePortfolioMembership`, `EnterpriseGovernanceMandate`, `PortfolioObjective` completamente modeladas con OCC (`concurrencyVersion`).
* **Datos Visualizables Reales:** ID de portafolio, nombre, descripción, estado (`ACTIVE`/`SUSPENDED`), empresas miembro vinculadas, mandatos activos asociados y objetivos consolidados.
* **Gaps en UI:** Falta formulario interactivo para vincular nuevas empresas a un portafolio existente y crear/activar objetivos de portafolio directamente desde la interfaz.

### 6.2. Enterprise Data Readiness: `ALTO (90%)`
* **Entidades de Dominio:** `Enterprise`, `Organization`, `Area`, `Team`, `AgentProfile`, `BusinessObjective`, `BusinessInitiative`, `BusinessMetric`, `ExecutiveDecisionRecord`.
* **Datos Visualizables Reales:** Jerarquía corporativa multinivel, equipos con sus presupuestos de recursos, agentes asignados, objetivos de negocio con KPIs vinculados y mediciones históricas.
* **Gaps en UI:** Las empresas se gestionan en `#tab-organizations`; falta una vista unificada que conecte una empresa con los portafolios a los que pertenece.

### 6.3. Governance Data Readiness (Mandates, Policies, Reconciliation): `ALTO (90%)`
* **Entidades de Dominio:** `EnterpriseGovernanceMandate`, `MandateReconciliationPolicy`, `MandateReconciliationReport`, `PolicyRule`.
* **Distinción Conceptual Estricta:**
  $$\text{Authority (Mandato)} \neq \text{Permission (RBAC)} \neq \text{Autonomy (Level 0-4)} \neq \text{Budget (Tokens/USD)}$$
* **Datos Visualizables Reales:** Mandatos activos, entidad origen, entidades destino, alcance de operaciones permitidas, nivel máximo de autonomía y reportes de reconciliación de la Fase 77.
* **Gaps en UI:** Falta un visor dedicado para invocar reconciliaciones manuales (`POST /mandates/:id/reconcile`), disparar el barrido de mandatos expirados (`POST /mandates/reconcile-expired`) y visualizar el historial de reportes de reconciliación.

### 6.4. Operations Data Readiness (Workflows, Executions, Verifications): `ALTO (85%)`
* **Entidades de Dominio:** `WorkflowDefinition`, `WorkflowInstance`, `WorkflowStepState`, `VerificationResult`, `ApprovalRequest`, `Execution`.
* **Cadena Visualizable Real:**
  $$\text{Workflow} \to \text{Step} \to \text{Assignment} \to \text{Execution} \to \text{Verification} \to \text{Approval}$$
* **Gaps en UI:** La vista `#tab-operations` renderiza workflows e instancias, pero la visualización del desacoplamiento entre `Execution Status` y `Verification Verdict` (Fase 76) requiere un panel de detalle más explícito.

### 6.5. Evidence & Audit Readiness: `COMPLETO (100% Backend / 40% Frontend)`
* **Entidades de Dominio:** `EvidenceExportPackage`, `EvidenceExportManifest`, `DurableEvent`, `AuthorizationTrace`.
* **Datos Exportables Reales (Fase 78):** Paquetes sellados con SHA-256 en 9 alcances (`TENANT`, `PORTFOLIO`, `ENTERPRISE`, `WORKFLOW`, `EXECUTION`, `MANDATE`, `APPROVAL`, `RECONCILIATION`, `AUDIT_TRAIL`), con redacción automática de secretos y sin mutación de estado.
* **Gaps en UI:** No existe aún en el Control Plane una pestaña o modal `#tab-evidence` para configurar los filtros de exportación (alcance, fechas, límite de registros), solicitar el paquete y descargar el JSON canónico con su sello de integridad SHA-256.

---

## 7. Clasificación de Acciones UI: Solo Lectura (READ_ONLY) vs Mutación (MUTATION)

| Acción UI Propuesta | Tipo | Requiere Autorización Backend | Permiso / Scope Requerido |
| :--- | :--- | :--- | :--- |
| Inspección de Portafolios y Mandatos | `READ_ONLY` | Sí | `portfolio.read` / `mandate.read` |
| Inspección de Objetivos y Métricas | `READ_ONLY` | Sí | `portfolio_objective.read` / `enterprise.read` |
| Ejecución de Dry-Run de Autoridad | `READ_ONLY` | Sí | `mandate.read` |
| Exportación de Evidencia de Compliance | `READ_ONLY` (0 mutación) | Sí | `governance.export_evidence` |
| Creación de Portafolio | `MUTATION` | Sí (Transaccional) | `portfolio.create` |
| Concesión de Mandato de Gobernanza | `MUTATION` | Sí (Transaccional) | `mandate.manage` |
| Revocación / Modificación de Mandato | `MUTATION` | Sí (OCC + Audit Event) | `mandate.manage` |
| Disparo de Reconciliación de Mandato | `MUTATION` | Sí (Transaccional) | `mandate.manage` |
| Barrido de Mandatos Expirados | `MUTATION` | Sí (Daemon / Batch) | `mandate.manage` |
| Creación / Activación de Objetivo | `MUTATION` | Sí (OCC) | `portfolio_objective.create` / `portfolio_objective.manage` |
| Aprobación / Rechazo Humano (SoD) | `MUTATION` | Sí (SoD + Trace) | `approval.decide` |
| Ejecución de Tarea / Workflow | `MUTATION` | Sí (Budget + Pre-check)| `task.create` / `workflow.execute` |

---

## 8. Propuesta de Arquitectura de Información UX para el Enterprise Control Plane

Para unificar la visibilidad holística y la operación gobernada sin sobrecargar las pantallas existentes, se propone consolidar la arquitectura de navegación en **5 dominios funcionales integrados**:

```
Enterprise Control Plane UX Architecture
│
├── 1. Dashboard Ejecutivo & Telemetría
│   ├── Overview Operacional (Pipeline 6-fases, estado del motor, SSE)
│   ├── Métricas Agregadas de Portafolios y Empresas
│   └── Alertas de Gobernanza y Paradas de Emergencia
│
├── 2. Portafolios & Gobernanza Multi-Empresarial
│   ├── Vista Jerárquica de Portafolios y Empresas Miembro
│   ├── Árbol de Mandatos de Gobernanza (Concesión, Revocación, Autonomía)
│   ├── Consolidación Determinista de Objetivos (KPIs sin inferencia LLM)
│   ├── Reconciliación de Mandatos (Fase 77: visor de impacto y disparador manual)
│   └── Evaluador Interactivo de Autoridad Inter-Empresarial (Dry-Run)
│
├── 3. Organización Virtual & Cadena Estratégica
│   ├── Empresas, Organizaciones, Áreas y Equipos
│   ├── Presupuestos Operacionales de Equipos y Límites de Gasto
│   ├── Agentes de Primera Clase (Perfiles, Roles y Capacidades Verificadas)
│   └── Objetivos de Negocio, Iniciativas y Métricas Locales
│
├── 4. Operaciones, Workflows & Supervisión Humana
│   ├── Orquestación de Workflows (DAGs, asignación gobernada)
│   ├── Ejecuciones en Runtime y Trazabilidad Distribuida
│   ├── Verificación Desacoplada de Pasos (Execution vs Verification)
│   └── Bandeja de Supervisión y Aprobaciones Humanas (SoD)
│
└── 5. Centro de Seguridad, Evidencia & Auditoría
    ├── Credenciales API, Identidades OIDC y Asignación de Roles RBAC
    ├── Exportación de Evidencia de Cumplimiento (Fase 78: 9 alcances, sellado SHA-256)
    ├── Visor Forense de Eventos Durables SQLite WAL (Filtros, Paginación, Detalle)
    └── Diagnósticos de Runtime, Integridad WAL y Liveness Probes
```

---

## 9. Inventario de Brechas (Gap Analysis)

### 9.1. Backend Gaps: `0`
* Los endpoints REST (`/api/v1/portfolios/*`, `/api/v1/mandates/*`, `/api/v1/portfolio-objectives/*`, `/api/v1/governance/evidence/export`, `/api/v1/approvals/*`, `/api/v1/workflows/*`) se encuentran **100% implementados, testeados y operativos** en `src/platform/api/http-router.ts`.
* Los métodos SDK de TypeScript en `src/platform-client/index.ts` cubren la totalidad de los contratos.

### 9.2. Frontend Gaps (Superficies UI Pendientes de Construir):
1. **Evidence Export Panel (`#tab-evidence` o sub-panel en `#tab-security` / `#tab-portfolios`):**
   - Selector interactivo de los 9 alcances (`TENANT`, `PORTFOLIO`, `ENTERPRISE`, `WORKFLOW`, `EXECUTION`, `MANDATE`, `APPROVAL`, `RECONCILIATION`, `AUDIT_TRAIL`).
   - Controles de rango temporal (`fromDate`, `toDate` con validación de $\le 90$ días) y límite de registros ($\le 1000$).
   - Visor de manifiesto con hash de integridad SHA-256 y botón de descarga de paquete JSON canónico.
2. **Mandate Reconciliation Dashboard (`#tab-portfolios` sub-sección Reconciliación):**
   - Tabla de estado de mandatos (activos, expirados, revocados).
   - Botón de conciliación puntual (`POST /mandates/:id/reconcile`) y barrido general (`POST /mandates/reconcile-expired`).
   - Visor de impacto que desglose recursos afectados (workflows pausados/cancelados, aprobaciones rechazadas) según las reglas deterministas de la Fase 77.
3. **Portfolio Management Modals:**
   - Modal para asociar/desasociar empresas miembros a un portafolio.
   - Modal para registrar y activar objetivos consolidados de portafolio y vincular métricas empresariales.
   - Formulario para otorgar nuevos mandatos de autoridad inter-empresarial (`POST /portfolios/mandates`).
4. **I18n Coverage:**
   - Incorporar las nuevas claves de internacionalización en `locale-es-419.js` y `locale-en.js` para los módulos de evidencia, reconciliación y portafolios.

### 9.3. Security Gaps: `0`
* El modelo frontend mantiene 0 vulnerabilidades de inyección HTML mediante construcción pura del DOM.
* La autenticación y autorización se aplican exclusivamente en el backend (Zero-Trust UI).

---

## 10. Estrategia de Pruebas para la Futura Implementación

Cuando se autorice la implementación de la interfaz del Control Plane, la suite de pruebas deberá cubrir:
1. **Hexagonal Boundary Invariant Tests:**
   - Verificar que ningún archivo en `src/platform/web/` importe módulos internos de `src/domain/`, `src/application/` o `src/infrastructure/`.
2. **Security & XSS Prevention Tests:**
   - Análisis estático AST/regex verificando estricto **0 `.innerHTML`, 0 `.outerHTML`, 0 `eval()`, 0 `document.write()`**.
3. **DOM Rendering & Contract Tests:**
   - Pruebas unitarias de renderizado de tablas, badges de estado, modales y formularios en `tests/platform/`.
4. **I18n Parity Tests:**
   - Verificación de paridad exacta de claves entre `locale-es-419.js` y `locale-en.js`.
5. **End-to-End User Flows:**
   - Flujo de exportación de evidencia con validación de descarga de JSON y visualización del hash SHA-256 entregado por el backend.
   - Flujo de disparo de reconciliación de mandato y renderizado del reporte de impacto.

---

## 11. Riesgos de Rendimiento y Mitigaciones

| Riesgo de Rendimiento | Severidad | Mitigación Arquitectónica |
| :--- | :--- | :--- |
| **Tablas masivas de eventos o auditoría** | Media | Paginación gobernada basada en cursores (`afterSequence`, `beforeSequence`) con límites estrictos (`limit=50`). |
| **Sondeo excesivo (Polling Overhead)** | Media | Reutilización de Server-Sent Events (SSE) reactivo (`/api/v1/events/stream`) con fallback inteligente a sondeo suave (15s). |
| **Descarga de paquetes de evidencia pesados** | Baja | Límite forzado en backend de 1,000 registros por paquete y 90 días máximos; serialización en streaming en memoria sin saturar el hilo principal. |
| **Re-renderizado innecesario del DOM** | Baja | Actualización granular de nodos DOM específicos mediante IDs unívocos en lugar de limpiar y reconstruir contenedores completos. |

---

## 12. Secuencia Recomendada de Implementación (Roadmap Futuro)

1. **Paso 1: Catálogos de I18n (`src/platform/web/i18n/`):**
   - Declarar todas las claves bilingües para portafolios, mandatos, reconciliación y exportación de evidencia.
2. **Paso 2: Cliente API Web (`src/platform/web/api-client.js`):**
   - Completar wrappers tipados para `exportEvidence()`, `reconcileMandate()`, `reconcileExpiredMandates()`, `createPortfolioObjective()`, `linkEnterpriseObjective()`, `grantMandate()`, `revokeMandate()`.
3. **Paso 3: Vistas y Modales de Portafolios y Reconciliación (`src/platform/web/index.html` & `app.js`):**
   - Enriquecer `#tab-portfolios` con la consola de mandatos, panel de reconciliación determinista y formularios de gestión de objetivos.
4. **Paso 4: Consola de Exportación de Evidencia y Cumplimiento (`src/platform/web/`):**
   - Construir la interfaz de generación y visualización de paquetes de auditoría sellados con SHA-256.
5. **Paso 5: Suite de Pruebas de Plataforma y Certificación:**
   - Ejecutar suite completa (invariantes de aislamiento, cero innerHTML, paridad i18n y pruebas funcionales).

---

## 13. Veredicto de Discovery

* **Estado de `AOP-PORTFOLIO-UI` en Roadmap:** `ANALYSIS` (Documentación formal de Discovery completada; diseño arquitectónico validado; listo para plan de implementación en siguiente fase).
* **Conformidad Arquitectónica:** **100% ALINEADA** con los axiomas de la plataforma (0 dependencias externas, 0 inferencia LLM en agregaciones, 0 mutación retroactiva, seguridad fail-closed y arquitectura hexagonal estricta).

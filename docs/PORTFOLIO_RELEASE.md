# AI Operating Platform (v1.1.0) &mdash; Portfolio Release

## Resumen Ejecutivo de Arquitectura y Capacidades

La **AI Operating Platform (v1.1.0)** es una infraestructura empresarial completa para orquestar agentes de inteligencia artificial, gobernar modelos de lenguaje bajo principios de *Default-Deny*, persistir eventos inmutables en SQLite WAL y habilitar la construcción de aplicaciones complejas mediante un plano de control SaaS y una fábrica de aplicaciones (*AI Application Factory*).

---

## Principios Rectores

1. **Aislamiento Arquitectónico Estricto:**
   $$\text{CORE ENGINE} \neq \text{PLATFORM PRODUCT} \neq \text{APPLICATIONS} \neq \text{EXTERNAL SERVICES}$$
2. **Cero Dependencias Externas en Tiempo de Ejecución en el Core Engine:**
   El motor principal utiliza TypeScript y módulos nativos de Node.js, garantizando determinismo, seguridad ante ataques de cadena de suministro (*supply chain*) y portabilidad extrema.
3. **Seguridad Fail-Closed (Default-Deny):**
   Ninguna llamada a herramientas, modelos o agentes se ejecuta sin un contexto de seguridad autenticado y una evaluación explícita de políticas de autorización por roles (RBAC) y presupuesto de autonomía (*Autonomy Budget*).
4. **Persistencia Durable Inmutable:**
   Todos los eventos de dominio se registran con secuencia estrictamente monótona en un ledger SQLite con modo WAL (*Write-Ahead Logging*).
5. **Verdad Técnica Honesta (Truth Mode):**
   La plataforma y su consola nunca inventan métricas ni simulan integraciones activas cuando no están configuradas en el entorno.

---

## Módulos Principales de la Plataforma

```text
ai-operating-platform/
├── src/
│   ├── domain/               # Entidades puras y reglas invariantes de negocio
│   │   ├── agent/            # Declaración de agentes, versiones e instrucciones
│   │   ├── application/      # Manifiestos de apps, contratos de capacidades
│   │   ├── autonomy/         # Presupuestos, FSM de operaciones y planes
│   │   ├── billing/          # Cuotas de consumo y planes de suscripción
│   │   ├── model/            # Gateways y routers de modelos de inferencia
│   │   ├── security/         # Autenticación, RBAC, límites de confianza
│   │   ├── task/             # Ciclo de vida de tareas y transiciones
│   │   └── tenant/           # Aislamiento multi-inquilino (FREE, PRO, BUSINESS, ENTERPRISE)
│   ├── application/          # Casos de uso, orquestación y adaptadores
│   │   ├── autonomy/         # AutonomousOrchestrator y PlanExecutionEngine
│   │   ├── diagnostics/      # Reconstrucción de trazas y análisis de fallos
│   │   ├── governance/       # Auditoría inmutable y matriz de riesgo
│   │   ├── platform/         # Tentaciones AI Commerce & AR Fitting Room
│   │   ├── recovery/         # Reconciliación tras reinicios o fallos
│   │   └── security/         # Evaluador RBAC y ejecutor de límites
│   ├── infrastructure/       # Implementaciones concretas de puertos
│   │   ├── config/           # IntegrationTruthEngine y verificadores
│   │   ├── model/            # Gateways reales (OpenAI, Anthropic, Ollama, Stub)
│   │   ├── observability/    # Audit logs, métricas y exportador OpenTelemetry
│   │   ├── persistence/      # Repositorios SQLite WAL y PostgreSQL
│   │   └── tools/            # Registro e invocación segura de herramientas
│   ├── platform/             # API REST versionada (/api/v1) y Consola Web
│   └── platform-client/      # SDK tipado para TypeScript y JavaScript
```

---

## Aplicación de Referencia: Tentaciones AI Commerce

Tentaciones demuestra el consumo externo desacoplado de la plataforma:
* **Catálogo Realista:** Soporte de calzado, indumentaria y accesorios con variantes completas (SKU, talla, color, precio, stock).
* **Descubrimiento por IA:** Búsqueda en lenguaje natural en español con extracción de intenciones y sin alucinación de catálogo.
* **Probador Virtual 3D / AR:** Resolución de identificadores URN (`urn:tentaciones:ar:...`), recomendación biométrica de tallas con perfiles de avatares (Nova, Sora, Mateo) y visualizador 3D.
* **Asistencia en Carrito & Checkout:** Consultas sobre subtotal, cálculo del umbral de envío gratis, validación estricta de stock antes de mutar y soporte para Webpay Demo.

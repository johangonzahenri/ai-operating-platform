# Registro de Aplicaciones del Ecosistema (Application Registry)

Este registro documenta de manera formal las aplicaciones satélites del ecosistema gobernado por la **AI Operating Platform**, especificando su nivel de integración, capacidades consumidas, ciclo de vida, nivel de confianza y estado de verificación.

---

## Invariante Fundamental del Ecosistema

```text
CORE ENGINE != PLATFORM PRODUCT != APPLICATIONS
PLATFORM PRODUCT != APPLICATION
APPLICATION != EXTERNAL SERVICE
```

Las aplicaciones del ecosistema son **entidades de negocio independientes** que son dueñas de sus catálogos, lógica de inventario, carritos de compra y políticas comerciales. Consumen inteligencia artificial, automatizaciones y servicios de gobernanza de la plataforma a través de contratos REST seguros mediante `PlatformClient`.

---

## 1. Aplicaciones Registradas

### 1.1 Tentaciones AI Commerce (`tentaciones-commerce`)
* **Descripción:** Plataforma de comercio electrónico para retail de vestuario femenino con recomendación inteligente, búsqueda semántica en lenguaje natural y probador virtual 3D/AR.
* **Estado Oficial:** `IMPLEMENTED / LIVE ADAPTER`
* **Nivel de Integración con Plataforma:** Integración profunda mediante `TentacionesPlatformAdapter` sobre `PlatformClient`.
* **Capacidades Consumidas:**
  - `product.discovery`: Búsqueda asistida por lenguaje natural y categorización semántica.
  - `product.recommendation`: Algoritmo determinista de recomendaciones según perfil y temporada.
  - `product.compare`: Análisis comparativo de atributos y ficha técnica de prendas.
  - `cart.assistance`: Asistencia de carrito, validación de inventario y cálculo de envíos.
  - `ar.fitting_room`: Probador virtual AR con cálculo de talla por perfil biométrico y renderizado 3D URN (`urn:ar:apparel:*`).
* **Estrategia de Contingencia (Fallback):**
  - Si la plataforma está en línea: Despacho a través de `PlatformClient` a la API REST.
  - Si la plataforma no está disponible: Conmutación transparente a `LOCAL_FALLBACK` (motor local determinista en memoria) o `TRADITIONAL_COMMERCE` sin interrupción de la tienda.
* **Nivel de Confianza (Trust Level):** `MANAGED_COMMERCE` (Tenant autenticado con capacidades de e-commerce habilitadas).
* **Ciclo de Vida:** Operacional en tests end-to-end de golden journey y pruebas de catálogo realista.
* **Dependencias Externas:** Ninguna requerida en runtime (soporta simulación de pasarela Webpay Demo para checkout determinista).
* **Tests de Verificación:**
  - `tests/platform/tentaciones-platform-adapter.test.ts`
  - `tests/unit/e2e-tentaciones-golden-journey.test.ts`
  - `tests/unit/tentaciones-live-integration.test.ts`
  - `tests/unit/tentaciones-product-completion.test.ts`
  - Total: 48 tests pass.
* **Documentación:** `docs/TENTACIONES_PLATFORM_INTEGRATION.md`, `docs/case-study-tentaciones.md`, `docs/AI_COMMERCE.md`, `docs/AR_VIRTUAL_FITTING.md`.

---

### 1.2 Vehicle Parts Reference Platform (`vehicle-parts-platform`)
* **Descripción:** Aplicación de referencia empresarial para catálogo de repuestos automotrices, verificación determinista de compatibilidad mecánica (marca, modelo, año, motor) y asistencia técnica de taller.
* **Estado Oficial:** `IMPLEMENTED / REFERENCE APP`
* **Nivel de Integración con Plataforma:** Desplegada como aplicación de referencia sobre el Application Factory 2.0.
* **Capacidades Consumidas:**
  - `parts.discovery`: Identificación de piezas automotrices mediante descripción en lenguaje coloquial o código OEM.
  - `parts.compatibility`: Validación técnica de ajuste mecánico determinista basada en especificaciones de motor y chasis.
  - `parts.compare`: Comparativa técnica entre repuestos originales (OEM) y alternativos de alta durabilidad.
  - `cart.validation`: Control de stock pre-mutación y reserva atómica de inventario.
* **Estrategia de Contingencia (Fallback):** Degradación a catálogo estático determinista ante indisponibilidad del servicio de IA.
* **Nivel de Confianza (Trust Level):** `ENTERPRISE_REFERENCE` (Micro-frontend gobernado dentro del Web Control Plane).
* **Ciclo de Vida:** Verificada en suite de compatibilidad automotriz multi-categoría.
* **Dependencias Externas:** Ninguna. Catálogo e inventario gestionados localmente.
* **Tests de Verificación:**
  - `tests/unit/vehicle-parts-reference-app.test.ts` (16 tests pass).
* **Documentación:** `docs/VEHICLE_PARTS_REFERENCE.md`, `docs/APPLICATION_FACTORY.md`.

---

### 1.3 Enterprise Support Agent (`enterprise-support-agent`)
* **Descripción:** Sistema de atención y soporte técnico empresarial multicanal con triaje automatizado, clasificación de tickets por severidad y escalamiento a agentes humanos.
* **Estado Oficial:** `DESIGNED / SPECIFIED`
* **Nivel de Integración con Plataforma:** Especificada formalmente para despacho sobre `MultiAgentCoordinator` y agentes con perfil `support-agent`.
* **Capacidades Consumidas:**
  - `ticket.triage`: Análisis de intención y clasificación de urgencia.
  - `ticket.resolution`: Consulta de bases de conocimiento y resolución autónoma de incidentes frecuentes.
  - `ticket.escalate`: Generación de resumen contextual para traspaso a soporte de nivel 2.
* **Estrategia de Contingencia (Fallback):** Enrutamiento directo a bandeja de entrada humana.
* **Nivel de Confianza (Trust Level):** `INTERNAL_ENTERPRISE` (Acceso acotado a datos de tickets y registros de auditoría).
* **Ciclo de Vida:** En backlog de implementación para fases posteriores.
* **Dependencias Externas:** Integración planificada con webhooks de helpdesk corporativo.
* **Tests de Verificación:** Pendiente (cero tests en runtime actual).
* **Documentación:** `docs/APPLICATION_ECOSYSTEM.md`, `docs/MULTI_APPLICATION_ECOSYSTEM.md`.

---

## 2. Matriz de Estado del Ecosistema de Aplicaciones

| Identificador | Nombre Comercial | Estado | Tipo de Integración | Capabilities | Tests | Fallback Garantizado |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `tentaciones-commerce` | Tentaciones AI Commerce | **IMPLEMENTED** | Adapter + SDK | 5 capacidades | 48 tests PASS | SÍ (`LOCAL_FALLBACK`) |
| `vehicle-parts-platform`| Vehicle Parts Platform | **IMPLEMENTED** | Reference App | 4 capacidades | 16 tests PASS | SÍ (`STATIC_CATALOG`) |
| `enterprise-support-agent`| Enterprise Support Agent | **DESIGNED** | Agent Profile | 3 capacidades | 0 tests (Diseñado) | SÍ (`HUMAN_ROUTING`) |

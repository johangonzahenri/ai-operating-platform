# Cartera Oficial de Aplicaciones (Application Portfolio)
## Arquitectura del Portafolio, Relación Plataforma-Hijo y Ciclo de Vida

---

## 1. La Plataforma Padre (Platform Parent)

La **AI Operating Platform** (`PROJ-00-PLATFORM`) actúa como la plataforma central de servicios, gobernanza, ejecución autónoma y persistencia relacional. 

### Principio Fundamental:
$$\text{Core Engine} \neq \text{Platform Product} \neq \text{Child Applications}$$

* **Core Engine (`src/domain/`, `src/infrastructure/`)**: Máquinas de estado de tareas, bucles de ejecución, políticas fail-closed de seguridad, persistencia SQLite WAL y store de eventos duraderos.
* **Platform Product (`src/platform/api/`, `src/platform/web/`)**: API REST estándar (`/api/v1/*`), enrutador HTTP nativo, consola de control web unificada (0 `.innerHTML`) y SDK de cliente `@ai-platform/client`.
* **Child Applications (Aplicaciones Hijas)**: Aplicaciones de negocio especializadas que consumen capacidades cognitivas, flujos de trabajo y servicios de orquestación de la plataforma sin duplicar el motor central.

---

## 2. Inventario de Aplicaciones de la Cartera

### 2.1. Proyecto 01: Tentaciones AI Commerce (`PROJ-01-TENTACIONES`)
* **Propósito**: E-Commerce inteligente para retail de moda femenina y deportiva con probador virtual 3D/AR, búsqueda en lenguaje natural y asistencia de carrito.
* **Dominio de Negocio**: Retail, Fashion, E-Commerce.
* **Estado Actual**: **`PARTIAL / LIVE ADAPTER`** (Lógica de negocio, adaptador de plataforma, probador AR y simulación Webpay Demo implementados en `src/application/platform/` con 48 tests pasando).
* **Capacidades Consumidas**: `product.discovery`, `product.recommendation`, `product.compare`, `cart.assistance`, `ar.fitting_room`.
* **Estrategia de Contingencia**: Conmutación automática a `LOCAL_FALLBACK` o `TRADITIONAL_COMMERCE` ante desconexión de la plataforma.

### 2.2. Proyecto 02: Spare Parts Store (`PROJ-02-SPAREPARTS`)
* **Propósito**: Tienda especializada en catálogo automotriz con verificación determinista de compatibilidad mecánica (marca, modelo, año, motor) y diagnóstico asistido por IA.
* **Dominio de Negocio**: Automotriz, Repuestos, Servicios Mecánicos.
* **Estado Actual**: **`PARTIAL / REFERENCE APP`** (Motor de compatibilidad y catálogo de referencia implementados con 16 tests pasando).
* **Capacidades Consumidas**: `parts.discovery`, `parts.compatibility`, `parts.compare`, `cart.validation`.
* **Estrategia de Contingencia**: Degradación a catálogo estático determinista ante fallas de red.

### 2.3. Proyecto 03: Fleet Management (`PROJ-03-FLEET`)
* **Propósito**: Sistema de gestión de flotas vehiculares, telemetría IoT en tiempo real, optimización de rutas de reparto y despacho asistido por agentes.
* **Dominio de Negocio**: Logística, Transporte, Cadena de Suministro.
* **Estado Actual**: **`PLANNED`** (Ficha arquitectónica definida; sin código fuente).
* **Capacidades Consumidas**: `fleet.telemetry`, `route.optimization`, `maintenance.predictive`, `dispatch.agent`.
* **Estrategia de Contingencia**: Enrutamiento estático basado en geolocalización tradicional.

### 2.4. Proyecto 04: Customer Portal (`PROJ-04-PORTAL`)
* **Propósito**: Portal de autoservicio y soporte omnicanal para clientes con triaje automático de tickets por severidad, resolución asistida y escalamiento a humanos con Segregación de Funciones (SoD).
* **Dominio de Negocio**: Customer Experience (CX), Helpdesk, Soporte Técnico.
* **Estado Actual**: **`PLANNED`** (Ficha arquitectónica definida; sin código fuente).
* **Capacidades Consumidas**: `ticket.triage`, `ticket.resolution`, `ticket.escalate`, `human.oversight`.
* **Estrategia de Contingencia**: Enrutamiento directo a bandeja de entrada humana tradicional.

### 2.5. Proyecto 05: Analytics AI (`PROJ-05-ANALYTICS`)
* **Propósito**: Centro de inteligencia empresarial (BI) y recolección de métricas de negocio con generación de informes ejecutivos, detección de anomalías y predicción de KPIs.
* **Dominio de Negocio**: Business Intelligence, Auditoría Estratégica, Dirección Ejecutiva.
* **Estado Actual**: **`PLANNED`** (Ficha arquitectónica definida; sin código fuente).
* **Capacidades Consumidas**: `metric.harvesting`, `report.synthesis`, `anomaly.detection`, `executive.briefing`.
* **Estrategia de Contingencia**: Visualización de tablas y agregaciones SQL locales en tiempo real.

---

## 3. Relación Arquitectónica Padre → Hijo

Las aplicaciones hijas respetan rigurosamente el **Contrato de Aplicación (Application Contract)**:

```text
[Aplicación Hija]
       │
       ▼ (Llamadas de alto nivel a funciones de negocio)
[Adaptador de Aplicación (e.g. TentacionesPlatformAdapter)]
       │
       ▼ (Contratos REST tipados, gestión de reintentos y tokens)
[PlatformClient SDK (@ai-platform/client)]
       │
       ▼ (HTTP/1.1 o HTTP/2 + TLS + Zero-Trust Headers)
[Platform REST API (/api/v1/*)]
       │
       ▼ (Aislamiento Multi-Tenant, RBAC, Control de Presupuesto)
[AI Operating Platform Core Engine]
```

### Invariantes de No-Duplicación:
* Las aplicaciones hijas **NUNCA** implementan sus propios orquestadores autónomos, almacenes de eventos de auditoría, gateways de políticas de seguridad ni motores de modelos LLM.
* Toda interacción con modelos de IA (OpenAI, Anthropic, Ollama, Gemini) se delega a la plataforma padre para garantizar trazabilidad, auditoría inmutable y control presupuestario.

---

## 4. Estrategia de Repositorios y Control de Versiones

### 4.1. Repositorios Separados (Polyrepo)
Cada aplicación del portafolio se mantiene en un repositorio Git independiente para asegurar:
1. **Desacoplamiento Estricto**: Cero importaciones accidentales del código interno de la plataforma.
2. **Presentación Profesional de Portafolio**: Repositorios autónomos con documentación, capturas y pipelines propios en GitHub.
3. **Control de Acceso y Roles**: Permite asignar permisos a desarrolladores por aplicación sin exponer el motor central.

### 4.2. Desacoplamiento de Versiones (Versioning Separation)
* **Versión de Plataforma (`PLATFORM_VERSION`)**: Sigue su propio ciclo SemVer (ej. `v1.4.0`).
* **Versión de Aplicación (`APPLICATION_VERSION`)**: Cada aplicación evoluciona independientemente (ej. `tentaciones-ai-commerce v1.0.0`, `spare-parts-store v0.2.0`).
* Las aplicaciones declaran compatibilidad con la plataforma mediante el header `X-Application-Version` y validación de matriz de capacidades en el SDK.

---

## 5. Estrategia Tecnológica: Estado Actual vs Propuesto

| Proyecto | Stack Tecnológico Actual | Stack Tecnológico Propuesto para App Standalone |
| :--- | :--- | :--- |
| **`ai-operating-platform`** | TypeScript 5.8, Node.js $\ge 22.0$ Nativo (`node:http`, `node:crypto`, `node:sqlite`), Vanilla JS UI (0 deps). | Continuar en TypeScript Nativo con 0 dependencias externas de runtime. |
| **`tentaciones-ai-commerce`** | Módulos TypeScript en `src/application/platform/`, `PlatformClient`, motor local en memoria, Webpay Demo. | Frontend: HTML5/CSS3/Vanilla JS o React/Next.js; Backend: Node.js/Express o Fastify consumiendo `@ai-platform/client`; 3D: Three.js / WebXR. |
| **`spare-parts-store`** | Módulo de pruebas unitarias `vehicle-parts-reference.test.ts` con catálogo automotriz estructurado. | Frontend: SPA orientada a catálogo técnico; Backend: Node.js consumiendo `@ai-platform/client`. |
| **`fleet-management`** | Especificación arquitectónica en documentación canónica. | Frontend: Dashboard de mapas interactivos (Leaflet/Mapbox); Backend: Node.js con ingestión de telemetría IoT hacia `@ai-platform/client`. |
| **`customer-portal`** | Especificación arquitectónica en documentación canónica. | Frontend: Widget de chat web y portal de tickets; Backend: Webhook receiver conectado a `@ai-platform/client`. |
| **`analytics-ai`** | Especificación arquitectónica en documentación canónica. | Frontend: Dashboard de gráficos SVG/Canvas; Backend: Servicio de reportes conectado a `/api/v1/business/*` y `/api/v1/executive/*`. |

---

## 6. Contrato de Integración de Aplicaciones (Application Contract)

Cualquier aplicación derivada que se incorpore a la plataforma debe cumplir con los siguientes 8 criterios de certificación:

1. **Cliente Unificado**: Comunicación obligatoria mediante `@ai-platform/client` apuntando a `/api/v1/*`.
2. **Contexto de Tenant**: Enviar siempre `callerTenantId` y `applicationId` en los metadatos de solicitud.
3. **Autenticación Segura**: Uso de credenciales API registradas (`X-API-Key` o Bearer Token JWT con rotación asimétrica).
4. **Trazabilidad y Correlación**: Generación de `traceId` único por flujo de usuario y propagación en cabeceras.
5. **Resiliencia y Fallback**: Implementación de degradación elegante (`LOCAL_FALLBACK` o tradicional) ante indisponibilidad del servicio de IA.
6. **Manejo de Errores Tipado**: Mapeo estricto de excepciones `PlatformClientError` con códigos estándar (`SECURITY_UNAUTHENTICATED`, `RATE_LIMIT_EXCEEDED`, etc.).
7. **Internacionalización**: Compatibilidad nativa con códigos de idioma estándar (mínimo `es-419` y `en`).
8. **Estrategia de Pruebas**: Cobertura de tests unitarios y de integración con stubs deterministas sin llamadas de red externas en CI.

---

## 7. Ciclo de Vida de Desarrollo del Portafolio

```text
[1. ESPECIFICACIÓN] ──► [2. ADAPTADOR & CONTRATO] ──► [3. STANDALONE APP SETUP] ──► [4. CERTIFICACIÓN E2E]
   (Ficha Técnica)         (Wrapper PlatformClient)       (Repositorio & UI)           (Tests Golden Journey)
```

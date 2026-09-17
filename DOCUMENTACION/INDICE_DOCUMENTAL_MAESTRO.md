# Índice Documental Maestro & Navegación Canónica
## Hub Central de Documentación — AI Operating Platform (v1.2.0)

Este índice constituye la brújula central de navegación técnica del repositorio, unificando el seguimiento en el **Tablero Kanban**, los proyectos de ingeniería, las fases históricas, los manuales oficiales y los registros de decisiones arquitectónicas.

---

## 1. Hub de Gestión, Proyectos & Tablero Kanban (`DOCUMENTACION/`)

* **[Tablero Maestro Kanban](KANBAN_TABLERO_MAESTRO.md):** Tablero visual consolidado con todas las iniciativas por proyecto, estado y fase.
* **[Auditoría de la Documentación Oficial](AUDITORIA_DOCUMENTACION_OFICIAL.md):** Informe integral de verificación de veracidad, coherencia lingüística y plan de mejora continua.
* **[Mapa de Fases de Ingeniería (1 a 56)](fases/MAPA_DE_FASES_1_A_56.md):** Evolución histórica y técnica desde v0.1 hasta v1.2.0 (1019 tests).
* **[Planilla Excel de Seguimiento](AI_OPERATING_PLATFORM_BACKLOG_KANBAN.xlsx):** Archivo de seguimiento de iniciativas para gestión ejecutiva.

### Proyectos Especializados (`DOCUMENTACION/proyectos/`):
1. **[Proyecto 01: Core Engine & Tiempo de Ejecución Autónomo](proyectos/PROYECTO_01_CORE_ENGINE.md)**
2. **[Proyecto 02: Platform Gateway & Control Plane Web](proyectos/PROYECTO_02_PLATFORM_PRODUCT.md)**
3. **[Proyecto 03: Pasarelas de Modelos & AI Runtime](proyectos/PROYECTO_03_AI_RUNTIME_MODELS.md)**
4. **[Proyecto 04: Seguridad Empresarial & Gobernanza Fail-Closed](proyectos/PROYECTO_04_SECURITY_GOVERNANCE.md)**
5. **[Proyecto 05: Virtual Organization Foundation & Agentes](proyectos/PROYECTO_05_VIRTUAL_ORGANIZATION.md)**
6. **[Proyecto 06: Aplicaciones Satélites del Ecosistema](proyectos/PROYECTO_06_ECOSYSTEM_APPS.md)**
7. **[Proyecto 07: Dispositivos Físicos & Spooler de Hardware](proyectos/PROYECTO_07_HARDWARE_DEVICES.md)**
8. **[Proyecto 08: Infraestructura Cloud & Topología Perimetral](proyectos/PROYECTO_08_CLOUD_INFRASTRUCTURE.md)**

---

## 2. Documentos Rectores Oficiales

| Documento | Ubicación | Idioma | Propósito Canónico |
| :--- | :--- | :--- | :--- |
| **Libro Oficial de Arquitectura** | [`LIBRO_OFICIAL_AI_OPERATING_PLATFORM.md`](../LIBRO_OFICIAL_AI_OPERATING_PLATFORM.md) | `es-419` | Tratado exhaustivo de arquitectura, operaciones, gobernanza y código. |
| **Fuente Única de Verdad** | [`docs/SOURCE_OF_TRUTH.md`](../docs/SOURCE_OF_TRUTH.md) | `es-419` | Jerarquía canónica: Código > Tests > Git > Documentación > Roadmap > Excel. |
| **Manual Oficial de la Plataforma**| [`docs/MANUAL_OFICIAL.md`](../docs/MANUAL_OFICIAL.md) | `es-419` | Guía de arquitectura canónica y referencia técnica integral. |
| **Manual de Arquitectura** | [`docs/MANUAL_ARQUITECTURA.md`](../docs/MANUAL_ARQUITECTURA.md) | `es-419` | Topología hexagonal normativa, capas y dirección de dependencias. |
| **Manual para Desarrolladores** | [`docs/MANUAL_DESARROLLADOR.md`](../docs/MANUAL_DESARROLLADOR.md) | `es-419` | Guía paso a paso para consumo de APIs, SDK, agentes y organización. |
| **Plano de Control Empresarial** | [`docs/CONTROL_PLANE.md`](../docs/CONTROL_PLANE.md) | `es-419` | Especificación de la SPA nativa en Vanilla JS con cero `innerHTML`. |
| **Registro Maestro de Pruebas** | [`docs/TEST_REGISTRY.md`](../docs/TEST_REGISTRY.md) | `es-419` | Inventario factual de las 1019 pruebas pasando al 100%. |
| **Registro de Deuda Técnica** | [`docs/TECHNICAL_DEBT.md`](../docs/TECHNICAL_DEBT.md) | `es-419` | Reporte transparente de brechas técnicas y resoluciones efectuadas. |
| **Índice Maestro de ADRs** | [`docs/DECISIONS.md`](../docs/DECISIONS.md) | `es-419` | Catálogo de decisiones arquitectónicas de ADR 0001 a ADR 0027. |
| **Criterios de Salida de Release**| [`docs/V1_EXIT_CRITERIA.md`](../docs/V1_EXIT_CRITERIA.md) | `es-419` | Especificación formal de requisitos para release masivo (`AOP-V1-EXIT`). |

---

## 3. Registros de Decisiones Arquitectónicas (ADRs Críticos)

* **[ADR 0015: Arquitectura de Persistencia Duradera SQLite WAL](../docs/decisions/0015-durable-persistence-architecture.md)**
* **[ADR 0016: Frontera Formal de Rehidratación de Dominio](../docs/decisions/0016-formal-domain-rehydration-boundary.md)**
* **[ADR 0020: Recuperación y Reconciliación post-Crash](../docs/decisions/0020-crash-recovery-and-restart-reconciliation.md)**
* **[ADR 0021: Almacén Append-Only de Eventos de Dominio](../docs/decisions/0021-durable-events-and-audit-infrastructure.md)**
* **[ADR 0023: Adaptador Google Gemini / Vertex AI Gateway](../docs/decisions/0023-google-gemini-model-gateway.md)**
* **[ADR 0024: Pasarela Duradera de Memoria SQLite](../docs/decisions/0024-sqlite-durable-memory-gateway.md)**
* **[ADR 0025: Autenticación Asimétrica JWT y Rotación de Claves](../docs/decisions/0025-asymmetric-jwt-and-key-rotation.md)**
* **[ADR 0026: Proxy Reverso, TLS y Topología de Red](../docs/decisions/0026-production-reverse-proxy-and-tls.md)**
* **[ADR 0027: Virtual Organization Foundation (Organización, Áreas, Equipos, Agentes)](../docs/decisions/0027-virtual-organization-foundation.md)**

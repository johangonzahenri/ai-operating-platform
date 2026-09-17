# Enterprise Control Plane (Plano de Control Empresarial)
## Especificación y Arquitectura del Plano de Control de la AI Operating Platform (v1.1.0)

El **Enterprise Control Plane** (Plano de Control Empresarial) es la interfaz operacional y de supervisión de la plataforma, diseñada para proporcionar visibilidad en tiempo real, gestión de flota de agentes y observabilidad forense.

---

## 1. Arquitectura de la Interfaz

* **Tecnología:** Single-Page Application (SPA) construida en HTML5 y Vanilla JavaScript estricto.
* **Seguridad del DOM:** Cero uso de `innerHTML`, cero `outerHTML`, cero `eval` y cero `document.write`. Cada nodo se genera mediante llamadas deterministas a `document.createElement` y `textContent`.
* **Zero Runtime Dependencies:** El cliente no requiere empaquetadores externos (Webpack/Vite) para ejecutarse; consume directamente módulos ECMAScript nativos (`import`/`export`).
* **Internacionalización (i18n):** Motor centralizado con soporte bidireccional entre **Español (Latinoamérica)** (`es-419`) por defecto e **Inglés** (`en`), conmutado instantáneamente desde el selector de la barra superior.

---

## 2. Secciones Principales del Control Plane

1. **Platform Operations (Operaciones de Plataforma):**
   * Tarjetas de estado del sistema (Salud global, motor SQLite WAL, EventStore durable).
   * Tabla reactiva de eventos de dominio con filtros por `eventType`, `aggregateType`, `traceId` y límite de paginación.
   * Modal de inspección forense con visualización de carga útil JSON inmutable.
2. **Applications (Ecosistema de Aplicaciones):**
   * Directorio de aplicaciones de negocio gobernadas (Tentaciones AI Commerce, Vehicle Parts Platform).
   * Verificación de contratos de integración, endpoints consumidos y estado de salud.
3. **Agents (Gestión de Agentes):**
   * Inspección de la flota de agentes, modelo LLM asignado, lista blanca de herramientas y activación/desactivación.
4. **Tasks & Executions (Tareas y Ejecuciones):**
   * Explorador de estados de tareas operacionales y líneas de tiempo de ejecución con métricas de duración.
5. **Models Gateway & Tool Registry:**
   * Catálogo de modelos configurados (OpenAI, Claude, Ollama, Stub) y capacidades de herramientas con niveles de riesgo.
6. **Devices & Printing (Dispositivos Empresariales & Impresión):**
   * Monitor de dispositivos locales de hardware (impresora Brother DCP-1600 en puerto `USB001`) y cola de trabajos de impresión (`PrintJobs`).
7. **Diagnostics & Blueprints:**
   * Diagnósticos de integridad de SQLite WAL y diagramas interactivos de la topología hexagonal.
8. **Organizations & Teams (Organizaciones y Equipos - ADR 0027):**
   * Árbol interactivo jerárquico de Organizaciones, Áreas funcionales y Equipos de trabajo.
   * Gestión de ciclo de vida de organizaciones (creación, activación, desactivación, archivado inmutable).
   * Asignación y revocación gobernada de agentes con roles operativos (`LEAD`, `SPECIALIST`, `OPERATOR`, `REVIEWER`).


# Roadmap Oficial de AI Operating Platform
## Estado de Evolución, Hitos Completados y Planificación de Ingeniería (v1.1.0)

Este documento refleja el estado real del desarrollo de la plataforma, fundamentado estrictamente en la evidencia técnica y commits verificados del repositorio.

---

## 1. Hitos Completados (COMPLETADO)

### Bloque 1: Cimientos del Core Engine Hexagonal (Fases 1 a 6 / v0.1 - v0.6)
* [x] **Fundación Hexagonal:** Tipos inmutables para `ExecutionContext`, agregados `Task` y `Execution`.
* [x] **Máquina de Estados Finita:** Transiciones legales (`SUBMITTED`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`).
* [x] **Abstracción Provider-Neutral:** Puerto `ModelGateway` y stubs deterministas sin red para testing.
* [x] **Sistema de Capacidades:** Esquemas JSON de herramientas y `PolicyGateway` con seguridad default-deny.
* [x] **Orquestación Secuencial:** Flujos de tareas multi-paso deterministas con acumulación de observaciones.
* [x] **Eventos de Dominio:** Emisión de eventos estructurados inmutables desacoplados del runtime.

### Bloque 2: Platform API & Web Control Plane SPA (Fases 7 a 9 / v0.7 - v0.9)
* [x] **API REST Nativa:** Enrutador HTTP sobre `node:http` con cero dependencias de producción.
* [x] **Web Control Plane SPA:** Interfaz gráfica en HTML5/Vanilla JS sin librerías externas (cero `innerHTML`).
* [x] **Agentes de Primera Clase:** Agregado `Agent`, instrucciones de comportamiento y listas blancas de herramientas.
* [x] **Operaciones Autónomas Acotadas:** Agregado `AutonomousOperation`, presupuestos `AutonomyBudget` y evaluador determinista de decisiones.

### Bloque 3: Persistencia SQLite Durable & Rehidratación Formal (Fases 10 a 11 / v0.10 - v0.11)
* [x] **Motor SQLite Nativo:** Integración de `DatabaseSync` de Node.js 22 en modo WAL con transacciones ACID.
* [x] **Control de Concurrencia Optimista (OCC):** Versionado monótono para prevenir sobrescrituras concurrentes.
* [x] **Rehidratación Formal de Dominio:** Fábricas estáticas (`rehydrate`) eliminando el uso de reflexión (`Reflect.construct`).

### Bloque 4: Planificación LLM, Contexto & Coordinación Multi-Agente (Fases 12 a 14 / v0.12 - v0.14)
* [x] **LLM Planner:** Generación y validación de planes estructurados representados como Grafos Acíclicos Dirigidos (DAG).
* [x] **Contexto Acotado:** Capa de aislamiento de parámetros `BoundedTaskContext`.
* [x] **Coordinación Multi-Agente:** Protocolo tipado de paso de mensajes y orquestador jerárquico acotado por presupuestos globales.
* [x] **Gobernanza de Seguridad Phase 13:** Modelado STRIDE, autenticación por tokens y matriz RBAC fail-closed.
* [x] **Conectores Reales de Inteligencia:** Adaptadores a OpenAI (GPT-4o), Anthropic (Claude 3.5 Sonnet) y Ollama local.

### Bloque 5: Aplicaciones Gobernadas, Comercio & Probador AR 3D (Fases 15 a 20 / v1.0.0-rc)
* [x] **Dynamic Tool Registry:** Sandboxing de ejecución con timeouts individuales y mitigación de Prototype Pollution.
* [x] **Integración Viva Tentaciones:** Asistente conversacional de compras, catálogo de calzado y motor de recomendaciones.
* [x] **Probador Virtual 3D (AR):** Pipeline WebXR con modelos 3D validados mediante firmas criptográficas SHA-256.
* [x] **Prueba Golden Journey E2E:** Flujo completo automatizado desde búsqueda con IA hasta checkout gobernado.

### Bloque 6: Producción, SaaS Multi-Tenant & Dispositivos Empresariales (Fases 21 a 53 / v1.1.0)
* [x] **Documentación Integral de Ingeniería:** Libro oficial de 45,000 palabras y manuales de arquitectura.
* [x] **Contenedores de Producción:** Dockerfile multi-stage ligero con ejecución en usuario no privilegiado.
* [x] **Telemetría OpenTelemetry:** Métricas de latencia, contadores de tokens y trazas distribuidas estandarizadas.
* [x] **Application Factory & Ecosistema:** Generador de micro-frontends y registro de extensiones verificadas.
* [x] **Aplicación de Referencia de Repuestos:** Plataforma e-commerce automotriz con motor de compatibilidad de partes.
* [x] **Dispositivos Empresariales & Spooler de Impresión:** Adaptador para impresora Brother DCP-1600 series en puerto `USB001` y cola de `PrintJob`.

---

## 2. Hito Actual (EN DESARROLLO)

### Fase 54: Manual Oficial, Documentación Canónica e Internacionalización Web (Prompt 99)
* [x] **Manual Oficial Canónico (`docs/MANUAL_OFICIAL.md`):** Estructura canónica de 34 secciones en Español Latinoamericano.
* [x] **Manuales Especializados:** Manual de Arquitectura, Manual Operacional y Manual para Desarrolladores.
* [x] **Glosario Oficial Normativo:** 26 términos clave con definición, función, relación y nombre en código.
* [x] **Arquitectura Centralizada de Internacionalización (i18n):** Motor `I18nService`, catálogos simétricos `locale-es-419.js` y `locale-en.js`.
* [x] **Selector de Idioma Accesible en UI:** Selector visible en el Control Plane para alternancia instantánea `ES ↔ EN` preservando el estado operativo sin recargar la página.

---

## 3. Planificado a Corto y Mediano Plazo (PLANIFICADO)

* [ ] **Memoria Semántica Durable en SQLite:** Motor de búsqueda por similitud vectorial embebido directamente sobre SQLite (usando extensiones vectoriales o tablas FTS5 con embeddings locales).
* [ ] **Pre-emption de Sockets de Modelos Remotos:** Capacidad de interrumpir conexiones HTTP/2 activas hacia APIs de LLM cuando se active un token de cancelación cooperativo.
* [ ] **Cuotas de Retención Histórica Automatizadas:** Purga configurable de eventos de auditoría y trazas basada en políticas de retención empresarial (TTL y compresión de particiones antiguas).

---

## 4. Visión de Futuro y Exploración Arquitectónica (FUTURO)

* [ ] **Clustering Multi-Nodo con Replicación Raft:** Extensión del modelo de persistencia para permitir topologías de alta disponibilidad multi-nodo con consenso distribuido.
* [ ] **Soporte de Dispositivos de Impresión de Red (IPP / LPR):** Conectores de red directos para impresoras industriales térmicas sin dependencia de conexión USB local.
* [ ] **Evaluación Formal de Seguridad Continua (Automated Red Teaming):** Agente supervisor autónomo que genere pruebas adversariales de inyección de prompt contra la pasarela de políticas.

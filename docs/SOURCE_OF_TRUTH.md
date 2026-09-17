# Política Oficial de Fuente de Verdad (Source of Truth Policy)

## 1. Declaración de Principio Supremo

En el ecosistema **AI Operating Platform**, la veracidad técnica y la integridad documental se rigen por el principio inquebrantable de evidencia demostrable:

$$\text{IMPLEMENTACIÓN REAL} \longrightarrow \text{TESTS / EVIDENCIA} \longrightarrow \text{DOCUMENTACIÓN OFICIAL} \longrightarrow \text{ROADMAP} \longrightarrow \text{KANBAN / EXCEL}$$

Ningún documento, roadmap ni hoja de cálculo tiene autoridad para declarar capacidades que no estén respaldadas por código fuente compilable y suites de pruebas automatizadas verificadas.

---

## 2. Jerarquía de Autoridad Canónica

Cuando surja cualquier discrepancia, ambigüedad o contradicción entre diferentes fuentes de información del repositorio, la resolución se rige estrictamente por la siguiente precedencia:

```text
┌─────────────────────────────────────────────────────────────┐
│ 1. CÓDIGO FUENTE REAL (src/)                                │  <- Máxima Autoridad
├─────────────────────────────────────────────────────────────┤
│ 2. PRUEBAS AUTOMATIZADAS & EVIDENCIA (tests/)               │  <- Validación Factual
├─────────────────────────────────────────────────────────────┤
│ 3. REGISTRO GIT & COMMITS HISTÓRICOS                        │  <- Trazabilidad Temporal
├─────────────────────────────────────────────────────────────┤
│ 4. DOCUMENTACIÓN OFICIAL CANÓNICA (docs/, LIBRO_OFICIAL)    │  <- Especificación Vigente
├─────────────────────────────────────────────────────────────┤
│ 5. ROADMAP MAESTRO (docs/ROADMAP_MASTER.md, ROADMAP.md)     │  <- Planificación Verificada
├─────────────────────────────────────────────────────────────┤
│ 6. HERRAMIENTAS DERIVADAS (Excel, Kanban, Dashboards)       │  <- Vistas de Seguimiento
└─────────────────────────────────────────────────────────────┘
```

### Reglas de Resolución Específicas:

1. **Código vs. Documentación:** Si la documentación describe una capacidad inexistente o diferente al código fuente, la documentación está desactualizada y **debe ser corregida inmediatamente**. Bajo ninguna circunstancia se debe reportar la capacidad como operativa.
2. **Código vs. Tests:** Si el código no supera sus pruebas automatizadas, la funcionalidad se clasifica como `BROKEN` o `IN_PROGRESS`, nunca como `DONE`. Los tests definen la especificación verificable del contrato.
3. **Roadmap vs. Evidencia:** Si un hito del roadmap aparece marcado como completado pero carece de tests o adaptadores en `src/`, su estado debe degradarse inmediatamente a `PLANNED` o `IN_PROGRESS`.
4. **Excel vs. Repositorio:** Las hojas de cálculo (`AI_Operating_Platform_Roadmap.xlsx`) son **vistas de seguimiento derivadas**. Nunca constituyen una fuente de verdad independiente ni reemplazan los archivos del repositorio.

---

## 3. Estados Oficiales de Capacidades y Componentes

Para evitar falsas expectativas operacionales, todo componente debe clasificarse en una de las siguientes categorías canónicas:

| Estado | Definición Operativa | Criterio de Evidencia |
| :--- | :--- | :--- |
| **`IMPLEMENTED`** | Código fuente completo, integrado en la arquitectura y validado por pruebas unitarias/contrato. | Archivos en `src/`, suite en `tests/`, 100% passing. |
| **`CONFIGURED`** | Componente implementado que cuenta con configuración activa (variables de entorno, claves, credenciales). | Configuración presente en el entorno de ejecución. |
| **`UNCONFIGURED`** | Adaptador implementado cuyo uso en tiempo de ejecución requiere credenciales externas ausentes. | Código presente, pero API key o daemon no configurados. |
| **`AVAILABLE`** | Servicio listo para recibir y procesar peticiones en el runtime actual. | Healthcheck responde `READY` o `CONNECTED`. |
| **`UNAVAILABLE`** | Servicio implementado pero temporalmente inalcanzable (hardware desconectado, daemon apagado). | Healthcheck reporta `OFFLINE` o `UNAVAILABLE`. |
| **`PARTIAL`** | Arquitectura y contratos definidos con implementación incompleta o pendiente de wiring por defecto. | Código presente pero limitado a ciertos casos o puertos. |
| **`DESIGNED`** | Especificación formal, contratos o ADR aprobados, pero sin código funcional en `src/`. | ADR en `docs/decisions/`, sin implementación ejecutable. |
| **`NOT_IMPLEMENTED`** | Funcionalidad identificada en el backlog o visión pero sin adaptador en el código. | Ausencia total de código en `src/`. |
| **`DEPRECATED`** | Componente operativo marcado formalmente para reemplazo o retiro en fases posteriores. | Marcado con `@deprecated` y documentado en ADR. |

---

## 4. Reglas de Verdad para Áreas Sensibles

### 4.1 Proveedores de Modelos de Inteligencia Artificial (Model Gateways)
* **OpenAI (`OpenAIModelGateway`):** `IMPLEMENTED` como adaptador de código. Si no se provee `OPENAI_API_KEY`, su estado operativo es `UNCONFIGURED`.
* **Anthropic (`AnthropicModelGateway`):** `IMPLEMENTED` como adaptador de código. Si no se provee `ANTHROPIC_API_KEY`, su estado operativo es `UNCONFIGURED`.
* **Ollama (`OllamaModelGateway`):** `IMPLEMENTED` como adaptador de código. Si el daemon local `http://127.0.0.1:11434` no está activo, su estado es `UNAVAILABLE`.
* **Stub Determinista (`StubModelGateway`):** `IMPLEMENTED` y `AVAILABLE` como motor predeterminado y de contingencia para pruebas y desarrollo.
* **Google Gemini / Vertex AI:** `NOT_IMPLEMENTED`. No existe código de adaptador en `src/infrastructure/model/`. No debe declararse bajo ningún concepto como implementado.

### 4.2 Persistencia y Memoria
* **Persistencia Relacional SQLite WAL:** `IMPLEMENTED` y `AVAILABLE` (`SqliteDatabase`, `SqliteTaskRepository`, `SqliteExecutionRepository`, `SqliteOperationRepository`, `SqliteAgentRepository`, `SqliteEventStore`). Es el controlador por defecto en el servidor de producción.
* **Memoria Duradera en SQLite:** `NOT_IMPLEMENTED`. El sistema cuenta con `InMemoryMemoryGateway`. No existe `SqliteMemoryGateway` en `src/`. La memoria duradera es una brecha documentada en el backlog.

### 4.3 Dispositivos Empresariales e Impresión
* **Adaptador Brother DCP-1600 series:** `IMPLEMENTED` a nivel de software (`BrotherPrinterAdapter`) en puerto local `USB001`.
* **Estado del Hardware Físico:** `DISCONNECTED / OFFLINE` (WorkOffline: true). El adaptador software no debe reportarse como "impresora física en línea" salvo conexión física demostrada.
* **Telemetría de Consumibles (Tóner):** `UNSUPPORTED`. El controlador GDI estándar USB no expone niveles de tóner sin el software propietario del fabricante.

### 4.4 Integraciones de Aplicaciones Satélites
* **Tentaciones AI Commerce:** `IMPLEMENTED` como adaptador de plataforma (`TentacionesPlatformAdapter`), validado por pruebas de integración y contratos end-to-end.
* **Vehicle Parts Reference App:** `IMPLEMENTED` como aplicación de referencia de catálogo y compatibilidad de repuestos automotrices.
* **Enterprise Support Agent:** `DESIGNED` en la arquitectura de casos de uso empresariales.

---

## 5. Política de Idioma Documental (Language Policy)

1. **Documentación Oficial del Repositorio:** Se redacta en **Español Latinoamericano (`es-419`)**, garantizando rigor conceptual, claridad y precisión técnica.
2. **Interfaz de Usuario Web (Web Console):** Soporta modo bilingüe (**Español Latinoamericano** por defecto / **Inglés** seleccionable por el usuario).
3. **Invariantes no Traducibles:** Los siguientes identificadores técnicos permanecen estrictamente en inglés/sin traducir para preservar la compatibilidad con herramientas y código:
   - Rutas y métodos de API (`/api/v1/tasks`, `POST`, `GET`).
   - Métodos y tipos del SDK (`PlatformClient`, `createPlatform`).
   - Nombres de clases, interfaces y archivos (`TaskRepository`, `http-router.ts`).
   - Nombres de campos JSON y esquemas (`taskId`, `executionId`, `traceId`).
   - Códigos de error y tipos de eventos (`TASK_NOT_FOUND`, `execution.completed`).
   - Mensajes de confirmación de Git (formato Conventional Commits: `docs(...)`, `feat(...)`).

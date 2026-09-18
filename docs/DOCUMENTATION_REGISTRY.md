# Registro de Documentación Oficial (Documentation Registry)

Este registro cataloga todos los documentos oficiales, técnicos y manuales operativos de la **AI Operating Platform**, definiendo su propósito, idioma, autoridad canónica y estado de revisión.

---

## 1. Catálogo Canónico de Documentos

| Documento | Propósito | Idioma | Canónico | Estado | Última Revisión | Componentes Relacionados |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `LIBRO_OFICIAL_AI_OPERATING_PLATFORM.md` | Libro y especificación integral de arquitectura de la plataforma en 13 capítulos. | `es-419` | **SÍ** | VIGENTE | 2026-09-17 | Todos los componentes del sistema |
| `docs/LIBRO_OFICIAL_AI_OPERATING_PLATFORM.md` | Espejo sincronizado del Libro Oficial dentro del directorio de documentación. | `es-419` | SÍ (Espejo) | VIGENTE | 2026-09-17 | Todos los componentes del sistema |
| `docs/SOURCE_OF_TRUTH.md` | Jerarquía oficial de autoridad documental y resolución de discrepancias. | `es-419` | **SÍ** | VIGENTE | 2026-09-17 | Gobernanza documental y calidad |
| `docs/ROADMAP_MASTER.md` | Registro granular y estructurado de iniciativas técnicas con identificadores únicos. | `es-419` | **SÍ** | VIGENTE | 2026-09-17 | Roadmap, planificación y backlog |
| `ROADMAP.md` | Resumen ejecutivo de hitos de versión y criterios de cierre de fase. | `es-419` | **SÍ** | VIGENTE | 2026-09-17 | Hitos v0.1 a v1.1 y futuro v1.2 |
| `README.md` | Guía de bienvenida, visión general, arquitectura de capas e instrucciones de arranque. | `es-419` | **SÍ** | VIGENTE | 2026-09-17 | Control Plane, Servidor, Scripts |
| `CHANGELOG.md` | Historial cronológico de cambios notables organizado según Keep a Changelog. | `es-419` | **SÍ** | VIGENTE | 2026-09-17 | Releases v0.1 a v1.1.0 |
| `docs/MANUAL_OFICIAL.md` | Manual operacional para desarrolladores y administradores de la plataforma. | `es-419` | **SÍ** | VIGENTE | 2026-09-17 | Platform API, SDK, CLI, Web UI |
| `docs/MANUAL_ARQUITECTURA.md` | Guía detallada de patrones arquitectónicos, puertos, adaptadores e invariantes. | `es-419` | SÍ | VIGENTE | 2026-09-17 | Hexagonal, CQRS, FSM, WAL |
| `docs/PROMPT_TRACEABILITY.md` | Matriz de trazabilidad de los prompts 94 al 100 con evidencias y commits. | `es-419` | **SÍ** | VIGENTE | 2026-09-17 | Prompts 94-100, Git |
| `docs/ARCHITECTURE_REGISTRY.md` | Inventario detallado de capas, paquetes y responsabilidades del código fuente. | `es-419` | **SÍ** | VIGENTE | 2026-09-17 | `src/` (Core, Domain, Infra, API) |
| `docs/APPLICATION_REGISTRY.md` | Registro de aplicaciones del ecosistema satélite conectadas o integradas. | `es-419` | **SÍ** | VIGENTE | 2026-09-17 | Tentaciones, Vehicle Parts, Support |
| `docs/DEVICE_REGISTRY.md` | Registro de dispositivos físicos comerciales y adaptadores de hardware. | `es-419` | **SÍ** | VIGENTE | 2026-09-17 | Brother DCP-1600, Spooler |
| `docs/SECURITY_REGISTRY.md` | Catálogo de controles de seguridad, aislamiento multi-tenant y mitigaciones. | `es-419` | **SÍ** | VIGENTE | 2026-09-17 | RBAC, Default Deny, Secret Redaction |
| `docs/TEST_REGISTRY.md` | Registro de suites de pruebas automatizadas, contratos y métricas de calidad. | `es-419` | **SÍ** | VIGENTE | 2026-09-18 | `tests/` (1064 tests PASS) |
| `docs/TECHNICAL_DEBT.md` | Registro explícito de brechas técnicas, limitaciones conocidas y deuda técnica. | `es-419` | **SÍ** | VIGENTE | 2026-09-18 | Gaps de autenticación, red, memoria, presupuestos |
| `docs/DECISIONS.md` | Índice maestro y consolidación de Registros de Decisiones Arquitectónicas (ADRs). | `es-419` | **SÍ** | VIGENTE | 2026-09-18 | `docs/decisions/` (ADRs 0001-0028) |
| `docs/V1_EXIT_CRITERIA.md` | Lista de verificación de criterios objetivos para certificación de producción. | `es-419` | **SÍ** | VIGENTE | 2026-09-18 | Production Readiness Gate |
| `docs/RELEASE_CERTIFICATION_V1.md` | Matriz oficial y reporte de certificación de release v1.3.0 (AOP-V1-EXIT). | `es-419` | **SÍ** | VIGENTE | 2026-09-18 | Release Certification Audit |
| `DOCUMENTACION/KANBAN_TABLERO_MAESTRO.md` | Tablero Maestro Kanban multi-proyecto y multi-fase de la plataforma. | `es-419` | **SÍ** | VIGENTE | 2026-09-18 | Roadmap, Fases y Gestión |
| `docs/PLATFORM_API.md` | Especificación de contratos REST, esquemas de payload y códigos de respuesta. | `es-419` | SÍ | VIGENTE | 2026-09-17 | `src/platform/api/` |
| `docs/PLATFORM_CLIENT.md` | Guía de uso del SDK en TypeScript `@ai-platform/client` para aplicaciones satélites. | `es-419` | SÍ | VIGENTE | 2026-09-17 | `src/platform-client/` |
| `docs/OPERATIONAL_CONSOLE.md` | Guía de operación y arquitectura de la interfaz web Single-Page Application. | `es-419` | SÍ | VIGENTE | 2026-09-17 | `src/platform/web/` |
| `docs/REAL_AI_PROVIDERS.md` | Guía de configuración y adaptadores de modelos OpenAI, Anthropic y Ollama. | `es-419` | SÍ | VIGENTE | 2026-09-17 | `src/infrastructure/model/` |
| `docs/BUSINESS_DEVICES.md` | Especificación del adaptador de hardware e impresora comercial Brother. | `es-419` | SÍ | VIGENTE | 2026-09-17 | `src/infrastructure/device/` |
| `docs/APPLICATION_FACTORY.md` | Guía de desarrollo y manifiestos para la Fábrica de Aplicaciones 2.0. | `es-419` | SÍ | VIGENTE | 2026-09-17 | Developer Platform |
| `docs/GLOSARIO.md` | Definiciones formales de términos técnicos y arquitectónicos del sistema. | `es-419` | SÍ | VIGENTE | 2026-09-17 | Conceptos de arquitectura de IA |

---

## 2. Política de Sincronización

1. **Unicidad:** Todo cambio en la arquitectura o en los tests debe reflejarse en los documentos canónicos correspondientes.
2. **Espejo del Libro:** Cualquier actualización al archivo `LIBRO_OFICIAL_AI_OPERATING_PLATFORM.md` en la raíz debe reflejarse de manera idéntica en `docs/LIBRO_OFICIAL_AI_OPERATING_PLATFORM.md`.
3. **Verificación Automatizada:** El comando `npm run docs:check` valida la presencia de todos los documentos obligatorios, la consistencia de versión y la resolución de enlaces internos.

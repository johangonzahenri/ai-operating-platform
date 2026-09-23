# Roadmap Oficial de la Plataforma (Platform Roadmap)

Este documento resume los hitos de versión y criterios de salida de la **AI Operating Platform**. Para el desglose granular por identificadores de iniciativa, consulte el **[Roadmap Técnico Maestro](docs/ROADMAP_MASTER.md)**.

---

## Matriz de Hitos y Estado de Versiones

| Versión | Enfoque Principal | Criterio de Salida | Estado Oficial |
| :--- | :--- | :--- | :--- |
| **v0.1 Foundation** | Contratos de dominio, sistema de tareas, bus de eventos, stub determinista. | Transiciones de estado verificadas y ejecución observable. | ✅ **Completed** |
| **v0.2 Core Runtime** | Ciclo de vida de ejecución, contexto inmutable, estrategias de cómputo. | Ejecución persistida y trazable a través de puertos. | ✅ **Completed** |
| **v0.3 Models + Tools** | Pasarela de modelos independiente de proveedor y gateway seguro de herramientas. | Capacidades de modelos y herramientas explícitas y correlacionadas. | ✅ **Completed** |
| **v0.4 Orchestration** | Orquestación declarativa de secuencias lineales modelo/herramienta. | Orquestación determinista con detención ante primer fallo. | ✅ **Completed** |
| **v0.5 Memory + Context** | Contexto de ejecución inmutable y pasarela de memoria con ámbitos particionados. | Operaciones de memoria en proceso correlacionadas y aisladas. | ✅ **Completed** |
| **v0.6 Observability + Governance** | Auditoría y métricas correlacionadas con políticas de ejecución fail-closed. | Ejecución gobernada e inspeccionable con default-deny. | ✅ **Completed** |
| **v0.7 Platform API/UI** | API REST nativa de plataforma y límite desacoplado con interfaz web. | Plataforma web consume contratos estables de API. | ✅ **Completed** |
| **v0.8 Agents** | Agentes de primera clase, vinculación de modelos, listas blancas de herramientas. | Ejecución gobernada de agentes a través de `CoreRuntime`. | ✅ **Completed** |
| **v0.9 Autonomous Operations** | Operaciones autónomas acotadas, presupuesto inmutable y bucle supervisado. | Ciclos autónomos acotados gobernados por `PolicyGateway`. | ✅ **Completed** |
| **v0.10 Durable Persistence** | Persistencia duradera en SQLite para operaciones y esquemas relacionales. | Adaptadores de repositorio desacoplados sin polución de dominio. | ✅ **Completed** |
| **v0.11 Domain Rehydration** | Fronteras de rehidratación formal en agregados (`rehydrate`) sin reflexión. | Encapsulamiento puro de dominio en persistencia relacional. | ✅ **Completed** |
| **v0.12 Durable Repositories** | Adaptadores SQLite para tareas, ejecuciones y agentes (`node:sqlite` WAL). | Persistencia durable completa del estado operacional en disco. | ✅ **Completed** |
| **v0.13 Crash Recovery** | Reconciliación atómica al reiniciar y almacén duradero de eventos (`SqliteEventStore`). | Recuperación post-crash idempotente y línea forense inmutable. | ✅ **Completed** |
| **v1.0.0 AI Operating Platform** | Motor integrado, Platform API REST, SDK tipado y Tentaciones AI Commerce. | Plataforma empresarial de IA gobernada y verificada. | ✅ **Completed** |
| **v1.1.0 Extended Ecosystem** | Proveedores reales (OpenAI, Anthropic, Ollama), impresora Brother, consola bilingüe. | 966 tests PASS (0 FAIL), 11 suites, 0 innerHTML, modo es-419 / en. | ✅ **Completed (Baseline)** |
| **v1.2.0 Enterprise Cloud & Virtual Org** | Gateway Gemini, JWT asimétrico RS256/ES256, proxy reverso TLS, memoria duradera SQLite, Virtual Organization Foundation (Organization, Area, Team, AgentMembership). | 1019 tests PASS (0 FAIL), 11 suites. | ✅ **Completed** |
| **v1.3.0 Team Resource Governance** | TeamResourceBudget con cuotas multidimensionales, enforcement fail-closed en runtime (AgentExecutionStrategy, ToolInvocationRuntime, AutonomousOrchestrator). | 1064 tests PASS (0 FAIL), 11 suites. | ✅ **Completed (Baseline)** |
| **v1.4.0 Production Hardening & Developer Platform** | AbortSignal propagation (OAD-001), persistent RBAC, authorization trace, budget/cost separation, OpenAPI 3.1, failure injection tests, security controls, operations runbooks, platform narrative, Developer Platform SDK productization & CLI. | 1623 tests PASS (0 FAIL), 74 suites. | ✅ **Completed (Baseline)** |

---

> [!NOTE]
> La versión de runtime declarada canónicamente en `src/platform/version.ts` y `package.json` corresponde a **`1.4.0`**.

# Visión Estratégica del Producto (v1.4.0)

## 1. ¿Qué es la AI Operating Platform?

La **AI Operating Platform** es una infraestructura operativa fundamental. Sirve para ejecutar, orquestar, persistir, gobernar, observar y exponer capacidades de inteligencia artificial en sistemas empresariales. Es una **plataforma de ingeniería**. No es un chatbot, un patio de pruebas de prompts o un simple envoltorio de proveedor LLM.

```mermaid
flowchart TD
    subgraph Core["Core Engine & Runtime"]
        Core1["Task & Execution Lifecycles"]
        Core2["Multi-Model Gateways"]
        Core3["Secure Tool Registry"]
        Core4["Autonomous Operations Loop"]
        Core5["SQLite WAL Persistence"]
        Core6["Crash Recovery Daemon"]
    end

    subgraph Platform["Platform Product"]
        Plat1["REST Platform API v1"]
        Plat2["PlatformClient SDK (TS)"]
        Plat3["Web Control Plane SPA"]
        Plat4["Application Factory 2.0"]
        Plat5["JWT / RBAC Authentication"]
        Plat6["Real-time Telemetry / SSE"]
    end

    subgraph Satellites["Ecosistema de Aplicaciones Satélites"]
        Sat1["01. Tentaciones AI Commerce (PROJ-01-TENTACIONES)"]
        Sat2["02. Spare Parts Store (PROJ-02-PARTS)"]
        Sat3["03. Fleet Management (PROJ-03-FLEET)"]
        Sat4["04. Customer Portal (PROJ-04-PORTAL)"]
        Sat5["05. Analytics AI (PROJ-05-ANALYTICS)"]
    end

    Star["★ AI OPERATING PLATFORM (Plataforma Estrella) ★"]

    Star --> Core
    Star --> Platform
    Core --> Satellites
    Platform --> Satellites
```

---

## 2. Principios Arquitectónicos Centrales

1. **Separación Hexagonal Estricta:** El núcleo del dominio no importa dependencias de infraestructura. Tiene cero SDKs de proveedores y cero controladores de bases de datos. Todas las capacidades externas se consumen mediante puertos de dominio tipados.
2. **Independencia de Proveedor:** Existen adaptadores intercambiables para OpenAI, Anthropic, Google Gemini y demonios Ollama locales. Están respaldados por un enrutador de reserva determinista (`StubModelGateway`).
3. **Gobernanza de Fallo Cerrado (*Default-Deny*):** Toda invocación de herramienta y llamada a modelo requiere una autorización positiva explícita. Las violaciones detienen la ejecución antes del consumo de recursos.
4. **Persistencia Relacional Duradera y Recuperación de Fallos:** Se utiliza SQLite Write-Ahead Logging atómico (`node:sqlite`). Cuenta con control de concurrencia optimista (`version`), rehidratación de agregados inmutables (`Object.freeze`) y conciliación de arranque automatizada mediante el `RestartRecoveryService`.
5. **Topología de Aplicación Desacoplada (Arquitectura A):** Las aplicaciones comerciales independientes viven en sus propios repositorios autónomos. Consumen la inteligencia de la plataforma estrictamente a través de contratos HTTP/SSE autenticados y el SDK `PlatformClient`.
6. **Gobernanza Multi-Empresarial y Organizaciones Virtuales:** Se soportan organizaciones jerárquicas, áreas funcionales y equipos dedicados. Hay cuotas de presupuesto de recursos (tokens, duración, llamadas a herramientas, pasos). Se incluye orquestación de DAG de flujo de trabajo con segregación de funciones (Ejecutor $\neq$ Verificador $\neq$ Aprobador).

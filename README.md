# AI OPERATING PLATFORM (v1.3.0)
## Plataforma Operacional de IA para la Habilitación, Gobernanza y Observabilidad Multiplataforma

> **Principio de Ingeniería:**
> *"Infraestructura operacional de IA sobre la cual se construyen, gobiernan y observan aplicaciones, automatizaciones y dispositivos empresariales."*

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)]()
[![Test Suite](https://img.shields.io/badge/tests-1354%20passing-success.svg)]()
[![Production Dependencies](https://img.shields.io/badge/npm%20dependencies-0%20runtime-blue.svg)]()
[![Documentation](https://img.shields.io/badge/manual-oficial%20es--419-indigo.svg)](docs/MANUAL_OFICIAL.md)
[![Libro Oficial](https://img.shields.io/badge/libro-oficial%20v2.0-blueviolet.svg)](LIBRO_OFICIAL_AI_OPERATING_PLATFORM.md)

---

## 1. Descripción del Proyecto

La **AI Operating Platform** es una infraestructura de ingeniería de software diseñada para coordinar múltiples agentes de Inteligencia Artificial especializados, modelos de lenguaje heterogéneos y herramientas operacionales bajo principios estrictos de determinismo, seguridad *default-deny* y persistencia inmutable.

### La Regla de Oro de la Arquitectura
```text
CORE ENGINE != PLATFORM PRODUCT != APPLICATIONS
PLATFORM PRODUCT != APPLICATION
APPLICATION != EXTERNAL SERVICE
DEVICE != CORE ENGINE
```

* **Core Engine (Motor Principal):** Gobierna el ciclo de vida de tareas y ejecuciones mediante una máquina de estados finita determinista con **cero dependencias externas en tiempo de ejecución**.
* **Platform Product (Producto Plataforma):** Expone la API REST nativa (`/api/v1/*`), el cliente SDK en TypeScript y el plano de control web SPA con soporte bilingüe (**Español Latinoamericano** por defecto / **Inglés**).
* **Autonomous Operations Runtime:** Motor de ejecución operacional autónomo con gobernanza continua, arrendamiento concurrente (`RuntimeLease`), disyuntores de seguridad y reconciliación de ciclos.
* **Developer Platform & Factory:** Kit de desarrollo, validación declarativa de manifiestos y generación de micro-frontends gobernados.
* **Aplicaciones Externas Gobernadas:** Aplicaciones de negocio independientes (como *Tentaciones AI Commerce* o *Vehicle Parts Platform*) que conservan la propiedad total de sus inventarios y carritos de compra, consumiendo inteligencia artificial exclusivamente mediante contratos de API autenticados.
* **Dispositivos Empresariales:** Gestión de hardware físico local y spooler de impresión para impresoras comerciales (Brother DCP-1600 series en puerto `USB001`).

---

## 2. Arquitectura Canónica

```text
                         AI OPERATING PLATFORM
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        │                         │                         │
   CORE ENGINE             PLATFORM PRODUCT          APPLICATIONS
        │                         │                         │
        │              ┌──────────┼──────────┐              │
        │              │          │          │              │
        │         Developer    Control      API              │
        │         Platform     Plane      Gateway            │
        │              │          │          │              │
        └──────────────┼──────────┼──────────┼──────────────┘
                       │          │          │
                  Security   Observability  Automation
                       │          │          │
                       └──────────┼──────────┘
                                  │
                             AI RUNTIME
                                  │
                   ┌──────────────┼──────────────┐
                   │              │              │
                 Agents         Models          Tools
                   │              │              │
                   └──────────────┼──────────────┘
                                  │
                            Durable Events
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                   │
        Applications         Automations       Business Devices
              │                   │                   │
        Tentaciones              n8n              Brother
        Vehicle Parts                              Printer
```

---

## 3. Características Principales

* **Pureza de Dominio & Zero Dependencies:** Motor central sin librerías externas (`npm ls --omit=dev` 100% vacío), asegurando arranques en menos de 50ms y máxima seguridad perimetral.
* **Persistencia Relacional Durable SQLite WAL:** Base de datos nativa Node.js 22 (`node:sqlite`) con transacciones ACID atómicas, modo WAL y control de concurrencia optimista (OCC).
* **Runtime de Operaciones Autónomas:** Motor continuo de ejecución gobernada basado en triggers programados, reactivos y umbrales con arrendamiento seguro (`RuntimeLease`) y parada de emergencia instantánea.
* **Fronteras de Rehidratación Formal:** Reconstrucción de agregados de dominio (`Task.rehydrate`, `Execution.rehydrate`, `Agent.rehydrate`) eliminando la reflexión por completo.
* **Gobernanza Fail-Closed (Default-Deny):** Toda invocación a herramientas o modelos requiere autorización positiva; denegación inmediata ante violaciones de política sin invocar el runtime.
* **Plano de Control Web Bilingüe:** Interfaz Single-Page Application (SPA) construida en HTML5/Vanilla JS con estricto apego a APIs puras del DOM (0 `innerHTML`, 0 `eval`) con alternancia dinámica entre **Español (Latinoamérica)** e **Inglés**.
* **Almacén de Eventos Durables (EventStore):** Registro append-only inmutable de cada decisión y cambio de estado, permitiendo trazabilidad y auditoría forense total.

---

## 4. Quick Start & Reproducibility (Inicio Rápido y Reproducibilidad)

### Prerrequisitos
* Node.js >= 18 (recomendado Node.js 22 o superior para `node:sqlite` nativo).
* npm >= 9

### Pasos de Ejecución
```bash
# 1. Clonar el repositorio
git clone <URL_REPOSITORIO>
cd ai-operating-platform

# 2. Instalar dependencias de desarrollo
npm install

# 3. Compilar TypeScript en modo estricto
npm run build

# 4. Ejecutar la suite completa de 1354 pruebas automatizadas
npm test

# 5. Ejecutar la verificación integral de build, pruebas y consistencia documental
npm run check

# 6. Iniciar el servidor del Plano de Control
npm start
# O en Windows: Doble clic en INICIAR_PLATAFORMA.bat
```

Acceder al plano de control en el navegador:
👉 **`http://127.0.0.1:3000/`** (Por defecto en Español Latinoamericano).

---

## 5. Índice de Documentación Oficial

Para profundizar en la ingeniería del proyecto, consulte los manuales y registros canónicos:

* 📕 **[Libro Oficial de Arquitectura & Operaciones (v2.0)](LIBRO_OFICIAL_AI_OPERATING_PLATFORM.md)**
* ⚖️ **[Política Oficial de Fuente de Verdad](docs/SOURCE_OF_TRUTH.md)**
* 🗺️ **[Roadmap Técnico Maestro](docs/ROADMAP_MASTER.md)**
* 📑 **[Registro Central de Decisiones Arquitectónicas (ADRs)](docs/DECISIONS.md)**
* 📋 **[Registro de Documentación Oficial](docs/DOCUMENTATION_REGISTRY.md)**
* 🏛️ **[Registro de Arquitectura de Capas](docs/ARCHITECTURE_REGISTRY.md)**
* 📦 **[Registro de Aplicaciones del Ecosistema](docs/APPLICATION_REGISTRY.md)**
* 🖨️ **[Registro de Dispositivos Empresariales](docs/DEVICE_REGISTRY.md)**
* 🛡️ **[Registro de Seguridad & RBAC](docs/SECURITY_REGISTRY.md)**
* 🧪 **[Registro Oficial de Pruebas Automatizadas (1354 Tests)](docs/TEST_REGISTRY.md)**
* ⚡ **[Runtime de Operaciones Autónomas](docs/AUTONOMOUS_OPERATIONS.md)**
* 🛡️ **[Gobernanza Continua de Operaciones Autónomas](docs/AUTONOMOUS_GOVERNANCE.md)**
* 📊 **[Observabilidad de Operaciones Autónomas](docs/AUTONOMOUS_OBSERVABILITY.md)**
* ⚠️ **[Registro de Deuda Técnica y Brechas Reales](docs/TECHNICAL_DEBT.md)**
* 🎯 **[Criterios de Salida para Producción](docs/V1_EXIT_CRITERIA.md)**
* 📖 **[Manual Oficial de la Plataforma](docs/MANUAL_OFICIAL.md)**
* 🏛️ **[Manual de Arquitectura Hexagonal](docs/MANUAL_ARQUITECTURA.md)**
* 🛠️ **[Manual para Desarrolladores & SDK](docs/MANUAL_DESARROLLADOR.md)**
* ⚙️ **[Manual Operacional](docs/MANUAL_OPERACIONAL.md)**
* 📚 **[Glosario Oficial de Términos](docs/GLOSARIO.md)**
* 🌐 **[Referencia de la Platform API REST](docs/API_REFERENCE.md)**

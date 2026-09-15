# AI Operating Platform &mdash; Public Demonstration Guide (v1.1.0)

Este documento es la guía canónica y reproducible para ejecutar la demostración pública y técnica de la **AI Operating Platform (v1.1.0)** y su aplicación de referencia de comercio electrónico **Tentaciones AI Commerce**.

---

## 1. Modos de Ejecución (Demo Modes)

La plataforma soporta tres modalidades de ejecución con estricta honestidad técnica (*Truth Mode*):

| Modo | Inferencia LLM | AR / 3D | Persistencia | Red Externa | Ideal Para |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`DEMO MODE`** | `StubModelGateway` (Determinista) | `Local AR Engine` | SQLite WAL / In-Memory | No requerida | Demostraciones portafolio, offline, evaluación rápida |
| **`LOCAL MODE`** | Ollama (`127.0.0.1:11434`) | `Local AR Engine` | SQLite WAL durable | Localhost | Trabajo local con LLMs open-source sin costos de API |
| **`LIVE MODE`** | OpenAI / Anthropic (API Keys) | Remote / Local AR | SQLite WAL / PostgreSQL | Conexión HTTPS | Entornos productivos con modelos de frontera |

---

## 2. Inicio Rápido (Quickstart)

### Requisitos Previos
* Node.js &ge; 18.0.0
* npm &ge; 9.0.0

### Instalación y Verificación
```bash
# 1. Instalar dependencias (cero dependencias externas en tiempo de ejecución del core engine)
npm install

# 2. Compilar TypeScript y ejecutar la suite de pruebas completa
npm run check
```

### Ejecutar el Servidor de la Plataforma
```bash
npm start
```
El servidor HTTP REST y la Consola Web quedarán disponibles en:
```text
http://127.0.0.1:3000
```

---

## 3. Demostración Guiada: Golden Scenario

El *Golden Scenario* demuestra la interacción de un usuario desde lenguaje natural en una tienda comercial hasta la resolución en 3D y asistencia en carrito:

```text
Prompt: "Quiero unas zapatillas negras para correr y quiero ver cómo me quedan."
```

### Flujo Técnico Paso a Paso:

```text
1. TIENDA TENTACIONES
   ↓
2. PLATFORM API (POST /api/v1/tasks)
   - Tenant ID: tenant-tentaciones
   - Capability: product.discovery
   ↓
3. ORCHESTRATOR & AGENTS (foundation-agent)
   - Deterministic Prompt Extraction: Footwear / Running / Black
   ↓
4. POLICY GATEWAY (Default-Deny RBAC)
   - Evaluates caller permissions and autonomy budget
   ↓
5. MODEL GATEWAY (Model Routing & Inference)
   - Dispatches prompt to configured gateway
   ↓
6. AR VIRTUAL FITTING ROOM (ar.fitting_room)
   - Resolves URN: urn:tentaciones:ar:footwear:pro-carbon-racer
   - Recommends Size 40 based on avatar Nova
   ↓
7. CART ASSISTANCE (cart.assistance)
   - Calculates 149.99 EUR subtotal
   - Confirms Free Shipping qualification
   ↓
8. DURABLE WAL EVENT STORE
   - Persists monotonic immutable event trace
```

---

## 4. Restablecimiento del Entorno Demo (Demo Reset)

Para limpiar las tareas y ejecuciones de demostración sin alterar la estructura del esquema ni la persistencia global:

```bash
# Llamada HTTP al endpoint de reset
curl -X POST http://127.0.0.1:3000/api/v1/demo/reset
```

O desde el SDK:
```typescript
import { createPlatformClient } from "@ai-platform/client";

const client = createPlatformClient({ baseUrl: "http://127.0.0.1:3000" });
await client.demo.reset();
```

---

## 5. Inspección de Integraciones Reales (/integrations)

La consola de integraciones permite auditar qué proveedores están configurados y conectados:

```bash
# Listar todas las integraciones y su estado
curl http://127.0.0.1:3000/api/v1/integrations

# Disparar verificación segura de un proveedor específico
curl -X POST http://127.0.0.1:3000/api/v1/integrations/ollama/verify
```

Las evidencias de verificación se guardan en formato seguro en `docs/integration-evidence/` sin exponer credenciales ni cabeceras de autorización.

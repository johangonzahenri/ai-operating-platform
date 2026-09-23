# Guía del SDK `@ai-platform/client` (SDK Developer Guide)

Este manual proporciona una guía práctica de referencia para inicializar, configurar y utilizar el cliente tipado TypeScript `PlatformClient` de la **AI Operating Platform**.

---

## 1. Instalación e Importación

El SDK forma parte del paquete `@ai-platform/client` (o importación local desde `src/platform-client/index.js`):

```typescript
import {
  createPlatformClient,
  PlatformClient,
  PlatformClientError,
} from "@ai-platform/client";
```

---

## 2. Inicialización y Opciones de Configuración

```typescript
const client = createPlatformClient({
  baseUrl: "http://127.0.0.1:3000",       // URL base del servidor de plataforma
  apiPrefix: "/api/v1",                   // Prefijo de la API REST (por defecto /api/v1)
  apiKey: process.env.AOP_API_KEY,        // Clave API de la aplicación
  bearerToken: process.env.AOP_JWT_TOKEN, // O token JWT Bearer
  tenantId: "tenant-enterprise-01",       // Identificador del tenant para aislamiento multitenant
  applicationId: "app-tentaciones-01",    // Identificador de la aplicación satélite
  timeoutMs: 30000,                       // Timeout por solicitud (30 segundos por defecto)
  retryPolicy: {
    maxRetries: 3,                        // Reintentos máximos para solicitudes idempotentes
    retryDelayMs: 250,                    // Retardo inicial en ms
    backoffFactor: 2,                     // Multiplicador de retroceso exponencial
  },
});
```

---

## 3. Ejemplos de Uso por Espacios de Nombres

### 3.1 Verificación de Salud
```typescript
const health = await client.health();
console.log(`Estado: ${health.status}, Versión: ${health.version}, Uptime: ${health.uptimeSeconds}s`);
```

### 3.2 Tareas y Ejecuciones
```typescript
// Creación idempotente de una tarea
const task = await client.tasks.create({
  agentId: "fashion-recommender-agent",
  input: {
    userQuery: "Vestido casual de verano color azul",
    size: "M",
  },
  idempotencyKey: "order-req-20260923-001",
});

console.log(`Tarea creada: ${task.taskId}, Estado: ${task.status}`);

// Consultar resultado de la tarea
const result = await client.tasks.get(task.taskId);
console.log("Resultado:", result.result);
```

### 3.3 Descubrimiento de Agentes
```typescript
const { agents } = await client.agents.list();
for (const agent of agents) {
  console.log(`- ${agent.name} (${agent.id}): ${agent.description}`);
}
```

### 3.4 Flujos de Trabajo (Workflows DAG)
```typescript
// Iniciar instancia de un flujo de trabajo gobernado
const instance = await client.workflows.startInstance("wf-def-order-fulfillment", {
  initialContext: { orderId: "ORD-99182" },
  tenantId: "tenant-enterprise-01",
});

console.log(`Flujo iniciado: ${instance.id}, Estado: ${instance.status}`);
```

### 3.5 Exportación de Evidencias de Cumplimiento
```typescript
const evidence = await client.governance.exportEvidence({
  scope: "AUDIT_TRAIL",
  format: "JSON",
  fromDate: new Date(Date.now() - 30 * 86400000).toISOString(),
  toDate: new Date().toISOString(),
});

console.log(`Paquete de auditoría generado: ${evidence.manifest.exportId}`);
console.log(`Sello criptográfico SHA-256: ${evidence.manifest.integritySeal}`);
```

---

## 4. Uso de la Línea de Comandos (Developer CLI)

El SDK incluye una herramienta CLI para inspección rápida:

```bash
# Verificación de salud de la plataforma
npx aop-cli health --url http://127.0.0.1:3000

# Listar agentes registrados con formato JSON
npx aop-cli agents list --json

# Consultar una tarea específica
npx aop-cli tasks get <taskId> --api-key <tu_api_key>

# Exportar evidencias de gobernanza
npx aop-cli governance export AUDIT_TRAIL --tenant tenant-01
```

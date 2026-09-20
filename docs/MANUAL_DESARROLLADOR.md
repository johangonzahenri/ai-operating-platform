# Manual para Desarrolladores de AI Operating Platform
## Guía de Desarrollo de Aplicaciones, Integración de SDK y Extensibilidad (v1.1.0)

Este manual proporciona instrucciones paso a paso para ingenieros de software que deseen construir aplicaciones sobre la **AI Operating Platform**, integrar agentes, extender capacidades y consumir eventos de dominio.

---

## 1. Cómo Crear y Registrar una Nueva Aplicación

Para integrar una aplicación de negocio (como una tienda online o sistema ERP):
1. **Definir el Manifiesto de Aplicación:**
   Cree un archivo `app-manifest.json` que declare la identidad, versión y capacidades requeridas:
   ```json
   {
     "id": "mi-app-corporativa",
     "name": "Mi Aplicación Corporativa",
     "version": "1.0.0",
     "tenantId": "tenant-principal",
     "requiredCapabilities": ["catalog.search", "inventory.check"],
     "webhookUrl": "http://127.0.0.1:4000/webhooks/ai-events"
   }
   ```
2. **Registrar la Aplicación en la Plataforma:**
   Envíe una petición HTTP POST autenticada con rol `Admin`:
   ```bash
   curl -X POST http://127.0.0.1:3000/api/v1/applications      -H "Content-Type: application/json"      -H "Authorization: Bearer <ADMIN_TOKEN>"      -d @app-manifest.json
   ```
   La plataforma retornará una `apiKey` única (`app_sec_...`) vinculada exclusivamente a esta aplicación.

---

## 2. Cómo Usar el SDK de Plataforma (`PlatformClient`)

El SDK proporciona un cliente tipado en TypeScript:

```typescript
import { PlatformClient } from "./src/sdk/client-sdk.js";

// Inicializar cliente con clave de aplicación
const client = new PlatformClient({
  baseUrl: "http://127.0.0.1:3000",
  apiKey: process.env.AI_PLATFORM_API_KEY,
  tenantId: "tenant-principal",
});

// Comprobar salud de conexión
const health = await client.getHealth();
console.log("Estado de la plataforma:", health.status);
```

---

## 3. Cómo Crear, Ejecutar y Observar Tareas

### Paso 1: Enviar una Tarea al Motor
```typescript
const task = await client.submitTask({
  agentId: "support-agent",
  input: {
    userQuery: "¿Tienen zapatillas de running talle 42?",
    priority: "HIGH",
  },
  correlationId: "order-req-8891",
});

console.log("Tarea creada con ID:", task.taskId);
```

### Paso 2: Ejecutar y Esperar Resultado
```typescript
const execution = await client.executeTask(task.taskId);

if (execution.status === "COMPLETED") {
  console.log("Resultado de la IA:", execution.result.output);
} else {
  console.error("Fallo de ejecución:", execution.error);
}
```

### Paso 3: Observar la Trazabilidad Forense
```typescript
const timeline = await client.getExecutionTimeline(execution.executionId);
for (const step of timeline.steps) {
  console.log(`[${step.occurredAt}] Evento: ${step.eventType} - Estado: ${step.status}`);
}
```

---

## 4. Cómo Trabajar con Capacidades (Capabilities) y Herramientas

Las herramientas son registradas como capacidades explícitas. Para definir una nueva herramienta:
1. Cree la definición con esquema JSON formal:
   ```typescript
   export const weatherToolDefinition = {
     id: "get_weather",
     version: "1.0.0",
     riskLevel: "LOW",
     category: "UTILITY",
     inputSchema: {
       type: "object",
       properties: {
         city: { type: "string" },
       },
       required: ["city"],
     },
   };
   ```
2. Implemente la función ejecutora en el adaptador correspondiente.
3. Regístrela en `ToolRegistry` durante la composición.
4. Asigne la herramienta a la lista blanca del agente deseado:
   ```bash
   curl -X POST http://127.0.0.1:3000/api/v1/agents/support-agent/tools      -H "Content-Type: application/json"      -d '{"toolId": "get_weather"}'
   ```

---

## 5. Cómo Trabajar con Inquilinos (Tenants) y Aislamiento de Datos

Cada solicitud a la API debe incluir el encabezado `x-tenant-id` o estar firmada con un token que contenga el `tenantId`.
* **Aislamiento en Memoria:** El `MemoryGateway` aísla los espacios de almacenamiento por `tenantId`. Un agente no puede acceder a memorias de otro tenant.
* **Cuotas de Tokens:** Cuando un tenant alcanza su límite de cuota configurado, cualquier solicitud posterior será rechazada con `QuotaExhaustedError` sin consumir recursos de inferencia.

---

## 6. Cómo Consumir el Flujo de Eventos Durables

La plataforma emite eventos de dominio inmutables para cada acción relevante:
```typescript
// Consultar eventos recientes con filtros
const events = await client.getEvents({
  eventType: "execution.completed",
  limit: 50,
  afterSequence: 1200,
});

for (const ev of events) {
  console.log(`Secuencia #${ev.sequenceNumber}: ${ev.eventType} en ${ev.aggregateId}`);
}
```

---

## 7. Cómo Conectar Dispositivos Físicos y Usar el Spooler de Impresión

Para enviar una orden de impresión física (e.g. recibo o ticket de despacho):
```typescript
const printJob = await client.submitPrintJob("brother-dcp1600-usb", {
  documentType: "RECEIPT",
  content: "TICKET DE VENTA #4501\nTOTAL: $14.500 CLP\nCLIENTE: Tentaciones AI",
  copies: 1,
});

console.log("Trabajo de impresión enviado con ID:", printJob.jobId);
```

---

## 8. Cómo Respetar los Principios de Seguridad (Default-Deny)

1. **Principio de Menor Privilegio:** Asigne únicamente las herramientas mínimas indispensables para el rol del agente.
2. **Validación Estricta de Parámetros:** Nunca pase entradas de usuario sin sanitizar directamente a comandos de sistema o consultas SQL.
3. **Manejo de Errores Fail-Closed:** Ante cualquier excepción no contemplada, el runtime debe abortar inmediatamente la ejecución registrando el fallo con código de diagnóstico formal.

---

## 9. Cómo Agregar un Nuevo Adaptador Tecnológico

Para agregar un nuevo proveedor de modelos (ejemplo: Google Vertex AI):
1. Implemente la interfaz `ModelGateway` en `src/infrastructure/models/vertex-model-gateway.ts`.
2. Convierta las estructuras internas `ModelRequest` al formato nativo del proveedor.
3. Convierta las respuestas nativas al contrato canónico `ModelResponse`.
4. Registre el nuevo adaptador en `ProviderFactory` (`src/infrastructure/models/provider-factory.ts`).
5. Añada pruebas unitarias y de contrato correspondientes en `tests/contract/model-gateway.contract.test.ts`.

---

## 10. Cómo Gestionar la Organización Virtual (Organizaciones, Áreas y Equipos)

La plataforma permite modelar la estructura operativa empresarial mediante la Virtual Organization Foundation (ADR 0027):

1. **Crear una Organización:**
   ```bash
   curl -X POST http://127.0.0.1:3000/api/v1/organizations \
     -H "Content-Type: application/json" \
     -d '{"tenantId": "tenant-corp", "name": "corp-hq", "displayName": "Corporate HQ", "description": "Sede principal"}'
   ```
2. **Crear un Área Funcional:**
   ```bash
   curl -X POST http://127.0.0.1:3000/api/v1/organizations/{organizationId}/areas \
     -H "Content-Type: application/json" \
     -d '{"name": "Engineering", "description": "División de ingeniería"}'
   ```
3. **Crear un Equipo de Trabajo:**
   ```bash
   curl -X POST http://127.0.0.1:3000/api/v1/areas/{areaId}/teams \
     -H "Content-Type: application/json" \
     -d '{"name": "Core Platform Team", "description": "Equipo de plataforma central"}'
   ```
4. **Asignar un Agente con Rol Operativo:**
   ```bash
   curl -X POST http://127.0.0.1:3000/api/v1/teams/{teamId}/agents \
     -H "Content-Type: application/json" \
     -d '{"agentId": "foundation-agent", "role": "LEAD"}'
   ```
   Roles permitidos: `LEAD`, `SPECIALIST`, `OPERATOR`, `REVIEWER`.
5. **Consultar Jerarquía Completa:**
   ```bash
   curl http://127.0.0.1:3000/api/v1/organizations/{organizationId}/hierarchy
   ```
   Retorna la estructura anidada con organización, áreas, equipos y miembros asignados en una sola llamada atómica.

---

## 7. Autenticación y Gobernanza de Credenciales API

A partir de la versión 1.3.0 (`AOP-AUTH`), toda invocación a la API REST `/api/v1/*` requiere autenticación mediante token Bearer o encabezado `X-API-Key`.

### Formato de Clave de Acceso
```text
aop_live_<credentialId>_<secretHex>
```

### Gestión de Credenciales mediante PlatformClient SDK
```typescript
import { PlatformClient } from '@ai-platform/client';

const client = PlatformClient.create({
  baseUrl: 'http://127.0.0.1:3000',
  apiKey: 'aop_live_cred_admin_secret123...',
  tenantId: 'tenant-primary',
  applicationId: 'app-ecommerce'
});

// Crear nueva credencial con scopes delimitados
const created = await client.credentials.create({
  principalId: 'service-worker-1',
  principalType: 'SERVICE',
  tenantId: 'tenant-primary',
  applicationId: 'app-ecommerce',
  name: 'Worker de Sincronización',
  scopes: ['tasks.read', 'tasks.create', 'events.read']
});

console.log('API Key (revelada solo una vez):', created.rawKey);

// Rotar credencial existente
const rotated = await client.credentials.rotate(created.credential.credentialId);
console.log('Nueva API Key:', rotated.rawKey);

// Revocar credencial
await client.credentials.revoke(created.credential.credentialId, 'Mantenimiento preventivo');
```

### Invocación REST Directa
```bash
curl -X POST http://127.0.0.1:3000/api/v1/tasks \
  -H "Authorization: Bearer aop_live_cred_123_abc..." \
  -H "X-Tenant-Id: tenant-primary" \
  -H "X-Application-Id: app-ecommerce" \
  -H "Content-Type: application/json" \
  -d '{"type": "TASK_EXECUTE", "payload": {"command": "sync"}}'
```



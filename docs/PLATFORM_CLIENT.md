# Cliente de Plataforma

`createPlatformClient` es un SDK de solo transporte para aplicaciones externas. No contiene lógica de planificador, coordinador, política, herramienta o persistencia.

```ts
import { createPlatformClient } from "ai-operating-platform/platform-client";

const platform = createPlatformClient({ baseUrl: "http://127.0.0.1:3000" });
const task = await platform.tasks.create({
  agentId: "foundation-agent",
  input: { prompt: "Analizar estos productos" },
  traceId: "commerce-request-42"
});
const execution = await platform.tasks.execute(task.taskId);
const current = await platform.executions.get(execution.executionId);
const events = await platform.executions.events(execution.executionId);
```

Las fallas HTTP se lanzan como `PlatformClientError`. Sus campos `code`, `status`, `details`, `requestId` y `traceId` preservan diagnósticos del backend. Las fallas de red usan `NETWORK_ERROR` y retienen la causa original en `details`.

# Contrato de Ejecución

La capa de producto representa una ejecución independientemente de los objetos de dominio internos:

```json
{
  "executionId": "execution-123",
  "taskId": "task-123",
  "traceId": "trace-123",
  "status": "COMPLETED",
  "startedAt": "2026-09-11T20:00:00.000Z",
  "completedAt": "2026-09-11T20:00:01.000Z",
  "completedSteps": [],
  "result": { "text": "..." }
}
```

Los estados terminales permitidos son `COMPLETED`, `FAILED` y `CANCELLED`; `CREATED` y `RUNNING` representan trabajo no terminal. Las funciones de mapeo puro en `src/platform/product/execution-contract.ts` evitan que los consumidores dependan de implementaciones de repositorios o `EventStore`.

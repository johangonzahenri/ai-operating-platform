# API de Plataforma v1

El límite público HTTP está disponible bajo `/api/v1` (y el prefijo compatible `/api/platform/v1`). Las aplicaciones deben intercambiar solo JSON y no deben importar las clases del Core Engine.

## Flujo de producto

1. `POST /tasks` con `agentId`, `input` y un `traceId` opcional.
2. Leer el `task.id` y `execution.id` devueltos.
3. `GET /tasks/:taskId` y `GET /executions/:executionId`.
4. Leer `GET /executions/:executionId/events` (la API también expone `/timeline` para la interfaz de usuario operativa).
5. Usar `status`, `output` y `error` para interpretar el resultado terminal.

El envío de tareas actualmente inicia la ejecución como parte del contrato del motor existente. `POST /tasks/:taskId/execute` es una ruta de compatibilidad de la capa de producto idempotente que devuelve la ejecución correlacionada.

## Correlación

`task.id`, `execution.id` y `traceId` son identificadores públicos estables. Las respuestas de eventos duraderos preservan `traceId`, `executionId`/`aggregateId` y metadatos de causalidad. Cada respuesta incluye `X-Request-Id`; los llamadores pueden enviar su propio valor con el mismo encabezado.

## Ejemplo

```json
{
  "task": {
    "id": "task-123",
    "traceId": "trace-123",
    "agentId": "foundation-agent",
    "status": "COMPLETED",
    "createdAt": "2026-09-11T20:00:00.000Z",
    "input": { "prompt": "Analizar estos productos" },
    "output": { "text": "..." }
  },
  "execution": {
    "id": "execution-123",
    "taskId": "task-123",
    "traceId": "trace-123",
    "status": "COMPLETED",
    "startedAt": "2026-09-11T20:00:00.000Z",
    "completedAt": "2026-09-11T20:00:01.000Z"
  }
}
```

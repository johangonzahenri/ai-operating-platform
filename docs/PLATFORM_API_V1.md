# Platform API v1

The public HTTP boundary is available under `/api/v1` (and the compatible
`/api/platform/v1` prefix). Applications should exchange JSON only and must
not import Core Engine classes.

## Product flow

1. `POST /tasks` with `agentId`, `input`, and an optional `traceId`.
2. Read the returned `task.id` and `execution.id`.
3. `GET /tasks/:taskId` and `GET /executions/:executionId`.
4. Read `GET /executions/:executionId/events` (the API also exposes
   `/timeline` for the operational UI).
5. Use `status`, `output`, and `error` to interpret the terminal result.

Task submission currently starts the execution as part of the existing engine
contract. `POST /tasks/:taskId/execute` is an idempotent product-layer
compatibility route that returns the correlated execution.

## Correlation

`task.id`, `execution.id`, and `traceId` are stable public identifiers.
Durable event responses preserve `traceId`, `executionId`/`aggregateId`, and
causation metadata. Every response includes `X-Request-Id`; callers may send
their own value with the same header.

## Example

```json
{
  "task": {
    "id": "task-123",
    "traceId": "trace-123",
    "agentId": "foundation-agent",
    "status": "COMPLETED",
    "createdAt": "2026-09-11T20:00:00.000Z",
    "input": { "prompt": "Analyze these products" },
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

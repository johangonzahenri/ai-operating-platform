# Execution Contract

The product layer represents an execution independently from internal domain
objects:

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

The allowed terminal statuses are `COMPLETED`, `FAILED`, and `CANCELLED`;
`CREATED` and `RUNNING` represent non-terminal work. The pure mapping
functions in `src/platform/product/execution-contract.ts` prevent consumers
from depending on repository or EventStore implementations.

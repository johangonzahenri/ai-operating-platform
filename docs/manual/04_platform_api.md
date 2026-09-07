# Chapter 4: Platform API Specification

## 1. Role of the Platform API

The Platform API translates external HTTP requests into application use cases while insulating the Core Engine from transport-level concerns.

### Responsibilities
- Protocol termination (HTTP REST, JSON serialization).
- Strict security validation (loopback binding, CORS restriction, path traversal prevention, content-type checks).
- Input normalization (sanitizing identifiers and validating non-empty input payloads).
- Error structuring (standardized JSON error bodies with HTTP status codes).

## 2. API Contract Endpoints (/api/v1)

### `GET /api/v1/status`
Returns runtime status, version, uptime, and aggregated counts.
```json
{
  "status": "HEALTHY",
  "version": "0.7.0",
  "uptimeSeconds": 142,
  "tasksCount": 5,
  "executionsCount": 5,
  "toolsCount": 1,
  "modelsCount": 1,
  "metrics": { "counters": {}, "samplesCount": 15 }
}
```

### `GET /api/v1/models` & `GET /api/v1/models/:id`
Returns registered model gateways and capabilities.

### `GET /api/v1/tools` & `GET /api/v1/tools/:id`
Returns registered operational tools and parameter definitions.

### `POST /api/v1/executions`
Submits a task for execution through `SubmitTask` use case and `CoreRuntime`.
- Request: `{ "agentId": "foundation-agent", "input": { ... }, "traceId": "optional-trace-id" }`
- Response (201 Created): `{ "task": TaskDTO, "execution": ExecutionDTO }`

### `GET /api/v1/executions` & `GET /api/v1/executions/:id`
Lists or retrieves execution projections.

### `GET /api/v1/executions/:id/timeline`
Retrieves chronological audit events for the given execution.

### `POST /api/v1/orchestrate`
Executes a multi-operation sequence via `ExecuteOrchestration`.
- Request: `{ "operations": [ ... ], "traceId": "optional-trace-id" }`
- Response (200 OK): `{ "taskId": "...", "executionId": "...", "status": "COMPLETED", "operations": [ ... ], "output": { ... } }`

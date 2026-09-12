# Operational Console

The internal console is a read-and-operate surface for the public platform
API. It uses the browser HTTP client and does not import Core Engine modules.

The dashboard shows health and platform status. The operational views expose
tasks, executions, models, tools, and the correlated event/audit timeline.
Failures are rendered as API error states rather than replacing backend
diagnostics with a generic message.

Run it with the normal server command and open `http://127.0.0.1:3000/`.
The console is intentionally not the external product UI; it demonstrates the
stable boundary that applications such as Tentaciones AI Commerce will use.

## Operational Intelligence Console flow

The primary operations view is a real Platform API consumer:

1. `GET /api/platform/v1/health` renders platform, runtime, persistence, and
   event-store status.
2. `GET /api/platform/v1/agents` selects an active agent.
3. `POST /api/platform/v1/tasks` creates the objective and returns task,
   execution, and trace identifiers.
4. `POST /api/platform/v1/tasks/:taskId/execute` uses the existing idempotent
   execution contract.
5. The browser polls
   `GET /api/platform/v1/executions/:executionId` and
   `GET /api/platform/v1/executions/:executionId/events` with bounded backoff
   until a terminal status or finite attempt limit.

The timeline is built only from returned event records. Values are assigned
with `textContent`, so event payloads cannot become markup. Provider
credentials, headers, filesystem paths, and secrets are never requested by
the browser. Missing optional execution metadata is displayed as
`Not reported`, not fabricated.

The default objective demonstrates the real Tentaciones path without copying
its catalog. Tentaciones remains the owner of products; the platform only
coordinates and observes the task, tool call, policy decision, observation,
and final result.

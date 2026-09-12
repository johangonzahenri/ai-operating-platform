# Platform Client

`createPlatformClient` is a transport-only SDK for external applications.
It contains no planner, coordinator, policy, tool, or persistence logic.

```ts
import { createPlatformClient } from "ai-operating-platform/platform-client";

const platform = createPlatformClient({ baseUrl: "http://127.0.0.1:3000" });
const task = await platform.tasks.create({
  agentId: "foundation-agent",
  input: { prompt: "Analyze these products" },
  traceId: "commerce-request-42"
});
const execution = await platform.tasks.execute(task.taskId);
const current = await platform.executions.get(execution.executionId);
const events = await platform.executions.events(execution.executionId);
```

HTTP failures are raised as `PlatformClientError`. Its `code`, `status`,
`details`, `requestId`, and `traceId` fields preserve backend diagnostics.
Network failures use `NETWORK_ERROR` and retain the original cause in
`details`.

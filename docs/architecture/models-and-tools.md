# Models and tools in v0.3

`ModelGateway` is the provider-independent inference port. Requests carry the selected model, input, trace ID and optional metadata; responses may include content, provider/model identifiers, usage, finish reason and metadata. The deterministic stub is the only adapter in this milestone. Provider configuration remains outside the domain, and real providers are deferred.

`ToolGateway` is a separate capability. It resolves a `Tool` through `ToolRegistry`, validates a minimal declarative input schema, then invokes the adapter with an `ExecutionContext`. Tool results carry structured output and optional metadata. Missing tools, invalid input and adapter failures have distinct errors.

Both capabilities emit events correlated by `traceId`, `taskId` and `executionId`. The calculator adapter is pure and deterministic: tools in v0.3 receive no implicit filesystem, shell, subprocess, network or environment access. Autonomous tool calling, policies and permissions are intentionally deferred.

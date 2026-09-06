# Context and memory

**Context** is execution-scoped information. `ExecutionContext` has immutable identity, Task input, metadata and controlled snapshot values. A component derives a new context with `withInput` or `withValue`; it cannot mutate shared global state.

**Memory** is persistent, retrievable information. `MemoryItem` is stored through provider-independent `MemoryGateway` using a generic `scope` and `key`. `InMemoryMemoryGateway` is a deterministic adapter for v0.5. `MemoryService` makes store, retrieve and delete explicit and emits events only when supplied an execution context.

Context is not Memory, Memory is not RAG, and Context is not an Agent. No model/tool result becomes memory automatically. Future database and vector adapters implement `MemoryGateway` without altering the Core domain.

# Memory Contract v0.1

Memory stores selected information that is intentionally retained beyond one
execution. It is separate from `TaskContext`, `ModelRequest.messages`,
execution observations, and the EventStore.

The current contract is:

- `MemoryGateway.store(item)` for writes;
- `MemoryGateway.retrieve(scope, key)` for exact reads;
- `MemoryGateway.retrieveMany({ scope, key?, limit })` for bounded reads;
- `MemoryGateway.delete(scope, key)` for deletion.

The in-memory adapter supports deterministic retrieval ordered by most recent
`updatedAt`, then key, and never returns more than the requested limit (maximum
100). Values and metadata are recursively bounded and redact sensitive keys
before storage. Memory events expose identifiers and scope/key metadata, not raw
values.

The current runtime uses agent-scoped memory only. Memory remains in-memory;
there is no SQLite Memory table, semantic retrieval, vector store, or second
EventStore. `MemoryService` is the application boundary for runtime writes and
reads, while direct gateway injection remains supported for existing adapter
tests.

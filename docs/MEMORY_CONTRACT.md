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
EventStore. `MemoryService` is the application boundary for runtime writes,
reads, and deletes. Runtime access requires an agent identity; the composition
policy permits the agent-declared scope, while callers can inject stricter
policies for ownership rules. Direct gateway injection remains supported for
existing adapter tests.

`store` is an upsert by `scope + key`: updates preserve the existing `id` and
`createdAt`, and advance `updatedAt`. Deletion removes the item immediately from
the gateway; the deletion event remains only as operational audit metadata.
When an agent execution retrieves memory, the selected bounded value is placed
in `TaskContext.suppliedContext`. It is not added as a parallel model input and
does not duplicate `ModelRequest.messages`.

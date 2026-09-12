# Task Context

The Task Context layer is an execution-scoped, provider-neutral snapshot used to
give planners and model rounds the bounded context they need for one task.

It is not persistent memory, an event store, or a replacement for operational
execution state. It is built in memory and contains only:

- task and execution correlation identifiers;
- objective and safe task metadata;
- current execution round and tool;
- bounded model messages and tool observations;
- supplied context and execution summaries.

`TaskContext` applies configurable limits for message and observation counts,
string length, object depth, and object keys. Sensitive keys are redacted
recursively before the snapshot is passed to a planner or model gateway.
Messages and observations are retained from the most recent entries when a
limit is exceeded, and the snapshot exposes a `truncated` flag plus counts.

The context is provider-neutral. Provider adapters continue to serialize
`ModelMessage` and model requests independently; no provider-specific format is
stored in `TaskContext`. Agent model rounds keep `ModelRequest.messages` as the
canonical message history and pass a context snapshot without duplicating those
messages; planners can request the complete bounded snapshot.

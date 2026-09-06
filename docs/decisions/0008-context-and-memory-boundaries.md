# 0008. Execution context and scoped memory

Date: 2026-09-06
Status: Accepted

## Decision

`ExecutionContext` is immutable, execution-scoped information: correlation identifiers, input, metadata and controlled transient values. `MemoryGateway` manages persistent, explicitly stored `MemoryItem` values by generic scope and key. `MemoryService` is the application boundary that emits correlated memory events.

## Consequences

Operation bindings remain the v0.4 mechanism for declared result propagation; context complements rather than replaces them. Memory is never written automatically from model or tool output. Retrieval is exact scope/key lookup only—no embeddings, RAG, vector store, ranking or global process memory is introduced.

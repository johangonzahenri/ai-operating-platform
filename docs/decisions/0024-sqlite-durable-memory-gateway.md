# 0024. SQLite Durable Memory Gateway Adapter

## Status

Accepted

## Context

The platform achieved durable persistence for tasks, executions, autonomous operations, and domain events in SQLite WAL mode. However, the `MemoryGateway` port remained backed exclusively by `InMemoryMemoryGateway` (**GAP-02**).

This meant that contextual memory items associated with long-running agents or user sessions were volatile and lost across process restarts.

## Decision

We implement `SqliteMemoryGateway` in `src/infrastructure/memory/sqlite-memory-gateway.ts` implementing `MemoryGateway`:

1. **Relational Table**:
   ```sql
   CREATE TABLE IF NOT EXISTS platform_memory (
     id TEXT PRIMARY KEY,
     scope TEXT NOT NULL,
     key TEXT NOT NULL,
     value_json TEXT NOT NULL,
     metadata_json TEXT NOT NULL,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL,
     truncated INTEGER NOT NULL DEFAULT 0,
     UNIQUE(scope, key)
   );
   CREATE INDEX IF NOT EXISTS idx_platform_memory_scope_key ON platform_memory(scope, key);
   CREATE INDEX IF NOT EXISTS idx_platform_memory_scope_updated ON platform_memory(scope, updated_at DESC);
   ```
2. **Atomic Upsert**:
   Utilizes `INSERT INTO platform_memory ... ON CONFLICT(scope, key) DO UPDATE` to guarantee safe concurrent writes while preserving the original `id` and initial creation timestamp.
3. **Scope Partitioning**:
   Enforces strict separation by `scope` (e.g. `agent-context`, `session-*`, `tenant-*`) to prevent accidental cross-tenant or cross-agent context leakage.
4. **Deterministic Bounded Retrieval**:
   `retrieveMany(query)` supports limit boundaries (1..100) ordered by `updated_at DESC`.

## Consequences

- **GAP-02 is permanently resolved**.
- Agent memory and session state survive platform crashes and planned maintenance cycles.
- Complies 100% with the standard `memoryGatewayContract` test suite.

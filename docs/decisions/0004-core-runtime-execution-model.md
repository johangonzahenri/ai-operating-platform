# 0004. Core Runtime and Execution model

Date: 2026-09-05
Status: Accepted

## Context

v0.1 could execute a Task but did not make an individual attempt, execution ownership, or correlation boundary explicit.

## Decision

Introduce `Execution` as a domain entity distinct from `Task`, and `ExecutionContext` as its small immutable correlation context. `CoreRuntime` is an application service that creates IDs, owns task/execution lifecycle, persistence and lifecycle events. An `ExecutionStrategy` port performs the operation; v0.2 provides a model-backed strategy using the existing Model Gateway port.

## Consequences

A Task may have multiple executions in future without changing its identity. v0.2 creates a new execution for every runtime invocation and does not implement retries or idempotency keys. Cancellation and timeout policy are deliberately deferred: no arbitrary timeout or partial cancellation semantics are introduced. Durable persistence and distributed coordination remain adapters for later versions.

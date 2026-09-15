# ADR-005: Durable Append-Only Event Store with SQLite WAL

## Status
Accepted

## Context
Agent reasoning, planning decisions, tool executions, and state transitions must be persistently auditable and resilient across process restarts.

## Decision
Implement an append-only SqliteEventStore backed by SQLite WAL mode with monotonic sequence numbers, aggregate correlation, and deterministic trace IDs.

## Alternatives Considered
- In-memory event bus only: rejected because crash recovery and historical audits are impossible.
- Distributed event streaming (Kafka/RabbitMQ): rejected for local runtime footprint.

## Consequences
- Complete, immutable audit log of all system decisions.
- High performance concurrent writes under SQLite WAL.

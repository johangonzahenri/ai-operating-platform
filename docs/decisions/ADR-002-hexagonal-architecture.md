# ADR-002: Hexagonal Architecture (Ports and Adapters)

## Status
Accepted

## Context
The Core Engine must remain agnostic to concrete model providers (Ollama, OpenAI, Anthropic), storage systems (SQLite, In-Memory), and user interfaces.

## Decision
Adopt Hexagonal Architecture across all subsystems:
- Domain defines ports (interfaces) for models, tools, tasks, events, and applications.
- Infrastructure provides concrete adapters adhering strictly to domain contracts.
- Composition root wires dependencies explicitly without global singletons.

## Alternatives Considered
- Direct concrete dependency injection throughout domain: rejected for violation of purity.

## Consequences
- Pluggable infrastructure enables effortless stubbing in unit tests.
- High resilience and modular evolution.

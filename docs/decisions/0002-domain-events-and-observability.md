# 0002. Domain events through a publisher port

Date: 2026-09-05
Status: Accepted

## Context

Relevant execution transitions must be auditable without intertwining logging into business rules.

## Decision

Represent events as immutable typed facts and publish them through an `EventPublisher` port. Structured logging is an infrastructure subscriber.

## Consequences

New sinks such as metrics or audit storage can subscribe without changing Task or Runtime code. Delivery is synchronous and in-memory in v0.1; durable messaging is deferred.

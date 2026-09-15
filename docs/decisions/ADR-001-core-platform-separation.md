# ADR-001: Core Platform Separation

## Status
Accepted

## Context
The system consists of core multi-agent execution, a public platform API/web product, and external consumer applications. Without strict separation, domain models risk becoming tightly coupled with transport formats or application-specific requirements.

## Decision
Enforce the fundamental invariant:
CORE ENGINE != PLATFORM PRODUCT != APPLICATIONS
- Core Engine owns task lifecycle, planning, model routing, and security policies.
- Platform API/Product owns HTTP serialization, routing, and console surfaces.
- External Applications (such as Tentaciones AI Commerce) consume only via the authenticated Platform API/Client.

## Alternatives Considered
- Monolithic layered architecture: rejected due to high risk of cross-layer domain contamination.
- Microservices deployment: rejected for local execution simplicity and test velocity.

## Consequences
- Clean hexagonal isolation and testability.
- Strict compile-time and runtime validation preventing domain imports by external consumers.

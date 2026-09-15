# ADR-007: External Application Boundary and Identity Model

## Status
Accepted

## Context
External consumer applications must be modeled as first-class entities in the platform registry without importing internal domain classes.

## Decision
Define ExternalApplication domain entity and ApplicationRegistryPort managing metadata, implementation status, runtime status, authentication mode, and capability scopes.

## Alternatives Considered
- Hardcoded application lists in router: rejected for lack of dynamic governance.

## Consequences
- Clean application governance and self-describing platform catalog.
- Extensible to future consumers (e.g. Vehicle Diagnostics, Support Desk).

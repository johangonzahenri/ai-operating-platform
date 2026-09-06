# 0003. Manual dependency composition

Date: 2026-09-05
Status: Accepted

## Context

The foundation needs dependency inversion but does not yet justify a container library.

## Decision

Compose ports and adapters explicitly at the application edge.

## Consequences

Dependencies remain visible and tests can inject stubs easily. A future container must preserve the same port boundaries.

# ADR-006: Unified Platform API v1 & SDK Client

## Status
Accepted

## Context
The Web Console and external applications need a standardized, versioned HTTP surface with SDK client support.

## Decision
Expose canonical /api/v1/* endpoints (with /api/platform/v1/* compatibility routes) powered by PlatformService and consumed via the typed @ai-platform/client (PlatformClient).

## Alternatives Considered
- Ad-hoc RPC endpoints: rejected for lack of standardization.
- GraphQL: rejected to maintain lightweight REST contract.

## Consequences
- Clean client-server separation.
- Uniform error schemas (code, message, status).

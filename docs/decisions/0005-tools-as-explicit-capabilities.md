# 0005. Tools as explicit capabilities

Date: 2026-09-06
Status: Accepted

## Decision

Tools are explicit domain capabilities with a definition, small input schema, adapter implementation, in-memory registry and gateway. The gateway validates input before invocation and emits correlated lifecycle events.

## Consequences

v0.3 exposes tool invocation explicitly; it does not add an agent loop or permit filesystem, network, shell, or environment access. Policy and richer schemas are deferred.

# 0006. Engine, Platform and Application boundary

Date: 2026-09-06
Status: Accepted

## Context

AI Operating Platform must serve a future web product and independently evolving applications such as AI Commerce without becoming application-specific or coupling UI to infrastructure.

## Decision

Keep the current Domain/Application/Infrastructure layers as the Core Engine. Introduce Platform API as the future consumer boundary over application services, not as a dependency of the engine. Treat Web Platform and AI Commerce as separate consumers of Platform API contracts.

## Consequences

No HTTP/API implementation is added in v0.3. Future UI and applications require platform-facing DTOs and use cases; they must not import engine domain entities, repositories, runtime implementation or adapters. Agent definitions and management belong to the Platform/Agent milestone, while Execution remains the shared operational unit.

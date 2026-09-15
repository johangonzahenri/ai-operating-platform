# ADR-008: Tentaciones AI Commerce Live Integration Architecture

## Status
Accepted

## Context
Tentaciones AI Commerce is the primary reference implementation demonstrating external AI capabilities (catalog discovery, recommendation, comparison, cart assistance).

## Decision
Integrate Tentaciones via TentacionesPlatformAdapter using authenticated API keys and capability-scoped requests. Tentaciones owns its catalog and cart; Platform owns AI orchestration and intent evaluation.

## Alternatives Considered
- Embedding e-commerce catalog directly into Core Engine: rejected as fundamental violation of separation.

## Consequences
- Zero inventory or price hallucination.
- Graceful degradation to traditional commerce when platform is offline.

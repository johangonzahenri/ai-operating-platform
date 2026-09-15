# ADR-010: Platform Truth Model and Source of Truth (SOT) Governance

## Status
Accepted

## Context
Web consoles and documentation frequently misrepresent simulated or planned features as live infrastructure, harming technical credibility.

## Decision
Enforce a strict Truth Model across all console badges, APIs, and docs:
- Explicit statuses: IMPLEMENTED, PARTIAL, DESIGNED, PLANNED.
- Explicit runtime states: HEALTHY, OPERATIONAL, AVAILABLE, NOT_CONNECTED, OFFLINE, DEGRADED.
- Clear Source of Truth badges (Platform API, Core Engine, Architecture Specification, External Integration).

## Alternatives Considered
- Binary active/inactive statuses: rejected as misleading.

## Consequences
- Uncompromised technical credibility and complete audit transparency.

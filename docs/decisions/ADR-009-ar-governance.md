# ADR-009: AR / 3D Virtual Fitting Room Governance and Sizing Engine

## Status
Accepted

## Context
Virtual fitting room features require governed 3D asset identifiers, avatar body calibrations, and deterministic sizing rules without crashing if 3D assets are missing.

## Decision
Govern AR assets with URN format urn:tentaciones:ar:<category>:<productSlug>, strict SemVer (v1.0.0), avatar profiles (Nova, Sora, Mateo), and deterministic size rules. Malformed or missing assets degrade safely to STANDARD_2D_VIEW.

## Alternatives Considered
- Storing raw unvalidated 3D file URLs in LLM prompts: rejected for hallucination and reliability risks.

## Consequences
- Resilient fitting room experience.
- Reliable size advice backed by deterministic measurement charts.

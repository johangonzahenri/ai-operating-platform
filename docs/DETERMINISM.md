# Determinism in AI Operating Platform

## Definition

> **"Determinism of rules, states, governance and automated baseline. We do NOT claim determinism of actual LLM inferences."**

## What IS Deterministic
- State machine transitions (Task, Execution, Operation)
- Policy evaluation (fail-closed, always DENY or ALLOW)
- Budget enforcement (atomic counters, OCC)
- Event emission (append-only, immutable)
- Recovery reconciliation (idempotent)
- Tool whitelist enforcement
- Memory isolation boundaries
- Tenant isolation boundaries

## What is NOT Deterministic
- LLM inference outputs (vary by provider, model, temperature, context)
- LLM planner outputs (proposals vary per invocation)
- External tool responses (network latency, availability)
- Provider pricing (changes over time)

## Evidence
- 1431+ automated tests verify deterministic platform behavior
- StubModelGateway provides deterministic test doubles
- All state transitions are tested with exact assertions

## Implication for Documentation
When we say "deterministic" in this project, we mean the PLATFORM RULES are deterministic.
We never claim the AI model outputs are deterministic.

# 0001. TypeScript and Node.js for the foundation

Date: 2026-09-05
Status: Accepted

## Context

v0.1 needs typed contracts, deterministic tests and a lightweight runtime without committing the domain to an AI vendor.

## Decision

Use TypeScript in strict mode on Node.js 18+ with the built-in test runner, executed through `tsx`.

## Consequences

Contracts are statically checked and adapters can remain lightweight. Contributors need Node.js tooling; this does not prescribe a web framework or real model SDK.

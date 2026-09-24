# Instructions for AI Agents — AI Operating Platform

Welcome to the **AI Operating Platform** repository (`johangonzahenri/ai-operating-platform`).

All AI agents and automated coding assistants working in this repository **MUST** strictly follow the canonical operating protocols established in:

1. 📋 **[Master Work Plan (docs/MASTER_WORK_PLAN.md)](docs/MASTER_WORK_PLAN.md)**: Official system for active phase tracking, tasks, checklists, and dynamic traceability.
2. 🛡️ **[Agent Operating Protocol (docs/AGENT_OPERATING_PROTOCOL.md)](docs/AGENT_OPERATING_PROTOCOL.md)**: Standard behavioral rules, source-of-truth hierarchy, 3-level indexing (`X / X.Y / X.Y.Z`), security guardrails, and Git guidelines.
3. 🏛️ **[Source of Truth (docs/SOURCE_OF_TRUTH.md)](docs/SOURCE_OF_TRUTH.md)**: Truth hierarchy ($\text{Code} > \text{Tests} > \text{Git} > \text{Docs} > \text{Roadmap} > \text{Excel}$).
4. 🔌 **[Application Integration Guide (docs/APPLICATION_INTEGRATION_GUIDE.md)](docs/APPLICATION_INTEGRATION_GUIDE.md)**: Architectural invariants governing satellite applications consuming the platform via `@ai-platform/client` and OpenAPI 3.1 REST/SSE.

---

## Mandatory Execution Protocol

Before executing any request:
1. Consult `docs/MASTER_WORK_PLAN.md` to identify the active Phase ($X$) and Task ($X.Y$).
2. Never mark tasks as `DONE` without runnable code, passing automated tests (`npm test`), and verifiable evidence.
3. Register unexpected events as `X.Y.Z` adjustments in `docs/MASTER_WORK_PLAN.md`.
4. Run `npm run check` before staging changes.
5. Always use explicit git staging (`git add <files>`), never `git commit --amend` or `git push --force`.

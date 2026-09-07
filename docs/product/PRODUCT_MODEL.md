# Product model

## What AI Operating Platform is

AI Operating Platform is an enterprise AI engine and platform product. It provides reusable operational primitives—tasks, executions, models, tools, events and context—from which multiple products can be built. It is not a chatbot, a provider wrapper, a prompt collection, or an application-specific automation.

## Product boundaries

```
Core Engine → Platform API → Web Platform
     │              │
     └──────────────┴→ Applications
                         ├─ AI Commerce
                         └─ Future applications
```

The **Core Engine** owns domain language, application services, ports and replaceable adapters. It must evolve without depending on HTTP, UI, authentication, provider SDKs or application-specific concepts.

The **Platform API** is the formal product boundary established in v0.7. It translates API requests into application use cases (`SubmitTask`, `ExecuteOrchestration`) and returns stable platform DTOs and read query projections. External consumers and the Web Platform do not call `CoreRuntime`, repositories, adapters, or mutable domain entities directly.

The **Web Platform** is a platform consumer. Its Dashboard, Agents, Tools, Executions Explorer, Governance view, and Playground consume Platform API contracts rather than infrastructure internals.

**Applications** are independent consumers of Platform API. AI Commerce is the first planned example: Sales, Support, Recommendation, Marketing and Inventory agents are application configuration and behavior, never Core Engine classes.

## Capability evolution

Execution is the operational unit: a Task creates an Execution with a shared trace ID, then model and explicit tool operations produce results and events. Sequential orchestration coordinates finite declared sequences of those operations through `CoreRuntime`.

In **v0.8**, the **Agent** capability is introduced on top of this foundation. An Agent binds a model, instructions, an authorized tool whitelist, and an isolated memory scope into an operational capability profile. An Agent executes through `CoreRuntime` using `AgentExecutionStrategy`. Autonomous loops (`while(true)`, `Think -> Act -> Observe`, self-reflection) remain future milestones (v0.9).

## Current v0.8 scope

Implemented:
- Provider-independent model contracts and stub
- Safe in-memory tools and explicit tool gateway/registry
- Sequential declared orchestration integrated with `CoreRuntime` operational lifecycle
- Immutable execution context and scoped in-memory memory gateway
- Enforced centralized operation policy (fail-closed)
- Isolated audit/metrics observability with correlated event streaming
- Execution lifecycle and correlated domain events
- **Agent Capability**: Domain entity, registry port, application service, fail-closed policy checks, tool permission whitelisting, isolated memory scopes, and `AgentExecutionStrategy`
- Decoupled Platform API with typed DTOs and REST endpoints under `/api/v1/agents*`
- Full Web Platform Control Plane with live Agent management and execution Playground
- Zero external runtime npm dependencies and clean `tsc` compilation

Not implemented: real remote providers, autonomous agent loops (v0.9), multi-agent planning/swarms (v0.9), or external application suites (e.g. AI Commerce).

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

The future **Platform API** is the product boundary. It will translate API requests into application-service use cases and return stable platform DTOs. A web application and external applications must not call `CoreRuntime`, repositories, adapters, or domain entities directly.

The future **Web Platform** is a platform consumer. Its Dashboard, Agents, Models, Tools, Executions, Playground, Applications and Settings views will consume Platform API contracts rather than infrastructure internals.

**Applications** are independent consumers of Platform API. AI Commerce is the first planned example: Sales, Support, Recommendation, Marketing and Inventory agents are application configuration and behavior, never Core Engine classes.

## Capability evolution

Execution is the operational unit: a Task creates an Execution with a shared trace ID, then model and explicit tool operations produce results and events. v0.4 coordinates finite declared sequences of those operations. Future Agent Runtime will select models, tools, context and memory on top of this unit; planning and autonomous loops remain later milestones.

## Current v0.3 scope

Implemented: provider-independent model contracts and stub, safe in-memory tools, explicit tool gateway/registry, sequential declared orchestration, immutable execution context, scoped in-memory memory, enforced operation policy, isolated audit/metrics, Execution lifecycle and correlated events.

Not implemented: real providers, agent runtime, autonomous loops, workflows beyond sequential orchestration, RAG/retrieval, authentication/IAM, HTTP API, web UI, or AI Commerce.

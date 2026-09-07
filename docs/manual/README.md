# AI Operating Platform — Comprehensive Project Manual

Welcome to the comprehensive architecture and operational manual for the **AI Operating Platform**.

This repository is not a simple chatbot or an ad-hoc LLM wrapper. It is a foundational, vendor-agnostic **Enterprise AI Operating Platform** engineered to orchestrate Tasks, Executions, Models, Tools, Memory, Observability, Governance, and external Applications with deterministic guarantees, zero external runtime npm dependencies, and strict hexagonal architecture.

## Manual Contents

1. [Chapter 1: Vision & Strategic Positioning](./01_vision.md)
   - The mission of an AI Operating Platform
   - Architectural principles & non-negotiables
   - Progression from Core Engine to Enterprise Control Plane

2. [Chapter 2: The Product Model](./02_product_model.md)
   - Conceptual domain model: Tasks, Executions, Contexts, Policies, Observations
   - Lifecycle state machines and transitions
   - Failure domains and immutability invariants

3. [Chapter 3: Core Engine Architecture](./03_core_engine.md)
   - CoreRuntime and execution strategies
   - Domain events and event pub/sub architecture
   - Models and Tools registry interfaces
   - Context, Memory, Observability, and Governance subsystems

4. [Chapter 4: Platform API Specification](./04_platform_api.md)
   - REST contracts under `/api/v1`
   - Read query ports and projection decoupling
   - Application use cases (`SubmitTask`, `ExecuteOrchestration`)
   - HTTP routing, security enforcement, and ID normalization

5. [Chapter 5: Web Platform Control Plane](./05_web_platform.md)
   - Native Single Page Application (SPA) architecture
   - The 9 core modules (Dashboard, Agents, Models, Tools, Executions, Detail, Playground, Applications, Settings)
   - Dedicated `api-client.js` integration
   - Zero-dependency runtime and XSS-free DOM design

6. [Chapter 6: External Applications & Consumers](./06_applications.md)
   - Consuming the platform from external software systems
   - Case study: AI Commerce Order Fulfillment
   - Boundary enforcement and migration path toward v0.8

7. [Chapter 14: Agents Architecture & Runtime](./14_agents.md)
   - The Agent concept: capability definition vs execution
   - Core invariant: Agent does NOT replace Execution
   - Agent runtime & `AgentExecutionStrategy`
   - Model binding, tool whitelisting, and memory scoping
   - Governance & Observability applied to Agents
   - Non-autonomous boundary in v0.8

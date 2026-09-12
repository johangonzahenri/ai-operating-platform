# AI Operating Platform

AI Operating Platform is a reusable operational platform for governed AI
execution. It coordinates tasks, agents, model providers, tools, policy,
persistence, recovery, and observability without coupling the Core Engine to
any one business application.

The architectural boundary is:

**CORE ENGINE != PLATFORM PRODUCT != APPLICATIONS**

The Core Engine owns execution and governance. The Platform Product exposes
typed contracts, Platform API v1, a TypeScript client, and an operational
console. Applications such as Tentaciones consume the platform through the
API and retain ownership of their own domain data.

## Execution flow

```text
User
  -> Task
  -> Planner
  -> Model
  -> Tool
  -> Policy
  -> Dispatcher
  -> Execution
  -> Events
  -> Observability
  -> Result
```

The model may propose a tool call, but the Core validates the allow-list and
schema, Policy authorizes it, and the Dispatcher executes it. The model never
receives direct tool authority.

## Current capabilities

- Core Engine with tasks, executions, agents, planners, orchestrators, and
  bounded autonomous operations.
- Model routing through Stub, OpenAI, Anthropic, and Ollama gateways.
- Provider-neutral multi-turn tool calling with bounded rounds, calls, and
  execution time.
- Policy-gated registry and dispatcher with schema validation.
- Durable SQLite persistence for operational state, tasks, executions, agents,
  plans, observations, decisions, and events.
- Restart/crash recovery for abandoned operational executions.
- Correlated EventStore audit history and read-only execution observability.
- Platform API v1, Platform Client, and responsive Operational Intelligence
  Console.
- Tentaciones Platform Adapter without copying Tentaciones catalog ownership.
- Explicit MemoryGateway/MemoryService boundaries with an in-memory adapter.
  Durable memory is intentionally not implemented yet; see the Prompt 34
  audit.

## v0.9 foundation

Milestone **v0.9** delivers **Bounded Autonomous Operations** across the platform:
- **AutonomousOperation & AutonomyBudget:** Pure domain aggregate enforcing immutable bounds (`maxSteps`, `maxDurationMs`, `maxToolCalls`, `maxTokens`) with copy-on-write consumption tracking.
- **Planner & Decision Contracts:** Declarative planning decomposition (`PlannerPort`, `Plan`, `PlanStep`) and discrete bounded determinations (`Decision`).
- **Observation & Decision Evaluation Engine:** Pure, side-effect-free evaluation (`DeterministicDecisionEvaluator`) separating step execution from objective achievement.
- **AutonomousOrchestrator:** Coordinates multi-step cycles strictly through `CoreRuntime` with mandatory per-step fail-closed `PolicyGateway` governance.
- **Platform REST API & Web Control Plane:** Full HTTP endpoints (`/api/v1/operations*`) and dedicated SPA dashboard view with pure DOM construction (zero `innerHTML`).
- **Zero Runtime Dependencies:** Native Node.js standard library only (`node:http`, `node:fs`, `node:path`, `node:url`, `node:crypto`). Clean build under official `tsc`.

## Quick Start

### Build & Check
```bash
# Compile with official TypeScript compiler
npm run build

# Run all test suites (contract, unit, integration, platform API)
npm test

# Run complete verification (build + test)
npm run check
```

### Start Server
```bash
npm start
```
By default, the server listens at `http://127.0.0.1:3000`.
- Web Platform Control Plane: `http://127.0.0.1:3000/`
- REST API Health Status: `http://127.0.0.1:3000/api/v1/status`

## Platform API v1

The product API is available under `/api/platform/v1`:

- `GET /health`
- `GET /agents`
- `POST /tasks`
- `POST /tasks/:taskId/execute`
- `GET /executions/:executionId`
- `GET /executions/:executionId/events`

The existing `/api/v1` control-plane endpoints remain available for agents,
tools, models, operations, tasks, executions, metrics, and audit queries.

## REST API Endpoints (/api/v1)

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Web Platform Control Plane (SPA) |
| `GET` | `/api/v1/status` | System health, version, uptime, counts (agents, operations, tasks) |
| `GET` | `/api/v1/operations` | List bounded autonomous operations |
| `POST` | `/api/v1/operations` | Create and execute bounded autonomous operation synchronously |
| `GET` | `/api/v1/operations/:id` | Get operation detail snapshot (budget, consumption, plan, observations, decisions) |
| `POST` | `/api/v1/operations/:id/cancel` | Cancel an active or pending autonomous operation |
| `GET` | `/api/v1/agents` | List registered agents |
| `POST` | `/api/v1/agents` | Register a new agent |
| `GET` | `/api/v1/agents/:id` | Get agent details |
| `PUT` | `/api/v1/agents/:id` | Update agent configuration |
| `POST` | `/api/v1/agents/:id/activate` | Activate an agent |
| `POST` | `/api/v1/agents/:id/deactivate` | Deactivate an agent |
| `POST` | `/api/v1/agents/:id/executions` | Execute an agent through `CoreRuntime` |
| `GET` | `/api/v1/models` | List registered AI models and capabilities |
| `GET` | `/api/v1/models/:id` | Get details of a registered model |
| `GET` | `/api/v1/tools` | List registered tools and capabilities |
| `GET` | `/api/v1/tools/:id` | Get details of a registered tool |
| `GET` | `/api/v1/executions` | List persisted execution projections |
| `POST` | `/api/v1/executions` | Submit new task & execution via `SubmitTask` use case |
| `GET` | `/api/v1/executions/:id` | Get execution projection by ID |
| `GET` | `/api/v1/executions/:id/timeline` | Correlated audit observation timeline for execution |
| `POST` | `/api/v1/orchestrate` | Dispatch multi-operation sequence through `CoreRuntime` |
| `GET` | `/api/v1/metrics` | Real-time counters and recorded metrics |
| `GET` | `/api/v1/audit` | Structured observation stream |
| `GET` | `/api/v1/tasks` | List durable task projections |
| `GET` | `/api/v1/tasks/:id` | Get task projection by ID |

*(Backward-compatible unversioned `/api/*` aliases are also supported).*

## Documentation Reference
- Platform API v1: [docs/PLATFORM_API_V1.md](docs/PLATFORM_API_V1.md)
- Platform Client: [docs/PLATFORM_CLIENT.md](docs/PLATFORM_CLIENT.md)
- Model providers: [docs/MODEL_GATEWAY.md](docs/MODEL_GATEWAY.md)
- Tool calling: [docs/TOOL_CALLING.md](docs/TOOL_CALLING.md)
- Autonomous execution: [docs/AUTONOMOUS_EXECUTION.md](docs/AUTONOMOUS_EXECUTION.md)
- Execution observability: [docs/EXECUTION_OBSERVABILITY.md](docs/EXECUTION_OBSERVABILITY.md)
- Operational console: [docs/OPERATIONAL_CONSOLE.md](docs/OPERATIONAL_CONSOLE.md)
- Tentaciones integration: [docs/TENTACIONES_PLATFORM_INTEGRATION.md](docs/TENTACIONES_PLATFORM_INTEGRATION.md)
- Memory and context audit: [docs/MEMORY_CONTEXT_ARCHITECTURE_AUDIT.md](docs/MEMORY_CONTEXT_ARCHITECTURE_AUDIT.md)
- Comprehensive Project Manual: [docs/manual/README.md](docs/manual/README.md)
- Bounded Autonomous Operations Manual (Chapter 15): [docs/manual/15_autonomous_operations.md](docs/manual/15_autonomous_operations.md)
- Agent Architecture Manual (Chapter 14): [docs/manual/14_agents.md](docs/manual/14_agents.md)
- Architecture Overview: [ARCHITECTURE.md](ARCHITECTURE.md)
- Official Architecture Book: [LIBRO_OFICIAL_AI_OPERATING_PLATFORM.md](LIBRO_OFICIAL_AI_OPERATING_PLATFORM.md)
- Architectural Decisions:
  - ADR 0013: [docs/decisions/0013-bounded-autonomous-operations.md](docs/decisions/0013-bounded-autonomous-operations.md)
  - ADR 0014: [docs/decisions/0014-autonomous-operations-api-integration.md](docs/decisions/0014-autonomous-operations-api-integration.md)
  - ADR 0011: [docs/decisions/0011-agent-architecture.md](docs/decisions/0011-agent-architecture.md)
- Roadmap: [ROADMAP.md](ROADMAP.md)
- Release Notes: [docs/releases/v0.9-release.md](docs/releases/v0.9-release.md)

# AI Operating Platform

An enterprise operational infrastructure foundation for AI systems. It provides reusable operational primitives—tasks, executions, models, tools, sequential orchestration, correlated events, context, memory, and policy governance—from which multiple products and autonomous applications can be built.

## v0.9 Status — Bounded Autonomous Operations (Release Candidate)

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

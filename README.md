# AI Operating Platform

An enterprise operational infrastructure foundation for AI systems. It provides reusable operational primitives—tasks, executions, models, tools, sequential orchestration, correlated events, context, memory, and policy governance—from which multiple products and autonomous applications can be built.

## v0.8 Status — Agents Capability

Milestone **v0.8** promotes **Agent** to a first-class architectural capability across the entire platform:
- **Domain Entity & Port:** Explicit `Agent` aggregate with model binding, behavioral instructions, tool authorization whitelists, memory scopes, and lifecycle status (`ACTIVE`/`INACTIVE`).
- **Core Invariant — Agent Does NOT Replace Execution:** An Agent executes through the existing, singular execution lifecycle (`SubmitTask` -> `CoreRuntime` -> `AgentExecutionStrategy`).
- **Fail-Closed Policy Governance:** Centralized `PolicyGateway` evaluation before any agent execution.
- **Tool Permission Whitelisting:** Strict enforcement of authorized tools (`agent.tools`). Any unauthorized tool call fails immediately.
- **Memory Scope Partitioning:** Memory reads/writes are strictly isolated within the agent's configured `memoryScope`.
- **Full Web Control Plane:** Operational management of Agents in the SPA (list, view, create, activate, deactivate, execute) replacing the previous v0.7 preview tab.
- **Zero Runtime Dependencies:** Native Node.js execution (`node:http`, `node:fs`, `node:path`, `node:url`, `node:crypto`). Clean build under official `tsc`.

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
| `GET` | `/api/v1/status` | System health, version, uptime, counts (including agents) |
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
- Agent Architecture Manual (Chapter 14): [docs/manual/14_agents.md](docs/manual/14_agents.md)
- Architecture Overview: [ARCHITECTURE.md](ARCHITECTURE.md)
- Agents Architecture: [docs/architecture/agents.md](docs/architecture/agents.md)
- Platform API Architecture: [docs/architecture/platform-api.md](docs/architecture/platform-api.md)
- Web Platform Architecture: [docs/architecture/web-platform.md](docs/architecture/web-platform.md)
- Product Control Plane: [docs/product/platform-control-plane.md](docs/product/platform-control-plane.md)
- Product Model: [docs/product/PRODUCT_MODEL.md](docs/product/PRODUCT_MODEL.md)
- Architectural Decisions: [docs/decisions/0011-agent-architecture.md](docs/decisions/0011-agent-architecture.md)
- Roadmap: [ROADMAP.md](ROADMAP.md)

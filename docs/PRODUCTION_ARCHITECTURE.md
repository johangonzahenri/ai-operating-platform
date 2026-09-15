# Production Architecture — AI Operating Platform

## 1. Executive Summary & Architectural Invariant
The **AI Operating Platform** is engineered following strict hexagonal architecture boundaries:
$$\text{CORE ENGINE} \neq \text{PLATFORM PRODUCT} \neq \text{APPLICATIONS}$$

This document contrasts the **Current Validated Local Runtime** against the **Target Production Architecture**, ensuring zero false marketing claims while outlining a hardened path for enterprise scale.

---

## 2. Environment Model & Configuration Boundaries
Four formal lifecycle environments are recognized:
* `development`: Local developer environment with deterministic stub models and local SQLite storage.
* `test`: CI/CD automation runner, in-memory isolation, strict boundary assertions.
* `staging`: Integrated pre-production environment with real external consumer adapters.
* `production`: Hardened multi-tenant runtime with fail-closed configuration validation.

### Configuration Validation
Configuration is parsed at startup via `validateEnvironment()` in `src/infrastructure/config/config.ts`. If required variables are missing or values are out of bounds, startup aborts immediately (**fail-closed**). Domain and application layers never access `process.env` directly.

---

## 3. Runtime Health Model
Platform health is categorized into four distinct dimensions:
1. **Liveness (`/api/health/liveness`)**: Confirms process responsiveness, memory safety, and thread responsiveness.
2. **Readiness (`/api/health/readiness`)**: Confirms database connectivity, schema migration level (V3), and runtime initialization.
3. **Dependency Health (`/api/health/dependencies`)**: Granular status of persistence (SQLite WAL), tool registry, and model gateways.
4. **Application Health (`/api/health/applications`)**: Real-time connectivity and capability grants for registered external consumers.

---

## 4. Graceful Shutdown Protocol
Upon receiving `SIGTERM` or `SIGINT`:
1. **Stop Ingress**: HTTP server stops accepting new connections (`server.close()`).
2. **Drain In-Flight Work**: In-flight tasks are given a bounded grace period (`SHUTDOWN_TIMEOUT_MS`, default 10s).
3. **Flush Observability**: Pending structured audit logs and durable events are synced to SQLite.
4. **Close Persistence**: SQLite database connections are cleanly closed with WAL checkpointing.
5. **Deterministic Exit**: Exit code 0 on clean shutdown; exit code 1 if grace period expires.

---

## 5. Structured Logging & Error Sanitization
* **Zero Secret Leakage**: All log entries run through `sanitizeLogMetadata()`, stripping API keys, Bearer tokens, passwords, and secrets.
* **Public Error Sanitizer**: External API responses never expose SQL queries, stack traces, or internal file paths. Public errors return sanitized RFC 7807-compatible JSON payloads with `code`, `status`, `error`, and `traceId`.

---

## 6. Persistence: Current vs Production Target
* **Current Runtime**: Embedded SQLite 3 with Write-Ahead Logging (WAL), transaction runner, schema migrations V1 $\to$ V2 $\to$ V3, and durability across process restarts.
* **Production Target**: Hexagonal persistence port mapped to a distributed relational store (PostgreSQL / Aurora / CockroachDB) with connection pooling and multi-AZ replication.

---

## 7. Containerization Blueprint
A multi-stage `Dockerfile` is provided for reproducible OCI-compliant container builds:
* **Stage 1 (Builder)**: Node 22 Alpine, installs dependencies, runs build and unit tests.
* **Stage 2 (Runner)**: Minimal unprivileged user (`aiplatform`), read-only root FS compatible, strictly bound ports.

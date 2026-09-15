# Scalability & Resilience Architecture — AI Operating Platform

## 1. Scalability Dimensions
The AI Operating Platform is designed to scale across multiple dimensions without premature microservice fragmentation:
* **Compute / Agent Execution**: Stateless worker execution over durable task queues.
* **API / Ingress**: Asynchronous request handling with bounded backpressure.
* **Persistence**: Append-only SQLite event journaling with migration path to distributed SQL.
* **Model Gateways**: Decoupled provider routing with failover and circuit breaker isolation.
* **Tool Invocation**: Isolated runtime with timeouts and memory bounding.

---

## 2. Bottleneck Analysis & Concurrency
* **Concurrency Model**: Optimistic Concurrency Control (OCC) protects task state transitions.
* **SQLite WAL Concurrency**: Allows concurrent readers alongside a serialized writer, avoiding thread starvation under typical enterprise workloads.
* **Backpressure**: `BackpressureController` limits concurrent active executions (default 50) and returns HTTP 429 / 503 with `Retry-After` when capacity is exceeded.

---

## 3. Worker Queue & Distributed Execution Model
* **Port**: `WorkerQueuePort` (`src/application/ports/worker-queue-port.ts`).
* **Implementation**: `InMemoryWorkerQueue` with lease renewal heartbeats, exponential retries, and dead-letter queue (DLQ) containment.
* **Lease Protocol**: Workers acquire an exclusive lease for $T$ seconds. Heartbeats extend the lease. If a worker crashes, expired leases are automatically reclaimed by healthy workers.

---

## 4. Resilience Patterns
1. **Retry Policy (`src/application/resilience/retry-policy.ts`)**:
   - `RETRYABLE`: Network timeouts, rate limits, SQLite locks.
   - `NON_RETRYABLE`: Validation errors, authorization rejections, schema mismatches.
   - Exponential backoff with full jitter to avoid thundering herd.
2. **Circuit Breaker (`src/application/resilience/circuit-breaker.ts`)**:
   - States: `CLOSED` $\to$ `OPEN` (after 5 consecutive failures) $\to$ `HALF_OPEN` (after 10s cooldown).
3. **Rate Limiting (`src/application/resilience/rate-limiter.ts`)**:
   - Sliding window limiter enforcing quotas per client / tenant / application.

import { test } from "node:test";
import assert from "node:assert";
import { InMemoryWorkerQueue } from "../../src/infrastructure/queue/in-memory-worker-queue.js";
import { RetryPolicy } from "../../src/application/resilience/retry-policy.js";
import { SlidingWindowRateLimiter, BackpressureController } from "../../src/application/resilience/rate-limiter.js";
import { CircuitBreaker } from "../../src/application/resilience/circuit-breaker.js";
import fs from "node:fs";

test("Prompt 70 - Worker Queue: Enqueue, Claim, Heartbeat, and Complete Lifecycle", async () => {
  const queue = new InMemoryWorkerQueue();
  const job = await queue.enqueue("tasks", { taskId: "task-001" }, { maxAttempts: 2 });
  assert.strictEqual(job.status, "QUEUED");

  const claimed = await queue.claimJob("tasks", "worker-A", 1000);
  assert.ok(claimed);
  assert.strictEqual(claimed.claimedBy, "worker-A");
  assert.strictEqual(claimed.status, "PROCESSING");

  const hb = await queue.heartbeat(claimed.jobId, "worker-A", 2000);
  assert.strictEqual(hb.renewed, true);

  const completed = await queue.completeJob(claimed.jobId, "worker-A");
  assert.strictEqual(completed, true);

  const stats = await queue.getStats("tasks");
  assert.strictEqual(stats.completedCount, 1);
});

test("Prompt 70 - Retry Policy: Transient vs Non-Retryable Error Classification", () => {
  const policy = new RetryPolicy();
  assert.strictEqual(policy.classifyError(new Error("ECONNRESET: Connection dropped")), "RETRYABLE");
  assert.strictEqual(policy.classifyError(new Error("sqlite_busy: database is locked")), "RETRYABLE");
  assert.strictEqual(policy.classifyError(new Error("ValidationError: invalid schema")), "NON_RETRYABLE");
  assert.strictEqual(policy.classifyError(new Error("Unauthorized: token invalid")), "NON_RETRYABLE");
});

test("Prompt 70 - Rate Limiting & Backpressure Safeguards", () => {
  const limiter = new SlidingWindowRateLimiter(2, 1000);
  const r1 = limiter.check("app-1");
  const r2 = limiter.check("app-1");
  const r3 = limiter.check("app-1");

  assert.strictEqual(r1.allowed, true);
  assert.strictEqual(r2.allowed, true);
  assert.strictEqual(r3.allowed, false);

  const backpressure = new BackpressureController(2);
  assert.strictEqual(backpressure.acquire(), true);
  assert.strictEqual(backpressure.acquire(), true);
  assert.strictEqual(backpressure.acquire(), false);
  backpressure.release();
  assert.strictEqual(backpressure.acquire(), true);
});

test("Prompt 70 - Circuit Breaker Lifecycle", async () => {
  const breaker = new CircuitBreaker({ failureThreshold: 2, cooldownPeriodMs: 50 });
  let failCount = 0;

  const flakyCall = async () => {
    failCount++;
    if (failCount <= 2) throw new Error("Flaky error");
    return "SUCCESS";
  };

  await assert.rejects(() => breaker.execute(flakyCall));
  await assert.rejects(() => breaker.execute(flakyCall));
  assert.strictEqual(breaker.getState(), "OPEN");

  // Rejects immediately while OPEN
  await assert.rejects(() => breaker.execute(() => Promise.resolve("OK")));

  // Wait for cooldown
  await new Promise((res) => setTimeout(res, 60));
  assert.strictEqual(breaker.getState(), "HALF_OPEN");

  const fallbackResult = await breaker.execute(() => Promise.resolve("RECOVERED"));
  assert.strictEqual(fallbackResult, "RECOVERED");
});

test("Prompt 70 - Scalability Documentation Asset", () => {
  assert.ok(fs.existsSync("docs/SCALABILITY.md"), "SCALABILITY.md must exist");
});

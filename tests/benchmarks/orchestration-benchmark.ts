import { test } from "node:test";
import assert from "node:assert";
import { SlidingWindowRateLimiter, BackpressureController } from "../../src/application/resilience/rate-limiter.js";
import { RetryPolicy } from "../../src/application/resilience/retry-policy.js";
import { InMemoryWorkerQueue } from "../../src/infrastructure/queue/in-memory-worker-queue.js";

test("Benchmark - Scalability & Concurrency Throughput", async () => {
  const queue = new InMemoryWorkerQueue();
  const rateLimiter = new SlidingWindowRateLimiter(1000, 60000);
  const backpressure = new BackpressureController(100);

  const totalOperations = 500;
  const startTime = Date.now();

  const promises = [];
  for (let i = 0; i < totalOperations; i++) {
    promises.push(
      (async (index) => {
        const rateCheck = rateLimiter.check("benchmark-client");
        assert.ok(rateCheck.allowed, "Rate check should allow benchmark client within quota");

        const acquired = backpressure.acquire();
        assert.ok(acquired, "Backpressure should accept operation within limits");

        const job = await queue.enqueue("benchmark-queue", { opId: index, timestamp: Date.now() });
        assert.ok(job.jobId, "Job should be successfully enqueued");

        const claimed = await queue.claimJob("benchmark-queue", "worker-1", 5000);
        if (claimed) {
          await queue.completeJob(claimed.jobId, "worker-1");
        }

        backpressure.release();
      })(i)
    );
  }

  await Promise.all(promises);
  const elapsedMs = Date.now() - startTime;
  const throughput = Math.round((totalOperations / elapsedMs) * 1000);

  console.log(`[Benchmark Result] Completed ${totalOperations} concurrent operations in ${elapsedMs}ms (~ ${throughput} ops/sec)`);
  assert.ok(throughput > 100, "Local in-memory throughput should exceed 100 ops/sec");
});

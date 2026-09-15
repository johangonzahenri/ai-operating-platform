import {
  WorkerQueuePort,
  QueueJob,
  JobStatus,
  QueueStats,
  WorkerHeartbeatResult,
} from "../../application/ports/worker-queue-port.js";
import { randomUUID } from "node:crypto";

export class InMemoryWorkerQueue implements WorkerQueuePort {
  private readonly jobs = new Map<string, QueueJob<any>>();
  private readonly maxDeadLetterLimit: number;

  constructor(maxDeadLetterLimit = 1000) {
    this.maxDeadLetterLimit = maxDeadLetterLimit;
  }

  async enqueue<T>(
    queueName: string,
    payload: T,
    options?: { priority?: number; maxAttempts?: number }
  ): Promise<QueueJob<T>> {
    const now = new Date().toISOString();
    const job: QueueJob<T> = {
      jobId: randomUUID(),
      queueName,
      payload,
      priority: options?.priority ?? 0,
      attemptCount: 0,
      maxAttempts: options?.maxAttempts ?? 3,
      status: "QUEUED",
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(job.jobId, job);
    return job;
  }

  async claimJob<T>(
    queueName: string,
    workerId: string,
    leaseDurationMs: number
  ): Promise<QueueJob<T> | null> {
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    for (const job of this.jobs.values()) {
      if (job.queueName !== queueName) continue;

      const isQueued = job.status === "QUEUED";
      const isExpiredLease =
        job.status === "PROCESSING" &&
        job.leaseExpiresAt &&
        new Date(job.leaseExpiresAt).getTime() < now;

      if (isQueued || isExpiredLease) {
        const updated: QueueJob<T> = {
          ...job,
          status: "PROCESSING",
          claimedBy: workerId,
          attemptCount: job.attemptCount + 1,
          leaseExpiresAt: new Date(now + leaseDurationMs).toISOString(),
          updatedAt: nowIso,
        };
        this.jobs.set(job.jobId, updated);
        return updated;
      }
    }
    return null;
  }

  async heartbeat(
    jobId: string,
    workerId: string,
    extensionMs: number
  ): Promise<WorkerHeartbeatResult> {
    const job = this.jobs.get(jobId);
    if (!job || job.claimedBy !== workerId || job.status !== "PROCESSING") {
      return { renewed: false };
    }

    const now = Date.now();
    const newExpiresAt = new Date(now + extensionMs).toISOString();
    this.jobs.set(jobId, {
      ...job,
      leaseExpiresAt: newExpiresAt,
      updatedAt: new Date(now).toISOString(),
    });

    return { renewed: true, leaseExpiresAt: newExpiresAt };
  }

  async completeJob(jobId: string, workerId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job || job.claimedBy !== workerId || job.status !== "PROCESSING") {
      return false;
    }
    const nowIso = new Date().toISOString();
    this.jobs.set(jobId, {
      ...job,
      status: "COMPLETED",
      updatedAt: nowIso,
    });
    return true;
  }

  async failJob(
    jobId: string,
    workerId: string,
    error: string,
    retryable: boolean
  ): Promise<{ retried: boolean; nextStatus: JobStatus }> {
    const job = this.jobs.get(jobId);
    if (!job || job.claimedBy !== workerId) {
      return { retried: false, nextStatus: "FAILED" };
    }

    const nowIso = new Date().toISOString();
    const canRetry = retryable && job.attemptCount < job.maxAttempts;
    const nextStatus: JobStatus = canRetry ? "QUEUED" : "DEAD_LETTER";

    this.jobs.set(jobId, {
      ...job,
      status: nextStatus,
      lastError: error,
      claimedBy: undefined,
      leaseExpiresAt: undefined,
      updatedAt: nowIso,
    });

    return { retried: canRetry, nextStatus };
  }

  async getStats(queueName: string): Promise<QueueStats> {
    let queued = 0;
    let processing = 0;
    let completed = 0;
    let failed = 0;
    let deadLetter = 0;

    for (const job of this.jobs.values()) {
      if (job.queueName !== queueName) continue;
      if (job.status === "QUEUED") queued++;
      else if (job.status === "PROCESSING") processing++;
      else if (job.status === "COMPLETED") completed++;
      else if (job.status === "FAILED") failed++;
      else if (job.status === "DEAD_LETTER") deadLetter++;
    }

    return {
      queueName,
      queuedCount: queued,
      processingCount: processing,
      completedCount: completed,
      failedCount: failed,
      deadLetterCount: deadLetter,
    };
  }
}

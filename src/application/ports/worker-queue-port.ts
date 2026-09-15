export type JobStatus = "QUEUED" | "CLAIMED" | "PROCESSING" | "COMPLETED" | "FAILED" | "DEAD_LETTER";

export interface QueueJob<T = Record<string, unknown>> {
  readonly jobId: string;
  readonly queueName: string;
  readonly payload: T;
  readonly priority: number;
  readonly attemptCount: number;
  readonly maxAttempts: number;
  readonly status: JobStatus;
  readonly claimedBy?: string | undefined;
  readonly leaseExpiresAt?: string | undefined;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastError?: string | undefined;
}

export interface WorkerLease {
  readonly jobId: string;
  readonly workerId: string;
  readonly leaseExpiresAt: string;
}

export interface WorkerHeartbeatResult {
  readonly renewed: boolean;
  readonly leaseExpiresAt?: string | undefined;
}

export interface QueueStats {
  readonly queueName: string;
  readonly queuedCount: number;
  readonly processingCount: number;
  readonly completedCount: number;
  readonly failedCount: number;
  readonly deadLetterCount: number;
}

export interface WorkerQueuePort {
  enqueue<T>(queueName: string, payload: T, options?: { priority?: number; maxAttempts?: number }): Promise<QueueJob<T>>;
  claimJob<T>(queueName: string, workerId: string, leaseDurationMs: number): Promise<QueueJob<T> | null>;
  heartbeat(jobId: string, workerId: string, extensionMs: number): Promise<WorkerHeartbeatResult>;
  completeJob(jobId: string, workerId: string, resultSummary?: string): Promise<boolean>;
  failJob(jobId: string, workerId: string, error: string, retryable: boolean): Promise<{ retried: boolean; nextStatus: JobStatus }>;
  getStats(queueName: string): Promise<QueueStats>;
}

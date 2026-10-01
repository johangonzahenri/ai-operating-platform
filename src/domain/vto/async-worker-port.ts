/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * Asynchronous Off-Main-Thread Execution Port & Lifecycle Definitions.
 * 
 * Invariants:
 * - Pure architectural interface: domain callers invoke executeTask() without knowledge of runtime.
 * - Explicit lifecycle states: UNINITIALIZED -> STARTING -> READY -> RUNNING -> DRAINING -> TERMINATED -> FAILED.
 * - Backpressure governance: bounded queue size and concurrent task limits.
 * - Deterministic cancellation and timeout enforcement.
 */

import {
  VtoWorkerOperation,
  VtoWorkerRequest,
  VtoWorkerResponse,
  VtoWorkerTaskStatus,
} from "./worker-protocol.js";

export type WorkerLifecycleStatus =
  | "UNINITIALIZED"
  | "STARTING"
  | "READY"
  | "RUNNING"
  | "DRAINING"
  | "TERMINATED"
  | "FAILED";

export interface AsyncWorkerPoolConfig {
  readonly maxConcurrentTasks: number;
  readonly maxQueueSize: number;
  readonly defaultTimeoutMs: number;
  readonly enableTransferables: boolean;
}

export const DEFAULT_ASYNC_WORKER_CONFIG: AsyncWorkerPoolConfig = {
  maxConcurrentTasks: 2,
  maxQueueSize: 16,
  defaultTimeoutMs: 5000,
  enableTransferables: true,
};

export interface WorkerRuntimeStats {
  readonly lifecycleStatus: WorkerLifecycleStatus;
  readonly activeTasksCount: number;
  readonly queuedTasksCount: number;
  readonly totalExecutedTasks: number;
  readonly totalFailedTasks: number;
  readonly totalTimeouts: number;
  readonly totalCancellations: number;
  readonly totalRejections: number;
}

export interface AsyncOffMainThreadExecutionPort {
  readonly lifecycleStatus: WorkerLifecycleStatus;
  readonly stats: WorkerRuntimeStats;

  start(): Promise<void>;
  executeTask<TPayload, TResult>(
    operation: VtoWorkerOperation,
    payload: TPayload,
    options?: {
      timeoutMs?: number;
      abortSignal?: AbortSignal;
      tenantId?: string;
      applicationId?: string;
    }
  ): Promise<VtoWorkerResponse<TResult>>;
  drain(): Promise<void>;
  terminate(): Promise<void>;
}

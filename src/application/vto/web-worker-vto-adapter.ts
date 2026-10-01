/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * WebWorker Peripheral Adapter & Asynchronous Off-Main-Thread Execution Engine.
 * 
 * Location: Peripheral Application Layer (src/application/vto/)
 * 
 * Invariants:
 * - Domain layer is completely decoupled: Worker, postMessage, DOM remain here.
 * - Strict requestId correlation: responses matched deterministically, zero cross-talk.
 * - Bounded queue backpressure: rejects when pending queue or concurrency limit reached.
 * - Explicit timeouts & cancellation via AbortSignal.
 * - Automatic resource cleanup on drain / terminate.
 */

import {
  AsyncOffMainThreadExecutionPort,
  WorkerLifecycleStatus,
  WorkerRuntimeStats,
  AsyncWorkerPoolConfig,
  DEFAULT_ASYNC_WORKER_CONFIG,
} from "../../domain/vto/async-worker-port.js";
import {
  VtoWorkerOperation,
  VtoWorkerRequest,
  VtoWorkerResponse,
  VTO_WORKER_PROTOCOL_VERSION,
} from "../../domain/vto/worker-protocol.js";
import { WorkerLike, SimulatedWebWorker } from "./simulated-web-worker.js";

interface PendingTaskRecord {
  readonly request: VtoWorkerRequest;
  readonly resolve: (res: VtoWorkerResponse<any>) => void;
  readonly reject: (err: any) => void;
  readonly rejectOnError?: boolean | undefined;
  readonly timer?: NodeJS.Timeout | undefined;
  readonly abortCleanup?: (() => void) | undefined;
}

export interface WebWorkerVtoAdapterConfig {
  readonly workerFactory?: () => WorkerLike;
  readonly workerInstance?: WorkerLike;
  readonly poolConfig?: Partial<AsyncWorkerPoolConfig>;
  readonly maxConcurrentTasks?: number;
  readonly maxQueueSize?: number;
  readonly defaultTimeoutMs?: number;
  readonly taskTimeoutMs?: number;
}

export class WebWorkerVtoExecutionAdapter implements AsyncOffMainThreadExecutionPort {
  private _status: WorkerLifecycleStatus = "UNINITIALIZED";
  private _worker?: WorkerLike;
  private _workerFactory: () => WorkerLike;
  private _config: AsyncWorkerPoolConfig;

  // Correlation & Queue Management
  private _pendingTasks = new Map<string, PendingTaskRecord>();
  private _taskQueue: {
    request: VtoWorkerRequest;
    options?: {
      timeoutMs?: number;
      abortSignal?: AbortSignal;
      tenantId?: string;
      applicationId?: string;
    };
    rejectOnError?: boolean;
    resolve: (res: any) => void;
    reject: (err: any) => void;
  }[] = [];

  // Metrics
  private _activeTasksCount = 0;
  private _peakConcurrentTasks = 0;
  private _totalExecutedTasks = 0;
  private _totalFailedTasks = 0;
  private _totalTimeouts = 0;
  private _totalCancellations = 0;
  private _totalRejections = 0;

  constructor(config?: WebWorkerVtoAdapterConfig) {
    const maxConcurrentTasks =
      config?.maxConcurrentTasks ??
      config?.poolConfig?.maxConcurrentTasks ??
      DEFAULT_ASYNC_WORKER_CONFIG.maxConcurrentTasks;
    const maxQueueSize =
      config?.maxQueueSize ??
      config?.poolConfig?.maxQueueSize ??
      DEFAULT_ASYNC_WORKER_CONFIG.maxQueueSize;
    const defaultTimeoutMs =
      config?.taskTimeoutMs ??
      config?.defaultTimeoutMs ??
      config?.poolConfig?.defaultTimeoutMs ??
      DEFAULT_ASYNC_WORKER_CONFIG.defaultTimeoutMs;

    this._config = {
      ...DEFAULT_ASYNC_WORKER_CONFIG,
      ...config?.poolConfig,
      maxConcurrentTasks,
      maxQueueSize,
      defaultTimeoutMs,
    };

    if (config?.workerInstance) {
      this._workerFactory = () => config.workerInstance!;
    } else {
      this._workerFactory = config?.workerFactory ?? (() => new SimulatedWebWorker());
    }
  }

  public get status(): WorkerLifecycleStatus {
    return this._status;
  }

  public get lifecycleStatus(): WorkerLifecycleStatus {
    return this._status;
  }

  public get stats(): WorkerRuntimeStats & {
    totalDispatched: number;
    totalCompleted: number;
    totalFailed: number;
    totalCancelled: number;
    activeTasks: number;
    peakConcurrentTasks: number;
  } {
    const totalDispatched =
      this._totalExecutedTasks +
      this._totalFailedTasks +
      this._totalCancellations +
      this._activeTasksCount;
    const totalCompleted = Math.max(0, this._totalExecutedTasks - this._totalFailedTasks);

    return {
      lifecycleStatus: this._status,
      activeTasksCount: this._activeTasksCount,
      queuedTasksCount: this._taskQueue.length,
      totalExecutedTasks: this._totalExecutedTasks,
      totalFailedTasks: this._totalFailedTasks,
      totalTimeouts: this._totalTimeouts,
      totalCancellations: this._totalCancellations,
      totalRejections: this._totalRejections,
      // Aliases
      totalDispatched,
      totalCompleted,
      totalFailed: this._totalFailedTasks,
      totalCancelled: this._totalCancellations,
      activeTasks: this._activeTasksCount,
      peakConcurrentTasks: this._peakConcurrentTasks,
    };
  }

  public getStats() {
    return this.stats;
  }

  public initialize(): Promise<void> {
    return this.start();
  }

  public async start(): Promise<void> {
    if (this._status === "READY" || this._status === "RUNNING") {
      return;
    }

    this._status = "STARTING";
    try {
      this._worker = this._workerFactory();
      this.attachWorkerListeners();
      this._status = "READY";
    } catch (err) {
      this._status = "FAILED";
      throw new Error(`WORKER_INITIALIZATION_FAILED: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * High-Level Architectural Port Execution Method.
   * Fails closed returning structured error response without throwing.
   */
  public async executeTask<TPayload, TResult>(
    operation: VtoWorkerOperation,
    payload: TPayload,
    options?: {
      timeoutMs?: number;
      abortSignal?: AbortSignal;
      tenantId?: string;
      applicationId?: string;
    }
  ): Promise<VtoWorkerResponse<TResult>> {
    const requestId = `vto-task-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const request: VtoWorkerRequest<TPayload> = {
      protocolVersion: VTO_WORKER_PROTOCOL_VERSION,
      requestId,
      operation,
      payload,
      timestampMs: Date.now(),
      timeoutMs: options?.timeoutMs ?? this._config.defaultTimeoutMs,
      tenantId: options?.tenantId ?? "tenant-default",
      applicationId: options?.applicationId ?? "app-default",
    };

    try {
      return await this.executeInternal<TPayload, TResult>(request, false, options?.abortSignal);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return this.createErrorResponse(
        requestId,
        operation,
        "EXECUTION_FAILURE",
        errMsg
      );
    }
  }

  /**
   * Direct Request Execution Method.
   * Rejects Promise on timeout, cancellation, or crash.
   */
  public async execute<TPayload = any, TResult = any>(
    request: VtoWorkerRequest<TPayload>,
    abortSignal?: AbortSignal
  ): Promise<VtoWorkerResponse<TResult>> {
    return this.executeInternal<TPayload, TResult>(request, true, abortSignal);
  }

  private async executeInternal<TPayload, TResult>(
    request: VtoWorkerRequest<TPayload>,
    rejectOnError: boolean,
    abortSignal?: AbortSignal
  ): Promise<VtoWorkerResponse<TResult>> {
    if (this._status === "DRAINING") {
      throw new Error("Adapter is draining: new requests are rejected");
    }

    if (this._status === "FAILED") {
      throw new Error("Adapter is in FAILED state: worker is unavailable");
    }

    if (this._status === "TERMINATED") {
      throw new Error("Adapter is in TERMINATED state");
    }

    if (this._status === "UNINITIALIZED") {
      await this.start();
    }

    // Check Backpressure
    if (this._taskQueue.length >= this._config.maxQueueSize) {
      this._totalRejections++;
      throw new Error(
        `Backpressure limit exceeded: pending queue size ${this._taskQueue.length} reached maximum ${this._config.maxQueueSize}`
      );
    }

    // Check Pre-aborted Signal
    if (abortSignal?.aborted) {
      this._totalCancellations++;
      throw new Error(`Task ${request.requestId} was already aborted`);
    }

    return new Promise<VtoWorkerResponse<TResult>>((resolve, reject) => {
      this._taskQueue.push({
        request,
        options: {
          timeoutMs: request.timeoutMs,
          abortSignal,
          tenantId: request.tenantId,
          applicationId: request.applicationId,
        },
        rejectOnError,
        resolve,
        reject,
      });

      this.processQueue();
    });
  }

  private processQueue(): void {
    if (this._status !== "READY" && this._status !== "RUNNING") {
      return;
    }

    while (
      this._activeTasksCount < this._config.maxConcurrentTasks &&
      this._taskQueue.length > 0
    ) {
      const item = this._taskQueue.shift();
      if (!item) break;

      const request = item.request;
      const requestId = request.requestId;
      const timeoutMs = request.timeoutMs ?? this._config.defaultTimeoutMs;

      // AbortSignal Handling
      let abortCleanup: (() => void) | undefined;
      if (item.options?.abortSignal) {
        const onAbort = () => {
          this.handleTaskAbort(requestId);
        };
        item.options.abortSignal.addEventListener("abort", onAbort, { once: true });
        abortCleanup = () => {
          item.options?.abortSignal?.removeEventListener("abort", onAbort);
        };
      }

      // Timeout Handling
      const timer = setTimeout(() => {
        this.handleTaskTimeout(requestId, timeoutMs);
      }, timeoutMs);

      this._pendingTasks.set(requestId, {
        request,
        resolve: item.resolve,
        reject: item.reject,
        rejectOnError: item.rejectOnError,
        timer,
        abortCleanup,
      });

      this._activeTasksCount++;
      this._peakConcurrentTasks = Math.max(this._peakConcurrentTasks, this._activeTasksCount);
      this._status = "RUNNING";

      // Dispatch to worker
      try {
        this._worker!.postMessage(request);
      } catch (err) {
        this.cleanupTask(requestId);
        this._totalFailedTasks++;
        const msg = `Failed to postMessage to worker: ${err instanceof Error ? err.message : String(err)}`;
        if (item.rejectOnError) {
          item.reject(new Error(msg));
        } else {
          item.resolve(
            this.createErrorResponse(requestId, request.operation, "EXECUTION_FAILURE", msg)
          );
        }
      }
    }

    if (this._activeTasksCount === 0 && this._taskQueue.length === 0 && this._status === "RUNNING") {
      this._status = "READY";
    }
  }

  private attachWorkerListeners(): void {
    if (!this._worker) return;

    this._worker.addEventListener("message", (event) => {
      const response = event.data as VtoWorkerResponse;
      if (!response || !response.requestId) return;

      const pending = this._pendingTasks.get(response.requestId);
      if (!pending) {
        // Orphaned response (after timeout/abort)
        return;
      }

      this.cleanupTask(response.requestId);
      this._totalExecutedTasks++;

      if (response.status === "FAILED" || response.status === "ERROR") {
        this._totalFailedTasks++;
      }

      pending.resolve(response);
      this.processQueue();
    });

    this._worker.addEventListener("error", (err) => {
      // Worker crash
      this._status = "FAILED";
      const errorMsg = err instanceof Error ? err.message : String(err);

      for (const [reqId, pending] of this._pendingTasks.entries()) {
        this.cleanupTask(reqId);
        this._totalFailedTasks++;
        if (pending.rejectOnError) {
          pending.reject(new Error(`Worker error: ${errorMsg}`));
        } else {
          pending.resolve(
            this.createErrorResponse(
              reqId,
              pending.request.operation,
              "WORKER_UNAVAILABLE",
              `Worker error: ${errorMsg}`
            )
          );
        }
      }

      this._pendingTasks.clear();
      this._taskQueue = [];
    });
  }

  private handleTaskAbort(requestId: string): void {
    const pending = this._pendingTasks.get(requestId);
    if (!pending) return;

    this.cleanupTask(requestId);
    this._totalCancellations++;

    if (pending.rejectOnError) {
      pending.reject(new Error(`Task ${requestId} was aborted`));
    } else {
      pending.resolve(
        this.createErrorResponse(
          requestId,
          pending.request.operation,
          "EXECUTION_CANCELLED",
          "Task execution cancelled via AbortSignal"
        )
      );
    }

    this.processQueue();
  }

  private handleTaskTimeout(requestId: string, timeoutMs: number): void {
    const pending = this._pendingTasks.get(requestId);
    if (!pending) return;

    this.cleanupTask(requestId);
    this._totalTimeouts++;
    this._totalFailedTasks++;

    if (pending.rejectOnError) {
      pending.reject(new Error(`Task ${requestId} timed out after ${timeoutMs}ms`));
    } else {
      pending.resolve(
        this.createErrorResponse(
          requestId,
          pending.request.operation,
          "EXECUTION_TIMEOUT",
          `Task timed out after ${timeoutMs}ms`
        )
      );
    }

    this.processQueue();
  }

  private cleanupTask(requestId: string): void {
    const pending = this._pendingTasks.get(requestId);
    if (pending) {
      if (pending.timer) clearTimeout(pending.timer);
      if (pending.abortCleanup) pending.abortCleanup();
      this._pendingTasks.delete(requestId);
      this._activeTasksCount = Math.max(0, this._activeTasksCount - 1);
    }
  }

  public async drain(): Promise<void> {
    this._status = "DRAINING";
    while (this._activeTasksCount > 0 || this._taskQueue.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    await this.terminate();
  }

  public async terminate(): Promise<void> {
    this._status = "TERMINATED";
    if (this._worker) {
      this._worker.terminate();
      this._worker = undefined;
    }

    for (const [reqId, pending] of this._pendingTasks.entries()) {
      this.cleanupTask(reqId);
      this._totalFailedTasks++;
      if (pending.rejectOnError) {
        pending.reject(new Error("Worker was explicitly terminated"));
      } else {
        pending.resolve(
          this.createErrorResponse(
            reqId,
            pending.request.operation,
            "WORKER_TERMINATED",
            "Worker was explicitly terminated"
          )
        );
      }
    }
    this._pendingTasks.clear();
    this._taskQueue = [];
  }

  private createErrorResponse(
    requestId: string,
    operation: VtoWorkerOperation,
    code: any,
    message: string
  ): VtoWorkerResponse {
    return {
      protocolVersion: VTO_WORKER_PROTOCOL_VERSION,
      requestId,
      operation,
      status: code === "EXECUTION_CANCELLED" ? "CANCELLED" : code === "EXECUTION_TIMEOUT" ? "TIMEOUT" : "FAILED",
      error: { code, message },
      metrics: { queueDurationMs: 0, executionDurationMs: 0, totalDurationMs: 0 },
      completedAtMs: Date.now(),
    };
  }
}

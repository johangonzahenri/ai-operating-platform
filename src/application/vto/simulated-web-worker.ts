/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * Minimal WebWorker Structural Types & Simulated In-Memory Worker Context.
 * 
 * Purpose:
 * Provides a deterministic, dependency-free test double for WebWorker message passing,
 * termination, and error handling in Node.js / CI test environments.
 */

export interface WorkerMessageEventLike<T = any> {
  readonly data: T;
}

export interface WorkerLike {
  postMessage(message: any, transfer?: any[]): void;
  terminate(): void;
  addEventListener(type: "message", listener: (event: WorkerMessageEventLike) => void): void;
  addEventListener(type: "error", listener: (error: any) => void): void;
  removeEventListener(type: string, listener: (...args: any[]) => void): void;
}

export type WorkerConstructorLike = new (scriptURL: string | URL, options?: any) => WorkerLike;

/**
 * Deterministic In-Memory Simulated Worker executing tasks via VtoWorkerRuntimeDispatcher.
 */
import { VtoWorkerRuntimeDispatcher } from "./worker-runtime-dispatcher.js";

export class SimulatedWebWorker implements WorkerLike {
  private _messageListeners: ((event: WorkerMessageEventLike) => void)[] = [];
  private _errorListeners: ((error: any) => void)[] = [];
  private _dispatcher = new VtoWorkerRuntimeDispatcher();
  public isTerminated = false;
  public executionDelayMs = 0;

  constructor(options?: { executionDelayMs?: number; simulatedDelayMs?: number }) {
    this.executionDelayMs = options?.executionDelayMs ?? options?.simulatedDelayMs ?? 0;
  }

  public simulateError(err: any): void {
    this.emitError(err);
  }

  public postMessage(message: any, transfer?: any[]): void {
    if (this.isTerminated) {
      this.emitError(new Error("WORKER_TERMINATED: Cannot post message to terminated worker"));
      return;
    }

    // Process asynchronously off call stack (simulating background thread)
    setTimeout(async () => {
      if (this.isTerminated) return;

      try {
        const response = await this._dispatcher.dispatch(message);
        this.emitMessage({ data: response });
      } catch (err) {
        this.emitError(err);
      }
    }, this.executionDelayMs);
  }

  public terminate(): void {
    this.isTerminated = true;
    this._messageListeners = [];
    this._errorListeners = [];
  }

  public addEventListener(type: string, listener: any): void {
    if (type === "message") {
      this._messageListeners.push(listener);
    } else if (type === "error") {
      this._errorListeners.push(listener);
    }
  }

  public removeEventListener(type: string, listener: any): void {
    if (type === "message") {
      this._messageListeners = this._messageListeners.filter((l) => l !== listener);
    } else if (type === "error") {
      this._errorListeners = this._errorListeners.filter((l) => l !== listener);
    }
  }

  private emitMessage(event: WorkerMessageEventLike): void {
    for (const listener of [...this._messageListeners]) {
      listener(event);
    }
  }

  private emitError(err: any): void {
    for (const listener of [...this._errorListeners]) {
      listener(err);
    }
  }
}

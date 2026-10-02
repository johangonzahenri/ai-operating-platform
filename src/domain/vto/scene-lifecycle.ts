/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * Scene Lifecycle State Machine, Resource Management & Disposal Contracts.
 * 
 * Invariants:
 * 1. Hexagonal Domain Purity: Zero references to DOM, HTMLCanvasElement, THREE, WebGL, or WebGPU.
 * 2. Deterministic State Transitions:
 *    UNINITIALIZED -> INITIALIZING -> READY <-> RENDERING <-> PAUSED -> DISPOSING -> DISPOSED
 *    (with ERROR paths and fail-closed handling).
 * 3. Strict Resource Disposal Ownership: Every allocated render resource (geometry, texture, buffer)
 *    must be registerable and deterministically disposable with zero memory leaks.
 * 4. Terminal State Protection: A DISPOSED scene is permanently sealed and rejects subsequent operations.
 */

export type SceneLifecycleState =
  | "UNINITIALIZED"
  | "INITIALIZING"
  | "READY"
  | "RENDERING"
  | "PAUSED"
  | "DISPOSING"
  | "DISPOSED"
  | "ERROR";

export type RenderResourceType =
  | "GEOMETRY"
  | "TEXTURE"
  | "MATERIAL"
  | "BUFFER"
  | "RENDER_TARGET"
  | "VIEWPORT";

export interface RenderResourceRecord {
  readonly resourceId: string;
  readonly type: RenderResourceType;
  readonly allocatedAtMs: number;
  readonly sizeBytesEst?: number | undefined;
  readonly disposedAtMs?: number | undefined;
  readonly isDisposed: boolean;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export interface DisposalReceipt {
  readonly sceneId: string;
  readonly disposedResourceCount: number;
  readonly totalBytesFreedEst: number;
  readonly durationMs: number;
  readonly timestampMs: number;
  readonly errors: readonly string[];
}

export interface SceneLifecycleEventListener {
  onStateChange?(from: SceneLifecycleState, to: SceneLifecycleState, sceneId: string): void;
  onResourceRegistered?(resource: RenderResourceRecord): void;
  onResourceDisposed?(resourceId: string): void;
  onError?(error: Error, sceneId: string): void;
}

/**
 * Validates state transitions for a 3D/VTO scene according to finite state machine rules.
 */
export function isValidSceneStateTransition(
  from: SceneLifecycleState,
  to: SceneLifecycleState
): boolean {
  if (from === to) return true;

  switch (from) {
    case "UNINITIALIZED":
      return to === "INITIALIZING" || to === "DISPOSED";
    case "INITIALIZING":
      return to === "READY" || to === "ERROR" || to === "DISPOSING";
    case "READY":
      return to === "RENDERING" || to === "PAUSED" || to === "DISPOSING" || to === "ERROR";
    case "RENDERING":
      return to === "READY" || to === "PAUSED" || to === "DISPOSING" || to === "ERROR";
    case "PAUSED":
      return to === "READY" || to === "RENDERING" || to === "DISPOSING" || to === "ERROR";
    case "ERROR":
      return to === "INITIALIZING" || to === "DISPOSING" || to === "DISPOSED";
    case "DISPOSING":
      return to === "DISPOSED" || to === "ERROR";
    case "DISPOSED":
      return false; // Terminal state
    default:
      return false;
  }
}

/**
 * Domain manager for scene lifecycle and render resource registration/disposal tracking.
 */
export class SceneLifecycleManager {
  private readonly sceneId: string;
  private state: SceneLifecycleState = "UNINITIALIZED";
  private readonly resources = new Map<string, RenderResourceRecord>();
  private readonly listeners: SceneLifecycleEventListener[] = [];
  private lastError?: Error | undefined;

  constructor(sceneId: string) {
    if (!sceneId || sceneId.trim().length === 0) {
      throw new Error("SceneLifecycleManager requires a non-empty sceneId");
    }
    this.sceneId = sceneId.trim();
  }

  public getSceneId(): string {
    return this.sceneId;
  }

  public getState(): SceneLifecycleState {
    return this.state;
  }

  public getLastError(): Error | undefined {
    return this.lastError;
  }

  public addListener(listener: SceneLifecycleEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx !== -1) {
        this.listeners.splice(idx, 1);
      }
    };
  }

  public transitionTo(targetState: SceneLifecycleState): void {
    if (this.state === "DISPOSED") {
      throw new Error(`Cannot transition from terminal state DISPOSED to ${targetState}`);
    }

    if (!isValidSceneStateTransition(this.state, targetState)) {
      throw new Error(
        `Invalid scene lifecycle transition from ${this.state} to ${targetState} for scene ${this.sceneId}`
      );
    }

    const previous = this.state;
    this.state = targetState;

    for (const listener of this.listeners) {
      try {
        listener.onStateChange?.(previous, targetState, this.sceneId);
      } catch {
        // Listener safety
      }
    }
  }

  public setError(error: Error): void {
    this.lastError = error;
    if (this.state !== "DISPOSED") {
      const previous = this.state;
      this.state = "ERROR";
      for (const listener of this.listeners) {
        try {
          listener.onError?.(error, this.sceneId);
          listener.onStateChange?.(previous, "ERROR", this.sceneId);
        } catch {
          // Listener safety
        }
      }
    }
  }

  public registerResource(
    resourceId: string,
    type: RenderResourceType,
    sizeBytesEst: number = 0,
    metadata?: Record<string, unknown>
  ): RenderResourceRecord {
    if (this.state === "DISPOSED" || this.state === "DISPOSING") {
      throw new Error(`Cannot register resource ${resourceId} while scene is ${this.state}`);
    }

    const record: RenderResourceRecord = {
      resourceId,
      type,
      allocatedAtMs: Date.now(),
      sizeBytesEst: Math.max(0, sizeBytesEst),
      isDisposed: false,
      metadata: metadata ? Object.freeze({ ...metadata }) : undefined,
    };

    this.resources.set(resourceId, record);

    for (const listener of this.listeners) {
      try {
        listener.onResourceRegistered?.(record);
      } catch {
        // Listener safety
      }
    }

    return record;
  }

  public markResourceDisposed(resourceId: string): boolean {
    const existing = this.resources.get(resourceId);
    if (!existing || existing.isDisposed) {
      return false;
    }

    const updated: RenderResourceRecord = {
      ...existing,
      isDisposed: true,
      disposedAtMs: Date.now(),
    };
    this.resources.set(resourceId, updated);

    for (const listener of this.listeners) {
      try {
        listener.onResourceDisposed?.(resourceId);
      } catch {
        // Listener safety
      }
    }

    return true;
  }

  public getResource(resourceId: string): RenderResourceRecord | undefined {
    return this.resources.get(resourceId);
  }

  public getActiveResources(): readonly RenderResourceRecord[] {
    return Array.from(this.resources.values()).filter((r) => !r.isDisposed);
  }

  public getAllResources(): readonly RenderResourceRecord[] {
    return Array.from(this.resources.values());
  }

  /**
   * Deterministically disposes all tracked resources and transitions to DISPOSED.
   */
  public disposeAll(customDisposer?: (resource: RenderResourceRecord) => void): DisposalReceipt {
    if (this.state === "DISPOSED") {
      return {
        sceneId: this.sceneId,
        disposedResourceCount: 0,
        totalBytesFreedEst: 0,
        durationMs: 0,
        timestampMs: Date.now(),
        errors: [],
      };
    }

    const startMs = Date.now();
    this.transitionTo("DISPOSING");

    let disposedCount = 0;
    let freedBytes = 0;
    const errors: string[] = [];

    for (const [id, record] of this.resources.entries()) {
      if (!record.isDisposed) {
        try {
          if (customDisposer) {
            customDisposer(record);
          }
          this.resources.set(id, {
            ...record,
            isDisposed: true,
            disposedAtMs: Date.now(),
          });
          disposedCount++;
          freedBytes += record.sizeBytesEst ?? 0;
          for (const listener of this.listeners) {
            try {
              listener.onResourceDisposed?.(id);
            } catch {
              // Listener safety
            }
          }
        } catch (err) {
          errors.push(`Failed to dispose resource ${id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    this.transitionTo("DISPOSED");

    return {
      sceneId: this.sceneId,
      disposedResourceCount: disposedCount,
      totalBytesFreedEst: freedBytes,
      durationMs: Math.max(0, Date.now() - startMs),
      timestampMs: Date.now(),
      errors,
    };
  }
}

/**
 * Canonical cancellation token for the AI Operating Platform.
 * Provides both synchronous polling (isCancelled) and asynchronous abort (signal).
 * 
 * @invariant Once cancelled, cannot be uncancelled.
 * @invariant AbortSignal is propagated to all downstream consumers.
 */

export interface CancellationReason {
  readonly source: 'operator' | 'budget' | 'policy' | 'timeout' | 'parent' | 'system';
  readonly message: string;
  readonly timestamp: Date;
  readonly propagationPath: string[];
}

export interface CancellationToken {
  readonly isCancelled: boolean;
  readonly signal: AbortSignal;
  readonly reason?: CancellationReason;
  cancel(reason: CancellationReason): void;
}

export class PlatformCancellationToken implements CancellationToken {
  private readonly controller: AbortController;
  private _reason?: CancellationReason;

  constructor() {
    this.controller = new AbortController();
  }

  get isCancelled(): boolean {
    return this.controller.signal.aborted;
  }

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  get reason(): CancellationReason | undefined {
    return this._reason;
  }

  cancel(reason: CancellationReason): void {
    if (!this.isCancelled) {
      this._reason = reason;
      this.controller.abort(reason.message);
    }
  }

  /** Create a child token that cancels when parent cancels */
  static createChild(parent: CancellationToken): PlatformCancellationToken {
    const child = new PlatformCancellationToken();
    if (parent.isCancelled) {
      child.cancel({
        source: 'parent',
        message: parent.reason?.message ?? 'Parent cancelled',
        timestamp: new Date(),
        propagationPath: [...(parent.reason?.propagationPath ?? []), 'child']
      });
    } else {
      parent.signal.addEventListener('abort', () => {
        child.cancel({
          source: 'parent',
          message: parent.reason?.message ?? 'Parent cancelled',
          timestamp: new Date(),
          propagationPath: [...(parent.reason?.propagationPath ?? []), 'child']
        });
      }, { once: true });
    }
    return child;
  }
}

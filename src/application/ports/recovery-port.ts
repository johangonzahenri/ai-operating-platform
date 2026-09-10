/**
 * Diagnostic and audit result produced by a restart reconciliation run.
 */
export interface RecoveryResult {
  readonly inspectedTasks: number;
  readonly reconciledTasks: number;
  readonly alreadyTerminalTasks: number;
  readonly inspectedExecutions: number;
  readonly reconciledExecutions: number;
  readonly alreadyTerminalExecutions: number;
  readonly inspectedOperations?: number | undefined;
  readonly reconciledOperations?: number | undefined;
  readonly alreadyTerminalOperations?: number | undefined;
  readonly errors: readonly string[];
}

/**
 * Port abstracting transactional boundaries for atomic multi-entity reconciliation.
 */
export interface TransactionRunner {
  run<T>(fn: () => T): T;
}

/**
 * Application port for triggering crash recovery and restart reconciliation.
 */
export interface RecoveryPort {
  reconcile(): Promise<RecoveryResult> | RecoveryResult;
}

/**
 * AI Operating Platform - Autonomous Runtime Errors
 * 
 * Typed domain errors for AutonomousOperationsRuntime, Triggers, and Leases.
 */

export class AutonomousRuntimeValidationError extends Error {
  readonly status = 400;
  readonly code = "AUTONOMOUS_RUNTIME_VALIDATION_ERROR";

  constructor(message: string, readonly details?: unknown) {
    super(message);
    this.name = "AutonomousRuntimeValidationError";
  }
}

export class AutonomousTriggerNotFoundError extends Error {
  readonly status = 404;
  readonly code = "TRIGGER_NOT_FOUND";

  constructor(readonly triggerId: string, readonly tenantId: string) {
    super(`Autonomous Trigger '${triggerId}' was not found in tenant '${tenantId}'`);
    this.name = "AutonomousTriggerNotFoundError";
  }
}

export class RuntimeLeaseConflictError extends Error {
  readonly status = 409;
  readonly code = "LEASE_CONFLICT";

  constructor(
    readonly resourceId: string,
    readonly currentOwner: string,
    readonly attemptedOwner: string
  ) {
    super(
      `Runtime lease conflict on resource '${resourceId}': currently held by '${currentOwner}', attempted claim by '${attemptedOwner}'`
    );
    this.name = "RuntimeLeaseConflictError";
  }
}

export class RuntimeSafetyHaltError extends Error {
  readonly status = 423;
  readonly code = "SAFETY_HALTED";

  constructor(
    readonly tenantId: string,
    readonly consecutiveFailures: number,
    readonly reason: string
  ) {
    super(
      `Autonomous operations safety halted for tenant '${tenantId}' after ${consecutiveFailures} consecutive failures: ${reason}`
    );
    this.name = "RuntimeSafetyHaltError";
  }
}

export class RuntimeUnauthorizedError extends Error {
  readonly status = 403;
  readonly code = "UNAUTHORIZED_RUNTIME_ACTION";

  constructor(message: string) {
    super(message);
    this.name = "RuntimeUnauthorizedError";
  }
}

export class InvalidRuntimeStateTransitionError extends Error {
  readonly status = 409;
  readonly code = "INVALID_RUNTIME_TRANSITION";

  constructor(readonly fromState: string, readonly toState: string) {
    super(`Invalid AutonomousRuntime transition from '${fromState}' to '${toState}'`);
    this.name = "InvalidRuntimeStateTransitionError";
  }
}

export class DuplicateTriggerExecutionError extends Error {
  readonly status = 409;
  readonly code = "DUPLICATE_TRIGGER_EXECUTION";

  constructor(readonly triggerKey: string, readonly windowOrEventId: string) {
    super(`Trigger '${triggerKey}' has already executed or is currently running for window/event '${windowOrEventId}'`);
    this.name = "DuplicateTriggerExecutionError";
  }
}

/**
 * AI Operating Platform - Mandate Reconciliation Domain Errors
 */

export class ReconciliationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReconciliationError";
  }
}

export class ReconciliationValidationError extends ReconciliationError {
  constructor(message: string) {
    super(message);
    this.name = "ReconciliationValidationError";
  }
}

export class ReconciliationConcurrencyConflictError extends ReconciliationError {
  constructor(
    readonly entityId: string,
    readonly expectedVersion: number,
    readonly actualVersion: number
  ) {
    super(
      `Optimistic concurrency conflict on entity '${entityId}': expected version ${expectedVersion}, found ${actualVersion}`
    );
    this.name = "ReconciliationConcurrencyConflictError";
  }
}

export class ReconciliationStaleMandateError extends ReconciliationError {
  constructor(mandateId: string, message: string = "Mandate snapshot is stale") {
    super(`Stale mandate '${mandateId}': ${message}`);
    this.name = "ReconciliationStaleMandateError";
  }
}

export class ReconciliationPolicyViolationError extends ReconciliationError {
  constructor(message: string) {
    super(`Reconciliation policy violation: ${message}`);
    this.name = "ReconciliationPolicyViolationError";
  }
}

export class ReconciliationEmergencyHaltActiveError extends ReconciliationError {
  constructor(message: string = "Emergency halt is currently active; reconciliation mutations cannot proceed") {
    super(message);
    this.name = "ReconciliationEmergencyHaltActiveError";
  }
}

export class ReconciliationTenantMismatchError extends ReconciliationError {
  constructor(message: string = "Mandate does not belong to the requesting tenant") {
    super(message);
    this.name = "ReconciliationTenantMismatchError";
  }
}

export class ReconciliationPolicyDeniedError extends ReconciliationError {
  constructor(message: string = "Reconciliation policy denied execution") {
    super(message);
    this.name = "ReconciliationPolicyDeniedError";
  }
}

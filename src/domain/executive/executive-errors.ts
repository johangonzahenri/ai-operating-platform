/**
 * AI Operating Platform - Executive Domain Errors
 */

export class ExecutiveCycleValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExecutiveCycleValidationError";
  }
}

export class InvalidExecutiveCycleTransitionError extends Error {
  constructor(readonly fromState: string, readonly toState: string) {
    super(`Invalid ExecutiveCycle transition from '${fromState}' to '${toState}'`);
    this.name = "InvalidExecutiveCycleTransitionError";
  }
}

export class ExecutivePlanValidationError extends Error {
  constructor(message: string, readonly violations: readonly string[] = []) {
    super(message);
    this.name = "ExecutivePlanValidationError";
  }
}

export class ExecutiveGovernanceViolationError extends Error {
  constructor(message: string, readonly reasonCode: string = "GOVERNANCE_VIOLATION") {
    super(message);
    this.name = "ExecutiveGovernanceViolationError";
  }
}

export class ExecutiveCycleExhaustedError extends Error {
  constructor(readonly cycleId: string, readonly limitType: string, readonly limitValue: number) {
    super(`ExecutiveCycle '${cycleId}' exhausted ${limitType} limit of ${limitValue}`);
    this.name = "ExecutiveCycleExhaustedError";
  }
}

export class ExecutiveConcurrencyConflictError extends Error {
  constructor(
    readonly entityId: string,
    readonly expectedVersion: number,
    readonly actualVersion: number
  ) {
    super(
      `Concurrency conflict on executive entity '${entityId}': expected version ${expectedVersion}, found ${actualVersion}`
    );
    this.name = "ExecutiveConcurrencyConflictError";
  }
}

export class ExecutiveResourceNotFoundError extends Error {
  constructor(readonly resourceType: string, readonly resourceId: string, readonly tenantId?: string) {
    super(`Executive ${resourceType} '${resourceId}' not found${tenantId ? ` in tenant '${tenantId}'` : ""}`);
    this.name = "ExecutiveResourceNotFoundError";
  }
}

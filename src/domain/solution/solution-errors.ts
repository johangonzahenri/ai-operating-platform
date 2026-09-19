/**
 * AI Operating Platform - AI Solutions Factory Domain Errors
 * 
 * Formal error hierarchy for AI Solution lifecycle, blueprint composition,
 * versioning, deterministic validation, publish gate, and tenant isolation.
 */

export abstract class SolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SolutionError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class SolutionValidationError extends SolutionError {
  readonly code = "SOLUTION_VALIDATION_ERROR";
  readonly validationErrors: readonly string[];

  constructor(message: string, validationErrors: readonly string[] = []) {
    super(message);
    this.name = "SolutionValidationError";
    this.validationErrors = Object.freeze([...validationErrors]);
  }
}

export class SolutionNotFoundError extends SolutionError {
  readonly code = "SOLUTION_NOT_FOUND";
  readonly solutionId: string;
  readonly tenantId?: string | undefined;

  constructor(solutionId: string, tenantId?: string | undefined) {
    super(`AI Solution '${solutionId}' not found${tenantId ? ` in tenant '${tenantId}'` : ""}`);
    this.name = "SolutionNotFoundError";
    this.solutionId = solutionId;
    this.tenantId = tenantId;
  }
}

export class SolutionVersionNotFoundError extends SolutionError {
  readonly code = "SOLUTION_VERSION_NOT_FOUND";
  readonly solutionId: string;
  readonly version: number;

  constructor(solutionId: string, version: number) {
    super(`Version ${version} of AI Solution '${solutionId}' not found`);
    this.name = "SolutionVersionNotFoundError";
    this.solutionId = solutionId;
    this.version = version;
  }
}

export class InvalidSolutionLifecycleTransitionError extends SolutionError {
  readonly code = "INVALID_SOLUTION_LIFECYCLE_TRANSITION";
  readonly currentState: string;
  readonly targetState: string;

  constructor(currentState: string, targetState: string, reason?: string) {
    super(
      `Cannot transition AI Solution from state '${currentState}' to '${targetState}'${
        reason ? `: ${reason}` : ""
      }`
    );
    this.name = "InvalidSolutionLifecycleTransitionError";
    this.currentState = currentState;
    this.targetState = targetState;
  }
}

export class SolutionNotValidatedError extends SolutionError {
  readonly code = "SOLUTION_NOT_VALIDATED";
  readonly solutionId: string;

  constructor(solutionId: string, details?: string) {
    super(
      `Cannot publish AI Solution '${solutionId}' because it has not passed deterministic blueprint validation${
        details ? `: ${details}` : ""
      }`
    );
    this.name = "SolutionNotValidatedError";
    this.solutionId = solutionId;
  }
}

export class SolutionPublishedImmutableError extends SolutionError {
  readonly code = "SOLUTION_PUBLISHED_IMMUTABLE";
  readonly solutionId: string;
  readonly version: number;

  constructor(solutionId: string, version: number) {
    super(
      `Published AI Solution '${solutionId}' version ${version} is immutable and cannot be modified. Create a new version instead.`
    );
    this.name = "SolutionPublishedImmutableError";
    this.solutionId = solutionId;
    this.version = version;
  }
}

export class SolutionConcurrencyConflictError extends SolutionError {
  readonly code = "SOLUTION_CONCURRENCY_CONFLICT";
  readonly solutionId: string;
  readonly expectedVersion: number;
  readonly actualVersion: number;

  constructor(solutionId: string, expectedVersion: number, actualVersion: number) {
    super(
      `Optimistic concurrency conflict on AI Solution '${solutionId}': expected version ${expectedVersion}, but current version is ${actualVersion}`
    );
    this.name = "SolutionConcurrencyConflictError";
    this.solutionId = solutionId;
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }
}

export class SolutionTenantMismatchError extends SolutionError {
  readonly code = "SOLUTION_TENANT_MISMATCH";
  readonly requestedTenantId: string;
  readonly targetTenantId: string;

  constructor(requestedTenantId: string, targetTenantId: string) {
    super(
      `Tenant access violation: Caller tenant '${requestedTenantId}' cannot access AI Solution belonging to tenant '${targetTenantId}'`
    );
    this.name = "SolutionTenantMismatchError";
    this.requestedTenantId = requestedTenantId;
    this.targetTenantId = targetTenantId;
  }
}

export class SolutionBlueprintValidationError extends SolutionError {
  readonly code = "SOLUTION_BLUEPRINT_VALIDATION_ERROR";
  readonly validationErrors: readonly string[];

  constructor(message: string, validationErrors: readonly string[] = []) {
    super(message);
    this.name = "SolutionBlueprintValidationError";
    this.validationErrors = Object.freeze([...validationErrors]);
  }
}

export class SolutionDependencyCycleError extends SolutionError {
  readonly code = "SOLUTION_DEPENDENCY_CYCLE";
  readonly cyclePath: readonly string[];

  constructor(cyclePath: readonly string[]) {
    super(`Circular dependency detected in solution composition graph: ${cyclePath.join(" -> ")}`);
    this.name = "SolutionDependencyCycleError";
    this.cyclePath = Object.freeze([...cyclePath]);
  }
}

export class UnauthorizedSolutionOperatorError extends SolutionError {
  readonly code = "UNAUTHORIZED_SOLUTION_OPERATOR";
  readonly principalId: string;
  readonly action: string;

  constructor(principalId: string, action: string, reason?: string) {
    super(`Principal '${principalId}' is unauthorized to perform action '${action}' on AI Solution${reason ? `: ${reason}` : ""}`);
    this.name = "UnauthorizedSolutionOperatorError";
    this.principalId = principalId;
    this.action = action;
  }
}

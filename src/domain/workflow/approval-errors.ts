/**
 * Domain errors for Human Oversight, Approval & Escalation Governance.
 */

export class ApprovalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApprovalError";
  }
}

export class ApprovalValidationError extends ApprovalError {
  constructor(message: string) {
    super(message);
    this.name = "ApprovalValidationError";
  }
}

export class ApprovalNotFoundError extends ApprovalError {
  constructor(readonly approvalId: string, message?: string) {
    super(message ?? `ApprovalRequest '${approvalId}' was not found`);
    this.name = "ApprovalNotFoundError";
  }
}

export class SelfApprovalError extends ApprovalError {
  constructor(readonly approverId: string, message?: string) {
    super(
      message ??
        `Self-approval rejected: Principal '${approverId}' cannot approve their own request or produced output`
    );
    this.name = "SelfApprovalError";
  }
}

export class ApprovalExpiredError extends ApprovalError {
  constructor(readonly approvalId: string, message?: string) {
    super(message ?? `ApprovalRequest '${approvalId}' has expired and can no longer be decided`);
    this.name = "ApprovalExpiredError";
  }
}

export class ApprovalConcurrencyConflictError extends ApprovalError {
  constructor(
    readonly approvalId: string,
    readonly expectedVersion: number,
    readonly actualVersion: number
  ) {
    super(
      `ApprovalRequest '${approvalId}' concurrency conflict: expected version ${expectedVersion}, but found ${actualVersion}`
    );
    this.name = "ApprovalConcurrencyConflictError";
  }
}

export class ApprovalPolicyDeniedError extends ApprovalError {
  constructor(
    readonly approvalId: string,
    readonly policyId: string,
    readonly reason: string
  ) {
    super(`ApprovalRequest '${approvalId}' denied by policy '${policyId}': ${reason}`);
    this.name = "ApprovalPolicyDeniedError";
  }
}

export class ApprovalTenantMismatchError extends ApprovalError {
  constructor(readonly requestTenantId: string, readonly callerTenantId: string) {
    super(
      `Tenant boundary violation: Request tenant '${requestTenantId}' does not match caller tenant '${callerTenantId}'`
    );
    this.name = "ApprovalTenantMismatchError";
  }
}

export class ApprovalInvalidStateTransitionError extends ApprovalError {
  constructor(
    readonly approvalId: string,
    readonly fromState: string,
    readonly toState: string
  ) {
    super(
      `Invalid approval state transition for '${approvalId}': cannot transition from '${fromState}' to '${toState}'`
    );
    this.name = "ApprovalInvalidStateTransitionError";
  }
}

export class UnauthorizedApproverError extends ApprovalError {
  constructor(readonly approverId: string, readonly reason: string) {
    super(`Unauthorized approver '${approverId}': ${reason}`);
    this.name = "UnauthorizedApproverError";
  }
}

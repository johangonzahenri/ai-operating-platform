export class AgentLifecycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentLifecycleError";
  }
}

export class AgentLifecycleValidationError extends AgentLifecycleError {
  constructor(message: string) {
    super(message);
    this.name = "AgentLifecycleValidationError";
  }
}

export class AgentLifecycleNotFoundError extends AgentLifecycleError {
  constructor(readonly agentId: string) {
    super(`Agent lifecycle record not found for agent: '${agentId}'`);
    this.name = "AgentLifecycleNotFoundError";
  }
}

export class AgentEvaluationNotFoundError extends AgentLifecycleError {
  constructor(readonly evaluationId: string) {
    super(`Agent evaluation not found: '${evaluationId}'`);
    this.name = "AgentEvaluationNotFoundError";
  }
}

export class InvalidLifecycleTransitionError extends AgentLifecycleError {
  constructor(readonly fromState: string, readonly toState: string, reason?: string) {
    super(
      `Invalid agent lifecycle transition from '${fromState}' to '${toState}'${reason ? `: ${reason}` : ""}`
    );
    this.name = "InvalidLifecycleTransitionError";
  }
}

export class AgentSuspendedError extends AgentLifecycleError {
  constructor(readonly agentId: string, readonly reason?: string) {
    super(`Agent '${agentId}' is currently suspended${reason ? `: ${reason}` : ""}`);
    this.name = "AgentSuspendedError";
  }
}

export class AgentRevokedError extends AgentLifecycleError {
  constructor(readonly agentId: string, readonly reason?: string) {
    super(`Agent '${agentId}' has been revoked${reason ? `: ${reason}` : ""}`);
    this.name = "AgentRevokedError";
  }
}

export class AgentDeprecatedError extends AgentLifecycleError {
  constructor(readonly agentId: string, readonly reason?: string) {
    super(`Agent '${agentId}' is deprecated and cannot receive new assignments${reason ? `: ${reason}` : ""}`);
    this.name = "AgentDeprecatedError";
  }
}

export class AgentNotQualifiedError extends AgentLifecycleError {
  constructor(readonly agentId: string, readonly requiredCapability: string, reason?: string) {
    super(
      `Agent '${agentId}' is not qualified for capability '${requiredCapability}'${reason ? `: ${reason}` : ""}`
    );
    this.name = "AgentNotQualifiedError";
  }
}

export class AgentEvaluationExpiredError extends AgentLifecycleError {
  constructor(readonly evaluationId: string, readonly agentId: string) {
    super(`Agent evaluation '${evaluationId}' for agent '${agentId}' has expired`);
    this.name = "AgentEvaluationExpiredError";
  }
}

export class SelfGovernanceError extends AgentLifecycleError {
  constructor(readonly agentId: string, action: string) {
    super(
      `Agent self-governance violation: agent '${agentId}' cannot perform action '${action}' on itself (Segregation of Duties required)`
    );
    this.name = "SelfGovernanceError";
  }
}

export class AgentLifecycleConcurrencyConflictError extends AgentLifecycleError {
  constructor(message: string = "Agent lifecycle concurrency conflict (OCC version mismatch)") {
    super(message);
    this.name = "AgentLifecycleConcurrencyConflictError";
  }
}

export class AgentEvaluationConcurrencyConflictError extends AgentLifecycleError {
  constructor(message: string = "Agent evaluation concurrency conflict (OCC version mismatch)") {
    super(message);
    this.name = "AgentEvaluationConcurrencyConflictError";
  }
}

export class AgentEligibilityDeniedError extends AgentLifecycleError {
  constructor(readonly agentId: string, readonly reason: string, readonly code: string = "ELIGIBILITY_DENIED") {
    super(`Agent '${agentId}' is not eligible for operation: ${reason} (code: ${code})`);
    this.name = "AgentEligibilityDeniedError";
  }
}

export class AgentLifecycleTenantMismatchError extends AgentLifecycleError {
  constructor(message: string = "Tenant mismatch on agent lifecycle operation") {
    super(message);
    this.name = "AgentLifecycleTenantMismatchError";
  }
}

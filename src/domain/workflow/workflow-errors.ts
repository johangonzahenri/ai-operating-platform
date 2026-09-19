export class WorkflowValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowValidationError";
  }
}

export class WorkflowNotFoundError extends Error {
  constructor(readonly workflowId: string) {
    super(`Workflow definition '${workflowId}' not found`);
    this.name = "WorkflowNotFoundError";
  }
}

export class WorkflowInstanceNotFoundError extends Error {
  constructor(readonly instanceId: string) {
    super(`Workflow instance '${instanceId}' not found`);
    this.name = "WorkflowInstanceNotFoundError";
  }
}

export class WorkflowConcurrencyConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowConcurrencyConflictError";
  }
}

export class WorkflowCycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowCycleError";
  }
}

export class WorkflowStateTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowStateTransitionError";
  }
}

export class WorkflowExecutionError extends Error {
  constructor(message: string, readonly stepId?: string, readonly cause?: Error) {
    super(message);
    this.name = "WorkflowExecutionError";
  }
}

export class NoEligibleAgentFoundError extends Error {
  constructor(readonly stepId: string, message?: string) {
    super(message || `No eligible agent candidate found for workflow step '${stepId}'`);
    this.name = "NoEligibleAgentFoundError";
  }
}

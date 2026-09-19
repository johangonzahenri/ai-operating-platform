import {
  WorkflowValidationError,
  WorkflowStateTransitionError,
} from "./workflow-errors.js";
import { WorkflowDefinition } from "./workflow-definition.js";
import { VerificationVerdict } from "./verification-result.js";

export type WorkflowInstanceStatus =
  | "PENDING"
  | "RUNNING"
  | "PAUSED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type WorkflowStepStatus =
  | "PENDING"
  | "ASSIGNING"
  | "DISPATCHED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "SKIPPED";

export interface WorkflowStepState {
  readonly stepId: string;
  readonly status: WorkflowStepStatus;
  readonly assignedAgentId?: string | undefined;
  readonly assignedTeamId?: string | undefined;
  readonly taskId?: string | undefined;
  readonly executionId?: string | undefined;
  readonly coordinationId?: string | undefined;
  readonly attempts: number;
  readonly maxRetries: number;
  readonly input: Readonly<Record<string, unknown>>;
  readonly output?: Readonly<Record<string, unknown>> | undefined;
  readonly error?: string | undefined;
  readonly verificationVerdict?: VerificationVerdict | undefined;
  readonly verificationId?: string | undefined;
  readonly startedAt?: Date | undefined;
  readonly completedAt?: Date | undefined;
}

export interface WorkflowFailureDetail {
  readonly code: string;
  readonly message: string;
  readonly stepId?: string | undefined;
}

export interface CreateWorkflowInstanceProps {
  readonly id: string;
  readonly workflowDefinition: WorkflowDefinition;
  readonly initiatorId: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly correlationId?: string | undefined;
  readonly traceId?: string | undefined;
}

export interface RehydrateWorkflowInstanceProps {
  readonly id: string;
  readonly workflowDefinitionId: string;
  readonly workflowDefinitionVersion: number;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly areaId?: string | undefined;
  readonly teamId?: string | undefined;
  readonly initiatorId: string;
  readonly status: WorkflowInstanceStatus;
  readonly currentStepId?: string | undefined;
  readonly stepStates: Readonly<Record<string, WorkflowStepState>>;
  readonly input: Readonly<Record<string, unknown>>;
  readonly output?: Readonly<Record<string, unknown>> | undefined;
  readonly failure?: WorkflowFailureDetail | undefined;
  readonly correlationId: string;
  readonly traceId: string;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly completedAt?: Date | undefined;
}

export class WorkflowInstance {
  readonly id: string;
  readonly workflowDefinitionId: string;
  readonly workflowDefinitionVersion: number;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly areaId?: string | undefined;
  readonly teamId?: string | undefined;
  readonly initiatorId: string;
  readonly status: WorkflowInstanceStatus;
  readonly currentStepId?: string | undefined;
  readonly stepStates: Readonly<Record<string, WorkflowStepState>>;
  readonly input: Readonly<Record<string, unknown>>;
  readonly output?: Readonly<Record<string, unknown>> | undefined;
  readonly failure?: WorkflowFailureDetail | undefined;
  readonly correlationId: string;
  readonly traceId: string;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly completedAt?: Date | undefined;

  private constructor(props: RehydrateWorkflowInstanceProps) {
    this.id = props.id;
    this.workflowDefinitionId = props.workflowDefinitionId;
    this.workflowDefinitionVersion = props.workflowDefinitionVersion;
    this.tenantId = props.tenantId;
    this.organizationId = props.organizationId;
    this.areaId = props.areaId;
    this.teamId = props.teamId;
    this.initiatorId = props.initiatorId;
    this.status = props.status;
    this.currentStepId = props.currentStepId;
    this.stepStates = Object.freeze({ ...props.stepStates });
    this.input = Object.freeze({ ...props.input });
    this.output = props.output ? Object.freeze({ ...props.output }) : undefined;
    this.failure = props.failure ? Object.freeze({ ...props.failure }) : undefined;
    this.correlationId = props.correlationId;
    this.traceId = props.traceId;
    this.version = props.version;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    this.completedAt = props.completedAt;
    Object.freeze(this);
  }

  static create(props: CreateWorkflowInstanceProps): WorkflowInstance {
    if (!props.id || typeof props.id !== "string" || props.id.trim() === "") {
      throw new WorkflowValidationError("Workflow instance requires a non-empty id");
    }
    if (!props.workflowDefinition) {
      throw new WorkflowValidationError("Workflow instance requires a valid workflow definition");
    }
    if (props.workflowDefinition.status !== "ACTIVE") {
      throw new WorkflowValidationError(`Cannot start workflow definition in '${props.workflowDefinition.status}' status. Must be ACTIVE.`);
    }
    if (!props.initiatorId || typeof props.initiatorId !== "string" || props.initiatorId.trim() === "") {
      throw new WorkflowValidationError("Workflow instance requires an initiatorId");
    }

    const now = new Date();
    const initialStepStates: Record<string, WorkflowStepState> = {};

    for (const step of props.workflowDefinition.steps) {
      initialStepStates[step.stepId] = {
        stepId: step.stepId,
        status: "PENDING",
        assignedAgentId: step.assignedAgentId,
        assignedTeamId: step.assignedTeamId,
        attempts: 0,
        maxRetries: step.maxRetries ?? 0,
        input: step.inputTemplate ? { ...step.inputTemplate, ...props.input } : { ...props.input },
      };
    }

    return new WorkflowInstance({
      id: props.id.trim(),
      workflowDefinitionId: props.workflowDefinition.id,
      workflowDefinitionVersion: props.workflowDefinition.version,
      tenantId: props.workflowDefinition.tenantId,
      organizationId: props.workflowDefinition.organizationId,
      areaId: props.workflowDefinition.areaId,
      teamId: props.workflowDefinition.teamId,
      initiatorId: props.initiatorId.trim(),
      status: "PENDING",
      stepStates: initialStepStates,
      input: props.input ?? {},
      correlationId: props.correlationId?.trim() || props.id.trim(),
      traceId: props.traceId?.trim() || props.id.trim(),
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  static rehydrate(props: RehydrateWorkflowInstanceProps): WorkflowInstance {
    return new WorkflowInstance(props);
  }

  start(): WorkflowInstance {
    if (this.status !== "PENDING") {
      throw new WorkflowStateTransitionError(`Cannot start workflow in '${this.status}' state`);
    }
    return new WorkflowInstance({
      ...this,
      status: "RUNNING",
      version: this.version + 1,
      updatedAt: new Date(),
    });
  }

  pause(reason?: string): WorkflowInstance {
    if (this.status !== "RUNNING") {
      throw new WorkflowStateTransitionError(`Cannot pause workflow in '${this.status}' state`);
    }
    return new WorkflowInstance({
      ...this,
      status: "PAUSED",
      version: this.version + 1,
      updatedAt: new Date(),
    });
  }

  resume(): WorkflowInstance {
    if (this.status !== "PAUSED") {
      throw new WorkflowStateTransitionError(`Cannot resume workflow in '${this.status}' state`);
    }
    return new WorkflowInstance({
      ...this,
      status: "RUNNING",
      version: this.version + 1,
      updatedAt: new Date(),
    });
  }

  cancel(reason?: string): WorkflowInstance {
    if (this.isTerminal()) {
      throw new WorkflowStateTransitionError(`Cannot cancel workflow in terminal '${this.status}' state`);
    }
    const now = new Date();
    return new WorkflowInstance({
      ...this,
      status: "CANCELLED",
      failure: {
        code: "WORKFLOW_CANCELLED",
        message: reason || "Workflow cancelled by operator",
      },
      completedAt: now,
      version: this.version + 1,
      updatedAt: now,
    });
  }

  isTerminal(): boolean {
    return this.status === "COMPLETED" || this.status === "FAILED" || this.status === "CANCELLED";
  }

  isCompleted(): boolean {
    return Object.values(this.stepStates).every(
      (s) => s.status === "COMPLETED" || s.status === "SKIPPED"
    );
  }

  getStepState(stepId: string): WorkflowStepState | undefined {
    return this.stepStates[stepId];
  }

  canAdvance(): boolean {
    return this.status === "RUNNING";
  }

  getNextRunnableStepIds(definition: WorkflowDefinition): string[] {
    if (this.status !== "RUNNING") {
      return [];
    }

    const runnable: string[] = [];

    // Sort steps by order
    const sortedSteps = [...definition.steps].sort((a, b) => a.order - b.order);

    for (const step of sortedSteps) {
      const state = this.stepStates[step.stepId];
      if (!state || state.status !== "PENDING") {
        continue;
      }

      // Check if all dependencies are COMPLETED or SKIPPED
      const deps = step.dependsOn ?? [];
      const allDepsDone = deps.every((depId) => {
        const depState = this.stepStates[depId];
        if (!depState) return false;
        if (depState.status === "SKIPPED") return true;
        if (depState.status !== "COMPLETED") return false;

        const depDef = definition.steps.find((s) => s.stepId === depId);
        if (depDef?.verificationRule) {
          return depState.verificationVerdict === "PASS";
        }
        return true;
      });

      if (allDepsDone) {
        runnable.push(step.stepId);
      }
    }

    return runnable;
  }

  markStepAssigning(stepId: string, agentId: string, teamId?: string): WorkflowInstance {
    const existing = this.stepStates[stepId];
    if (!existing) {
      throw new WorkflowValidationError(`Step '${stepId}' does not exist on instance '${this.id}'`);
    }

    const updatedStates: Record<string, WorkflowStepState> = {
      ...this.stepStates,
      [stepId]: {
        ...existing,
        status: "ASSIGNING",
        assignedAgentId: agentId,
        assignedTeamId: teamId ?? existing.assignedTeamId,
        startedAt: existing.startedAt ?? new Date(),
      },
    };

    return new WorkflowInstance({
      ...this,
      currentStepId: stepId,
      stepStates: updatedStates,
      version: this.version + 1,
      updatedAt: new Date(),
    });
  }

  markStepDispatched(stepId: string, taskId: string, executionId?: string, coordinationId?: string): WorkflowInstance {
    const existing = this.stepStates[stepId];
    if (!existing) {
      throw new WorkflowValidationError(`Step '${stepId}' does not exist on instance '${this.id}'`);
    }

    const updatedStates: Record<string, WorkflowStepState> = {
      ...this.stepStates,
      [stepId]: {
        ...existing,
        status: "DISPATCHED",
        taskId,
        executionId,
        coordinationId,
        attempts: existing.attempts + 1,
      },
    };

    return new WorkflowInstance({
      ...this,
      currentStepId: stepId,
      stepStates: updatedStates,
      version: this.version + 1,
      updatedAt: new Date(),
    });
  }

  markStepRunning(stepId: string): WorkflowInstance {
    const existing = this.stepStates[stepId];
    if (!existing) {
      throw new WorkflowValidationError(`Step '${stepId}' does not exist on instance '${this.id}'`);
    }

    const updatedStates: Record<string, WorkflowStepState> = {
      ...this.stepStates,
      [stepId]: {
        ...existing,
        status: "RUNNING",
      },
    };

    return new WorkflowInstance({
      ...this,
      currentStepId: stepId,
      stepStates: updatedStates,
      version: this.version + 1,
      updatedAt: new Date(),
    });
  }

  markStepCompleted(stepId: string, output?: Readonly<Record<string, unknown>>): WorkflowInstance {
    const existing = this.stepStates[stepId];
    if (!existing) {
      throw new WorkflowValidationError(`Step '${stepId}' does not exist on instance '${this.id}'`);
    }

    const now = new Date();
    const updatedStates: Record<string, WorkflowStepState> = {
      ...this.stepStates,
      [stepId]: {
        ...existing,
        status: "COMPLETED",
        output: output ? { ...output } : existing.output,
        completedAt: now,
      },
    };

    return new WorkflowInstance({
      ...this,
      stepStates: updatedStates,
      version: this.version + 1,
      updatedAt: now,
    });
  }

  markStepFailed(stepId: string, error: string): { instance: WorkflowInstance; willRetry: boolean } {
    const existing = this.stepStates[stepId];
    if (!existing) {
      throw new WorkflowValidationError(`Step '${stepId}' does not exist on instance '${this.id}'`);
    }

    const willRetry = existing.attempts < (existing.maxRetries ?? 0);
    const now = new Date();

    if (willRetry) {
      const updatedStates: Record<string, WorkflowStepState> = {
        ...this.stepStates,
        [stepId]: {
          ...existing,
          status: "PENDING",
          error,
        },
      };

      return {
        instance: new WorkflowInstance({
          ...this,
          stepStates: updatedStates,
          version: this.version + 1,
          updatedAt: now,
        }),
        willRetry: true,
      };
    }

    const updatedStates: Record<string, WorkflowStepState> = {
      ...this.stepStates,
      [stepId]: {
        ...existing,
        status: "FAILED",
        error,
        completedAt: now,
      },
    };

    return {
      instance: new WorkflowInstance({
        ...this,
        status: "FAILED",
        failure: {
          code: "STEP_EXECUTION_FAILED",
          message: error,
          stepId,
        },
        completedAt: now,
        stepStates: updatedStates,
        version: this.version + 1,
        updatedAt: now,
      }),
      willRetry: false,
    };
  }

  markStepVerified(
    stepId: string,
    verificationId: string,
    verdict: VerificationVerdict,
    output?: Readonly<Record<string, unknown>>
  ): WorkflowInstance {
    const existing = this.stepStates[stepId];
    if (!existing) {
      throw new WorkflowValidationError(`Step '${stepId}' does not exist on instance '${this.id}'`);
    }

    const now = new Date();
    const updatedStates: Record<string, WorkflowStepState> = {
      ...this.stepStates,
      [stepId]: {
        ...existing,
        verificationId,
        verificationVerdict: verdict,
        output: output ? { ...output } : existing.output,
      },
    };

    return new WorkflowInstance({
      ...this,
      stepStates: updatedStates,
      version: this.version + 1,
      updatedAt: now,
    });
  }

  markStepVerificationFailed(
    stepId: string,
    verificationId: string,
    verdict: VerificationVerdict,
    error: string
  ): { instance: WorkflowInstance; willRetry: boolean } {
    const existing = this.stepStates[stepId];
    if (!existing) {
      throw new WorkflowValidationError(`Step '${stepId}' does not exist on instance '${this.id}'`);
    }

    const willRetry = existing.attempts < (existing.maxRetries ?? 0);
    const now = new Date();

    if (willRetry) {
      const updatedStates: Record<string, WorkflowStepState> = {
        ...this.stepStates,
        [stepId]: {
          ...existing,
          status: "PENDING",
          verificationId,
          verificationVerdict: verdict,
          error,
        },
      };

      return {
        instance: new WorkflowInstance({
          ...this,
          stepStates: updatedStates,
          version: this.version + 1,
          updatedAt: now,
        }),
        willRetry: true,
      };
    }

    const updatedStates: Record<string, WorkflowStepState> = {
      ...this.stepStates,
      [stepId]: {
        ...existing,
        status: "FAILED",
        verificationId,
        verificationVerdict: verdict,
        error,
        completedAt: now,
      },
    };

    return {
      instance: new WorkflowInstance({
        ...this,
        status: "FAILED",
        failure: {
          code: `VERIFICATION_${verdict}`,
          message: error,
          stepId,
        },
        completedAt: now,
        stepStates: updatedStates,
        version: this.version + 1,
        updatedAt: now,
      }),
      willRetry: false,
    };
  }

  complete(output?: Readonly<Record<string, unknown>>): WorkflowInstance {
    const now = new Date();
    return new WorkflowInstance({
      ...this,
      status: "COMPLETED",
      output: output ? { ...output } : this.output,
      completedAt: now,
      version: this.version + 1,
      updatedAt: now,
    });
  }

  fail(code: string, message: string, stepId?: string): WorkflowInstance {
    const now = new Date();
    return new WorkflowInstance({
      ...this,
      status: "FAILED",
      failure: { code, message, stepId },
      completedAt: now,
      version: this.version + 1,
      updatedAt: now,
    });
  }
}

import crypto from "node:crypto";
import {
  Agent,
  AgentInactiveError,
  AgentNotFoundError,
} from "../../domain/agent/agent.js";
import { AgentRegistry } from "../../domain/agent/agent-registry.js";
import {
  AutonomousOperation,
  AutonomousOperationStatus,
} from "../../domain/autonomy/autonomous-operation.js";
import {
  AutonomyBudget,
  AutonomyBudgetProps,
} from "../../domain/autonomy/autonomy-budget.js";
import {
  OperationRecord,
  OperationRepositoryPort,
} from "../../domain/autonomy/operation-repository.js";
import {
  AutonomousOperationResult,
  AutonomousOrchestrator,
  CancellationToken,
} from "./autonomous-orchestrator.js";
import { ObjectiveEvaluation } from "../../domain/autonomy/objective-evaluation.js";
import { IdGenerator } from "../runtime/core-runtime.js";

export class OperationNotFoundError extends Error {
  constructor(readonly operationId: string) {
    super(`Operation '${operationId}' not found`);
    this.name = "OperationNotFoundError";
  }
}

export class OperationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OperationConflictError";
  }
}

export class OperationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OperationValidationError";
  }
}

export interface CreateOperationRequest {
  readonly id?: string | undefined;
  readonly agentId: string;
  readonly objective: string;
  readonly budget: AutonomyBudgetProps;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export interface ExecuteOperationRequest extends CreateOperationRequest {
  readonly cancellationToken?: CancellationToken | undefined;
}

export class AutonomousOperationService {
  private readonly activeTokens = new Map<
    string,
    { isCancelled: boolean; reason?: string }
  >();

  constructor(
    private readonly orchestrator: AutonomousOrchestrator,
    private readonly repository: OperationRepositoryPort,
    private readonly agentRegistry: AgentRegistry,
    private readonly ids: IdGenerator = { next: () => crypto.randomUUID() },
    private readonly now: () => Date = () => new Date()
  ) {}

  createOperation(request: CreateOperationRequest): AutonomousOperation {
    if (!request || typeof request !== "object") {
      throw new OperationValidationError("Request body is required");
    }

    if (typeof request.agentId !== "string" || !request.agentId.trim()) {
      throw new OperationValidationError("agentId is required and must be non-empty");
    }
    const agent = this.agentRegistry.findById(request.agentId.trim());
    if (!agent) {
      throw new AgentNotFoundError(request.agentId.trim());
    }
    if (agent.status !== "ACTIVE") {
      throw new AgentInactiveError(request.agentId.trim());
    }

    if (typeof request.objective !== "string" || !request.objective.trim()) {
      throw new OperationValidationError("objective is required and must be non-empty");
    }
    if (request.objective.length > 4096) {
      throw new OperationValidationError("objective cannot exceed 4096 characters");
    }

    if (!request.budget || typeof request.budget !== "object") {
      throw new OperationValidationError("budget is required and must be an object");
    }

    let budget: AutonomyBudget;
    try {
      budget = AutonomyBudget.create(request.budget);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Invalid budget parameters";
      throw new OperationValidationError(message);
    }

    const id = request.id?.trim() ? request.id.trim() : this.ids.next();
    if (this.repository.findById(id)) {
      throw new OperationConflictError(`Operation with ID '${id}' already exists`);
    }

    const operation = AutonomousOperation.create({
      id,
      objective: request.objective.trim(),
      agentId: agent.id,
      budget,
      createdAt: this.now(),
    });

    this.repository.save(operation);
    return operation;
  }

  async runOperation(
    operationId: string,
    options?: {
      readonly cancellationToken?: CancellationToken | undefined;
      readonly metadata?: Readonly<Record<string, unknown>> | undefined;
    }
  ): Promise<AutonomousOperationResult> {
    const operation = this.repository.findById(operationId);
    if (!operation) {
      throw new OperationNotFoundError(operationId);
    }

    if (operation.status !== "SUBMITTED" && operation.status !== "RUNNING") {
      throw new OperationConflictError(
        `Cannot run operation in terminal state '${operation.status}'`
      );
    }

    const agent = this.agentRegistry.findById(operation.agentId);
    if (!agent) {
      throw new AgentNotFoundError(operation.agentId);
    }
    if (agent.status !== "ACTIVE") {
      throw new AgentInactiveError(operation.agentId);
    }

    const activeToken: { isCancelled: boolean; reason?: string } = {
      isCancelled: options?.cancellationToken?.isCancelled ?? false,
      ...(options?.cancellationToken?.reason !== undefined
        ? { reason: options.cancellationToken.reason }
        : {}),
    };
    this.activeTokens.set(operation.id, activeToken);

    let result: AutonomousOperationResult;
    try {
      result = await this.orchestrator.run({
        operation,
        agent: agent.toDefinition(),
        cancellationToken: activeToken,
        metadata: options?.metadata,
        evaluateObjective: ({ step, plan }) => {
          if (step.id === plan.steps[plan.steps.length - 1]?.id) {
            return ObjectiveEvaluation.achieved({
              rationale: "All planned steps completed successfully",
            });
          }
          return ObjectiveEvaluation.notAchieved();
        },
      });
    } finally {
      this.activeTokens.delete(operation.id);
    }

    this.repository.save(result.operation, {
      plan: result.plan,
      observations: result.observations,
      decisions: result.decisions,
    });

    return result;
  }

  async executeOperation(
    request: ExecuteOperationRequest
  ): Promise<AutonomousOperationResult> {
    const operation = this.createOperation(request);
    return this.runOperation(operation.id, {
      cancellationToken: request.cancellationToken,
      metadata: request.metadata,
    });
  }

  getOperation(operationId: string): AutonomousOperation | undefined {
    return this.repository.findById(operationId);
  }

  getOperationRecord(operationId: string): OperationRecord | undefined {
    return this.repository.findRecordById(operationId);
  }

  listOperations(): readonly AutonomousOperation[] {
    return this.repository.list();
  }

  cancelOperation(operationId: string, reason?: string): AutonomousOperation {
    const operation = this.repository.findById(operationId);
    if (!operation) {
      throw new OperationNotFoundError(operationId);
    }

    const terminalStates: AutonomousOperationStatus[] = [
      "COMPLETED",
      "FAILED",
      "CANCELLED",
      "BUDGET_EXHAUSTED",
    ];

    if (terminalStates.includes(operation.status)) {
      throw new OperationConflictError(
        `Cannot cancel operation in terminal state '${operation.status}'`
      );
    }

    const cancelReason = reason?.trim() || "Cancellation requested by operator";

    // If currently executing, signal the active cancellation token
    const token = this.activeTokens.get(operationId);
    if (token) {
      token.isCancelled = true;
      token.reason = cancelReason;
      return operation;
    }

    // If submitted but not running, transition SUBMITTED -> RUNNING -> CANCELLED to preserve domain lifecycle invariants
    if (operation.status === "SUBMITTED") {
      const running = operation.start(this.now());
      const cancelled = running.cancel(cancelReason, this.now());
      this.repository.save(cancelled);
      return cancelled;
    }

    return operation;
  }
}

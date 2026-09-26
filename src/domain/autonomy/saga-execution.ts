/**
 * AI Operating Platform - Saga & Compensation Domain Model
 * 
 * Formal domain primitives for Track 2 (GAP-05).
 * 
 * Invariants:
 * 1. Explicit compensation contract: A tool or step is compensable ONLY if it implements
 *    the CompensableTool contract or explicitly registers a compensation handler.
 * 2. Deterministic reverse execution: Compensations execute in LIFO order (K-1 ... 1)
 *    relative to the successful forward steps.
 * 3. State machine integrity: Valid states are NOT_STARTED, RUNNING, FORWARD_FAILED,
 *    COMPENSATING, COMPENSATED, COMPENSATION_FAILED, IN_DOUBT, COMPLETED.
 * 4. Preservation of both errors: Both the initial forward execution failure and any
 *    compensation failures must be preserved and observable in the final report.
 * 5. Idempotent compensation: Each compensation step has a deterministic key
 *    (sagaId:stepId:compensation) preventing duplicate or conflicting execution.
 * 6. Security preservation: Compensation steps run through the full security boundary,
 *    never bypassing RBAC, tenant isolation, rate limiting or budget enforcement.
 */

import { ExecutionContext } from "../execution/execution-context.js";
import { ToolExecutionContext, ToolResult } from "../tools/tool-registry.js";
import { SecurityContext } from "../security/security.js";

export type SagaState =
  | "NOT_STARTED"
  | "RUNNING"
  | "FORWARD_FAILED"
  | "COMPENSATING"
  | "COMPENSATED"
  | "COMPENSATION_FAILED"
  | "IN_DOUBT"
  | "COMPLETED";

export type StepCompensationStatus =
  | "NOT_COMPENSABLE"
  | "READ_ONLY"
  | "PENDING"
  | "RUNNING"
  | "COMPENSATED"
  | "FAILED"
  | "IN_DOUBT"
  | "SKIPPED";

export interface StepCompensationRecord {
  readonly stepId: string;
  readonly action: string;
  readonly toolId?: string | undefined;
  readonly toolVersion?: string | undefined;
  readonly status: StepCompensationStatus;
  readonly isSideEffecting?: boolean | undefined;
  readonly forwardOutput?: Readonly<Record<string, unknown>> | undefined;
  readonly compensationInput?: Readonly<Record<string, unknown>> | undefined;
  readonly compensationOutput?: Readonly<Record<string, unknown>> | undefined;
  readonly error?: { readonly code: string; readonly message: string } | undefined;
  readonly startedAt?: Date | undefined;
  readonly completedAt?: Date | undefined;
  readonly durationMs?: number | undefined;
}

export interface SagaSnapshot {
  readonly sagaId: string;
  readonly planId: string;
  readonly operationId: string;
  readonly state: SagaState;
  readonly forwardError?: { readonly code: string; readonly message: string } | undefined;
  readonly compensationError?: { readonly code: string; readonly message: string } | undefined;
  readonly compensationStack: readonly StepCompensationRecord[];
  readonly totalCompensableSteps: number;
  readonly compensatedSteps: number;
  readonly failedCompensationSteps: number;
  readonly inDoubtSteps: number;
  readonly uncompensatedSteps: number;
  readonly startedAt: Date;
  readonly completedAt?: Date | undefined;
}

export class SagaStateTransitionError extends Error {
  readonly code = "SAGA_STATE_TRANSITION_INVALID";
  constructor(readonly currentState: SagaState, readonly targetState: SagaState, message?: string) {
    super(message ?? `Invalid saga transition from '${currentState}' to '${targetState}'`);
    this.name = "SagaStateTransitionError";
  }
}

export class SagaCompensationError extends Error {
  readonly code = "SAGA_COMPENSATION_FAILED";
  constructor(
    readonly sagaId: string,
    readonly stepId: string,
    message: string,
    readonly causeError?: unknown
  ) {
    super(message);
    this.name = "SagaCompensationError";
  }
}

/**
 * Saga Coordinator and State Machine for multi-step plan executions.
 */
export class SagaExecution {
  readonly sagaId: string;
  readonly planId: string;
  readonly operationId: string;
  private _state: SagaState;
  private _forwardError?: { code: string; message: string } | undefined;
  private _compensationError?: { code: string; message: string } | undefined;
  private readonly _compensationStack: StepCompensationRecord[] = [];
  private readonly _startedAt: Date;
  private _completedAt?: Date | undefined;

  constructor(sagaId: string, planId: string, operationId: string, startedAt = new Date()) {
    this.sagaId = sagaId;
    this.planId = planId;
    this.operationId = operationId;
    this._state = "NOT_STARTED";
    this._startedAt = startedAt;
  }

  get state(): SagaState {
    return this._state;
  }

  get startedAt(): Date {
    return this._startedAt;
  }

  get completedAt(): Date | undefined {
    return this._completedAt;
  }

  get forwardError(): { readonly code: string; readonly message: string } | undefined {
    return this._forwardError;
  }

  get compensationError(): { readonly code: string; readonly message: string } | undefined {
    return this._compensationError;
  }

  get compensationStack(): readonly StepCompensationRecord[] {
    return Object.freeze([...this._compensationStack]);
  }

  start(): void {
    if (this._state !== "NOT_STARTED") {
      throw new SagaStateTransitionError(this._state, "RUNNING");
    }
    this._state = "RUNNING";
  }

  /**
   * Pushes a completed forward step onto the compensation stack.
   */
  registerCompletedStep(record: StepCompensationRecord): void {
    if (this._state !== "RUNNING") {
      throw new SagaStateTransitionError(
        this._state,
        "RUNNING",
        `Cannot record step into saga in state '${this._state}'`
      );
    }
    this._compensationStack.push(Object.freeze({ ...record }));
  }

  completeForward(): void {
    if (this._state !== "RUNNING") {
      throw new SagaStateTransitionError(this._state, "COMPLETED");
    }
    this._state = "COMPLETED";
    this._completedAt = new Date();
  }

  failForward(error: { code: string; message: string }): void {
    if (this._state !== "RUNNING") {
      throw new SagaStateTransitionError(this._state, "FORWARD_FAILED");
    }
    this._state = "FORWARD_FAILED";
    this._forwardError = Object.freeze({ ...error });
  }

  startCompensation(): void {
    if (this._state !== "FORWARD_FAILED") {
      throw new SagaStateTransitionError(this._state, "COMPENSATING");
    }
    this._state = "COMPENSATING";
  }

  updateCompensationStep(stepId: string, update: Partial<StepCompensationRecord>): void {
    const idx = this._compensationStack.findIndex((s) => s.stepId === stepId);
    if (idx !== -1) {
      this._compensationStack[idx] = Object.freeze({
        ...this._compensationStack[idx]!,
        ...update,
      });
    }
  }

  finishCompensation(): SagaState {
    if (this._state !== "COMPENSATING" && this._state !== "FORWARD_FAILED") {
      throw new SagaStateTransitionError(
        this._state,
        "COMPENSATED",
        `Cannot finish compensation from state '${this._state}'`
      );
    }

    this._completedAt = new Date();

    const compensableSteps = this._compensationStack.filter(
      (s) => s.status !== "NOT_COMPENSABLE" && s.status !== "READ_ONLY"
    );

    // If there were no compensable steps at all
    if (compensableSteps.length === 0) {
      // If there was a step that had side-effects but wasn't compensable
      // (NOT_COMPENSABLE = unknown side effects; READ_ONLY = no side effects)
      const uncompensableSideEffects = this._compensationStack.some(
        (s) => s.status === "NOT_COMPENSABLE"
      );
      if (uncompensableSideEffects) {
        this._state = "IN_DOUBT";
      } else {
        this._state = "COMPENSATED";
      }
      return this._state;
    }

    const hasFailed = compensableSteps.some((s) => s.status === "FAILED");
    const hasInDoubt = compensableSteps.some((s) => s.status === "IN_DOUBT");
    const allCompensated = compensableSteps.every((s) => s.status === "COMPENSATED");

    if (hasInDoubt) {
      this._state = "IN_DOUBT";
    } else if (hasFailed) {
      this._state = "COMPENSATION_FAILED";
      const firstFailure = compensableSteps.find((s) => s.status === "FAILED");
      if (firstFailure?.error) {
        this._compensationError = Object.freeze({ ...firstFailure.error });
      }
    } else if (allCompensated) {
      this._state = "COMPENSATED";
    } else {
      this._state = "IN_DOUBT";
    }

    return this._state;
  }

  snapshot(): SagaSnapshot {
    const compensable = this._compensationStack.filter((s) => s.status !== "NOT_COMPENSABLE" && s.status !== "READ_ONLY");
    const compensated = compensable.filter((s) => s.status === "COMPENSATED").length;
    const failed = compensable.filter((s) => s.status === "FAILED").length;
    const inDoubt = compensable.filter((s) => s.status === "IN_DOUBT").length;
    const uncompensated = compensable.filter(
      (s) => s.status === "PENDING" || s.status === "RUNNING" || s.status === "SKIPPED"
    ).length;

    return Object.freeze({
      sagaId: this.sagaId,
      planId: this.planId,
      operationId: this.operationId,
      state: this._state,
      forwardError: this._forwardError,
      compensationError: this._compensationError,
      compensationStack: Object.freeze([...this._compensationStack]),
      totalCompensableSteps: compensable.length,
      compensatedSteps: compensated,
      failedCompensationSteps: failed,
      inDoubtSteps: inDoubt,
      uncompensatedSteps: uncompensated,
      startedAt: this._startedAt,
      completedAt: this._completedAt,
    });
  }
}

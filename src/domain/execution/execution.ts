import { InvalidTaskInputError, TaskError } from "../task/task.js";

export type ExecutionStatus = "CREATED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

export class InvalidExecutionTransitionError extends Error {
  constructor(readonly from: ExecutionStatus, readonly to: ExecutionStatus) {
    super(`Cannot transition execution from ${from} to ${to}`); this.name = "InvalidExecutionTransitionError";
  }
}
export class ExecutionCancelledError extends Error { constructor(message: string = "Execution cancelled") { super(message); this.name = "ExecutionCancelledError"; } }

const allowedTransitions: Readonly<Record<ExecutionStatus, readonly ExecutionStatus[]>> = {
  CREATED: ["RUNNING", "CANCELLED"], RUNNING: ["COMPLETED", "FAILED", "CANCELLED"],
  COMPLETED: [], FAILED: [], CANCELLED: [],
};

export class Execution {
  private constructor(
    readonly id: string, readonly taskId: string, readonly traceId: string, readonly status: ExecutionStatus,
    readonly createdAt: Date, readonly startedAt?: Date, readonly completedAt?: Date,
    readonly resultMetadata?: Readonly<Record<string, unknown>>, readonly error?: TaskError,
  ) {}

  static create(id: string, taskId: string, traceId: string, createdAt: Date = new Date()): Execution {
    for (const [name, value] of [["Execution id", id], ["Task id", taskId], ["Trace id", traceId]] as const) {
      if (typeof value !== "string" || value.trim() === "") throw new InvalidTaskInputError(`${name} must be a non-empty string`);
    }
    return new Execution(id, taskId, traceId, "CREATED", createdAt);
  }

  start(startedAt: Date = new Date()): Execution { return this.transition("RUNNING", startedAt); }
  complete(resultMetadata: Readonly<Record<string, unknown>>, completedAt: Date = new Date()): Execution {
    return this.transition("COMPLETED", undefined, completedAt, resultMetadata);
  }
  fail(error: TaskError, completedAt: Date = new Date()): Execution { return this.transition("FAILED", undefined, completedAt, undefined, error); }
  cancel(completedAt: Date = new Date()): Execution { return this.transition("CANCELLED", undefined, completedAt); }

  private transition(to: ExecutionStatus, startedAt?: Date, completedAt?: Date, resultMetadata?: Readonly<Record<string, unknown>>, error?: TaskError): Execution {
    if (!allowedTransitions[this.status].includes(to)) throw new InvalidExecutionTransitionError(this.status, to);
    return new Execution(this.id, this.taskId, this.traceId, to, this.createdAt, startedAt ?? this.startedAt, completedAt, resultMetadata, error);
  }
}

export interface ExecutionRepository { save(execution: Execution): void; findById(id: string): Execution | undefined; }

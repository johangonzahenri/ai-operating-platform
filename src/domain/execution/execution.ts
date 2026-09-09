import { InvalidTaskInputError, TaskError } from "../task/task.js";

export type ExecutionStatus = "CREATED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

export class InvalidExecutionTransitionError extends Error {
  constructor(readonly from: ExecutionStatus, readonly to: ExecutionStatus) {
    super(`Cannot transition execution from ${from} to ${to}`); this.name = "InvalidExecutionTransitionError";
  }
}
export class ExecutionCancelledError extends Error { constructor(message: string = "Execution cancelled") { super(message); this.name = "ExecutionCancelledError"; } }

export interface ExecutionRehydrateProps {
  readonly id: string;
  readonly taskId: string;
  readonly traceId: string;
  readonly status: ExecutionStatus;
  readonly createdAt: Date;
  readonly startedAt?: Date | undefined;
  readonly completedAt?: Date | undefined;
  readonly resultMetadata?: Readonly<Record<string, unknown>> | undefined;
  readonly error?: TaskError | { readonly code: string; readonly message: string } | undefined;
}

const allowedTransitions: Readonly<Record<ExecutionStatus, readonly ExecutionStatus[]>> = {
  CREATED: ["RUNNING", "CANCELLED"], RUNNING: ["COMPLETED", "FAILED", "CANCELLED"],
  COMPLETED: [], FAILED: [], CANCELLED: [],
};

const VALID_EXECUTION_STATUSES: readonly ExecutionStatus[] = [
  "CREATED",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
];

function assertNoFunctions(obj: Record<string, unknown>, context: string): void {
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "function") {
      throw new InvalidTaskInputError(`${context} cannot contain functions (key: ${key})`);
    }
  }
}

export class Execution {
  private constructor(
    readonly id: string, readonly taskId: string, readonly traceId: string, readonly status: ExecutionStatus,
    readonly createdAt: Date, readonly startedAt?: Date | undefined, readonly completedAt?: Date | undefined,
    readonly resultMetadata?: Readonly<Record<string, unknown>> | undefined, readonly error?: TaskError | undefined,
  ) {
    Object.freeze(this);
  }

  static create(id: string, taskId: string, traceId: string, createdAt: Date = new Date()): Execution {
    for (const [name, value] of [["Execution id", id], ["Task id", taskId], ["Trace id", traceId]] as const) {
      if (typeof value !== "string" || value.trim() === "") throw new InvalidTaskInputError(`${name} must be a non-empty string`);
    }
    return new Execution(id.trim(), taskId.trim(), traceId.trim(), "CREATED", new Date(createdAt.getTime()));
  }

  static rehydrate(props: ExecutionRehydrateProps): Execution {
    if (props === null || typeof props !== "object" || Array.isArray(props)) {
      throw new InvalidTaskInputError("Execution rehydrate props must be a valid non-null object");
    }

    for (const [name, value] of [["Execution id", props.id], ["Task id", props.taskId], ["Trace id", props.traceId]] as const) {
      if (typeof value !== "string" || value.trim() === "") throw new InvalidTaskInputError(`${name} must be a non-empty string`);
    }
    const id = props.id.trim();
    const taskId = props.taskId.trim();
    const traceId = props.traceId.trim();

    if (!VALID_EXECUTION_STATUSES.includes(props.status)) {
      throw new InvalidTaskInputError(`Invalid execution status: '${String(props.status)}'`);
    }

    if (!(props.createdAt instanceof Date) || Number.isNaN(props.createdAt.getTime())) {
      throw new InvalidTaskInputError("createdAt must be a valid Date");
    }
    const createdAt = new Date(props.createdAt.getTime());

    let startedAt: Date | undefined;
    if (props.startedAt !== undefined) {
      if (!(props.startedAt instanceof Date) || Number.isNaN(props.startedAt.getTime())) {
        throw new InvalidTaskInputError("startedAt must be a valid Date when provided");
      }
      if (props.startedAt.getTime() < createdAt.getTime()) {
        throw new InvalidTaskInputError("startedAt cannot be earlier than createdAt");
      }
      startedAt = new Date(props.startedAt.getTime());
    }

    let completedAt: Date | undefined;
    if (props.completedAt !== undefined) {
      if (!(props.completedAt instanceof Date) || Number.isNaN(props.completedAt.getTime())) {
        throw new InvalidTaskInputError("completedAt must be a valid Date when provided");
      }
      if (props.completedAt.getTime() < createdAt.getTime()) {
        throw new InvalidTaskInputError("completedAt cannot be earlier than createdAt");
      }
      if (startedAt !== undefined && props.completedAt.getTime() < startedAt.getTime()) {
        throw new InvalidTaskInputError("completedAt cannot be earlier than startedAt");
      }
      completedAt = new Date(props.completedAt.getTime());
    }

    let resultMetadata: Readonly<Record<string, unknown>> | undefined;
    if (props.resultMetadata !== undefined) {
      if (props.resultMetadata === null || typeof props.resultMetadata !== "object" || Array.isArray(props.resultMetadata)) {
        throw new InvalidTaskInputError("resultMetadata must be a valid object when provided");
      }
      assertNoFunctions(props.resultMetadata as Record<string, unknown>, "resultMetadata");
      resultMetadata = Object.freeze({ ...props.resultMetadata });
    }

    let error: TaskError | undefined;
    if (props.error !== undefined) {
      if (props.error instanceof TaskError) {
        error = props.error;
      } else if (
        props.error !== null &&
        typeof props.error === "object" &&
        typeof props.error.code === "string" &&
        props.error.code.trim() !== "" &&
        typeof props.error.message === "string" &&
        props.error.message.trim() !== ""
      ) {
        error = new TaskError(props.error.code.trim(), props.error.message.trim());
      } else {
        throw new InvalidTaskInputError("error must contain non-empty code and message strings");
      }
    }

    // Invariants per status
    if (props.status === "CREATED") {
      if (startedAt !== undefined) throw new InvalidTaskInputError("Execution in CREATED status cannot have startedAt");
      if (completedAt !== undefined) throw new InvalidTaskInputError("Execution in CREATED status cannot have completedAt");
      if (resultMetadata !== undefined) throw new InvalidTaskInputError("Execution in CREATED status cannot have resultMetadata");
      if (error !== undefined) throw new InvalidTaskInputError("Execution in CREATED status cannot have error");
    } else if (props.status === "RUNNING") {
      if (!startedAt) throw new InvalidTaskInputError("Execution in RUNNING status requires startedAt");
      if (completedAt !== undefined) throw new InvalidTaskInputError("Execution in RUNNING status cannot have completedAt");
      if (resultMetadata !== undefined) throw new InvalidTaskInputError("Execution in RUNNING status cannot have resultMetadata");
      if (error !== undefined) throw new InvalidTaskInputError("Execution in RUNNING status cannot have error");
    } else if (props.status === "COMPLETED") {
      if (!completedAt) throw new InvalidTaskInputError("Execution in COMPLETED status requires completedAt");
      if (!resultMetadata) throw new InvalidTaskInputError("Execution in COMPLETED status requires resultMetadata");
      if (error !== undefined) throw new InvalidTaskInputError("Execution in COMPLETED status cannot retain an error");
    } else if (props.status === "FAILED") {
      if (!completedAt) throw new InvalidTaskInputError("Execution in FAILED status requires completedAt");
      if (!error) throw new InvalidTaskInputError("Execution in FAILED status requires error");
      if (resultMetadata !== undefined) throw new InvalidTaskInputError("Execution in FAILED status cannot retain resultMetadata");
    } else if (props.status === "CANCELLED") {
      if (!completedAt) throw new InvalidTaskInputError("Execution in CANCELLED status requires completedAt");
      if (resultMetadata !== undefined) throw new InvalidTaskInputError("Execution in CANCELLED status cannot retain resultMetadata");
      if (error !== undefined) throw new InvalidTaskInputError("Execution in CANCELLED status cannot retain error");
    }

    return new Execution(id, taskId, traceId, props.status, createdAt, startedAt, completedAt, resultMetadata, error);
  }

  start(startedAt: Date = new Date()): Execution { return this.transition("RUNNING", startedAt); }
  complete(resultMetadata: Readonly<Record<string, unknown>>, completedAt: Date = new Date()): Execution {
    const frozenMeta = Object.freeze({ ...resultMetadata });
    return this.transition("COMPLETED", undefined, new Date(completedAt.getTime()), frozenMeta);
  }
  fail(error: TaskError, completedAt: Date = new Date()): Execution { return this.transition("FAILED", undefined, new Date(completedAt.getTime()), undefined, error); }
  cancel(completedAt: Date = new Date()): Execution { return this.transition("CANCELLED", undefined, new Date(completedAt.getTime())); }

  private transition(to: ExecutionStatus, startedAt?: Date, completedAt?: Date, resultMetadata?: Readonly<Record<string, unknown>>, error?: TaskError): Execution {
    if (!allowedTransitions[this.status].includes(to)) throw new InvalidExecutionTransitionError(this.status, to);
    return new Execution(this.id, this.taskId, this.traceId, to, this.createdAt, startedAt ?? this.startedAt, completedAt, resultMetadata, error);
  }
}

export interface ExecutionRepository { save(execution: Execution): void; findById(id: string): Execution | undefined; }

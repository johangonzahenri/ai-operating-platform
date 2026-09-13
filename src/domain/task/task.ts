export type TaskStatus = "CREATED" | "QUEUED" | "RUNNING" | "WAITING" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface TaskRequest {
  readonly input: Readonly<Record<string, unknown>>;
  readonly agentId: string;
}

export interface TaskResult {
  readonly output: Readonly<Record<string, unknown>>;
  readonly completedAt: Date;
}

export class InvalidTaskTransitionError extends Error {
  constructor(readonly from: TaskStatus, readonly to: TaskStatus) {
    super(`Cannot transition task from ${from} to ${to}`);
    this.name = "InvalidTaskTransitionError";
  }
}

export class InvalidTaskInputError extends Error {
  constructor(message: string) { super(message); this.name = "InvalidTaskInputError"; }
}

export class TaskNotFoundError extends Error {
  constructor(message: string) { super(message); this.name = "TaskNotFoundError"; }
}


export class TaskError {
  constructor(readonly code: string, readonly message: string) {
    if (typeof code !== "string" || code.trim() === "") throw new InvalidTaskInputError("Task error requires a non-empty code");
    if (typeof message !== "string" || message.trim() === "") throw new InvalidTaskInputError("Task error requires a non-empty message");
    Object.freeze(this);
  }
}

export interface TaskRehydrateProps {
  readonly id: string;
  readonly traceId: string;
  readonly request: TaskRequest;
  readonly status: TaskStatus;
  readonly createdAt: Date;
  readonly result?: TaskResult | undefined;
  readonly error?: TaskError | { readonly code: string; readonly message: string } | undefined;
}

const allowedTransitions: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  CREATED: ["QUEUED", "CANCELLED"], QUEUED: ["RUNNING", "CANCELLED"],
  RUNNING: ["WAITING", "COMPLETED", "FAILED", "CANCELLED"], WAITING: ["RUNNING", "CANCELLED"],
  COMPLETED: [], FAILED: [], CANCELLED: [],
};

const VALID_TASK_STATUSES: readonly TaskStatus[] = [
  "CREATED",
  "QUEUED",
  "RUNNING",
  "WAITING",
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

export class Task {
  private constructor(
    readonly id: string, readonly traceId: string, readonly request: TaskRequest,
    readonly status: TaskStatus, readonly createdAt: Date, readonly result?: TaskResult | undefined,
    readonly error?: TaskError | undefined,
  ) {
    Object.freeze(this);
  }

  static create(id: string, traceId: string, request: TaskRequest, createdAt: Date = new Date()): Task {
    if (typeof id !== "string" || id.trim() === "") throw new InvalidTaskInputError("Task id must be a non-empty string");
    if (typeof traceId !== "string" || traceId.trim() === "") throw new InvalidTaskInputError("Trace id must be a non-empty string");
    if (typeof request?.agentId !== "string" || request.agentId.trim() === "") throw new InvalidTaskInputError("Task request requires an agent id");
    if (request.input === null || typeof request.input !== "object" || Array.isArray(request.input) || Object.keys(request.input).length === 0) {
      throw new InvalidTaskInputError("Task request requires non-empty input");
    }
    assertNoFunctions(request.input as Record<string, unknown>, "Task input");
    const frozenInput = Object.freeze({ ...request.input });
    const frozenRequest: TaskRequest = Object.freeze({ agentId: request.agentId.trim(), input: frozenInput });
    return new Task(id.trim(), traceId.trim(), frozenRequest, "CREATED", new Date(createdAt.getTime()));
  }

  static rehydrate(props: TaskRehydrateProps): Task {
    if (props === null || typeof props !== "object" || Array.isArray(props)) {
      throw new InvalidTaskInputError("Task rehydrate props must be a valid non-null object");
    }

    if (typeof props.id !== "string" || props.id.trim() === "") {
      throw new InvalidTaskInputError("Task id must be a non-empty string");
    }
    const id = props.id.trim();

    if (typeof props.traceId !== "string" || props.traceId.trim() === "") {
      throw new InvalidTaskInputError("Trace id must be a non-empty string");
    }
    const traceId = props.traceId.trim();

    if (!props.request || typeof props.request !== "object" || Array.isArray(props.request)) {
      throw new InvalidTaskInputError("Task request must be a valid object");
    }
    if (typeof props.request.agentId !== "string" || props.request.agentId.trim() === "") {
      throw new InvalidTaskInputError("Task request requires a non-empty agentId");
    }
    if (props.request.input === null || typeof props.request.input !== "object" || Array.isArray(props.request.input)) {
      throw new InvalidTaskInputError("Task request input must be a valid object");
    }
    assertNoFunctions(props.request.input as Record<string, unknown>, "Task request input");
    const frozenInput = Object.freeze({ ...props.request.input });
    const frozenRequest: TaskRequest = Object.freeze({
      agentId: props.request.agentId.trim(),
      input: frozenInput,
    });

    if (!VALID_TASK_STATUSES.includes(props.status)) {
      throw new InvalidTaskInputError(`Invalid task status: '${String(props.status)}'`);
    }

    if (!(props.createdAt instanceof Date) || Number.isNaN(props.createdAt.getTime())) {
      throw new InvalidTaskInputError("createdAt must be a valid Date");
    }
    const createdAt = new Date(props.createdAt.getTime());

    let result: TaskResult | undefined;
    if (props.result !== undefined) {
      if (props.result === null || typeof props.result !== "object" || Array.isArray(props.result)) {
        throw new InvalidTaskInputError("result must be a valid object when provided");
      }
      if (props.result.output === null || typeof props.result.output !== "object" || Array.isArray(props.result.output)) {
        throw new InvalidTaskInputError("result output must be a valid object");
      }
      assertNoFunctions(props.result.output as Record<string, unknown>, "result output");
      if (!(props.result.completedAt instanceof Date) || Number.isNaN(props.result.completedAt.getTime())) {
        throw new InvalidTaskInputError("result completedAt must be a valid Date");
      }
      if (props.result.completedAt.getTime() < createdAt.getTime()) {
        throw new InvalidTaskInputError("result completedAt cannot be earlier than createdAt");
      }
      result = Object.freeze({
        output: Object.freeze({ ...props.result.output }),
        completedAt: new Date(props.result.completedAt.getTime()),
      });
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

    // Invariant validation per status
    if (props.status === "COMPLETED") {
      if (!result) {
        throw new InvalidTaskInputError("Task in COMPLETED status requires a valid result");
      }
      if (error !== undefined) {
        throw new InvalidTaskInputError("Task in COMPLETED status cannot retain an error");
      }
    } else if (props.status === "FAILED") {
      if (!error) {
        throw new InvalidTaskInputError("Task in FAILED status requires a valid error");
      }
      if (result !== undefined) {
        throw new InvalidTaskInputError("Task in FAILED status cannot retain a result");
      }
    } else {
      // CREATED, QUEUED, RUNNING, WAITING, CANCELLED
      if (result !== undefined) {
        throw new InvalidTaskInputError(`Task in ${props.status} status cannot contain a result`);
      }
      if (error !== undefined) {
        throw new InvalidTaskInputError(`Task in ${props.status} status cannot contain an error`);
      }
    }

    return new Task(id, traceId, frozenRequest, props.status, createdAt, result, error);
  }

  transition(to: TaskStatus): Task {
    if (!allowedTransitions[this.status].includes(to)) throw new InvalidTaskTransitionError(this.status, to);
    return new Task(this.id, this.traceId, this.request, to, this.createdAt, this.result, this.error);
  }

  complete(output: Readonly<Record<string, unknown>>, completedAt: Date = new Date()): Task {
    const completed = this.transition("COMPLETED");
    const frozenOutput = Object.freeze({ ...output });
    const result: TaskResult = Object.freeze({ output: frozenOutput, completedAt: new Date(completedAt.getTime()) });
    return new Task(completed.id, completed.traceId, completed.request, completed.status, completed.createdAt, result);
  }

  fail(error: TaskError): Task {
    const failed = this.transition("FAILED");
    return new Task(failed.id, failed.traceId, failed.request, failed.status, failed.createdAt, undefined, error);
  }
}

export interface TaskRepository {
  save(task: Task): void;
  findById(id: string): Task | undefined;
}

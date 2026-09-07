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

export class TaskError {
  constructor(readonly code: string, readonly message: string) {
    if (typeof code !== "string" || code.trim() === "") throw new InvalidTaskInputError("Task error requires a non-empty code");
    if (typeof message !== "string" || message.trim() === "") throw new InvalidTaskInputError("Task error requires a non-empty message");
  }
}

const allowedTransitions: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  CREATED: ["QUEUED", "CANCELLED"], QUEUED: ["RUNNING", "CANCELLED"],
  RUNNING: ["WAITING", "COMPLETED", "FAILED", "CANCELLED"], WAITING: ["RUNNING", "CANCELLED"],
  COMPLETED: [], FAILED: [], CANCELLED: [],
};

export class Task {
  private constructor(
    readonly id: string, readonly traceId: string, readonly request: TaskRequest,
    readonly status: TaskStatus, readonly createdAt: Date, readonly result?: TaskResult | undefined,
    readonly error?: TaskError | undefined,
  ) {}

  static create(id: string, traceId: string, request: TaskRequest, createdAt: Date = new Date()): Task {
    if (typeof id !== "string" || id.trim() === "") throw new InvalidTaskInputError("Task id must be a non-empty string");
    if (typeof traceId !== "string" || traceId.trim() === "") throw new InvalidTaskInputError("Trace id must be a non-empty string");
    if (typeof request?.agentId !== "string" || request.agentId.trim() === "") throw new InvalidTaskInputError("Task request requires an agent id");
    if (request.input === null || typeof request.input !== "object" || Object.keys(request.input).length === 0) {
      throw new InvalidTaskInputError("Task request requires non-empty input");
    }
    return new Task(id, traceId, request, "CREATED", createdAt);
  }

  transition(to: TaskStatus): Task {
    if (!allowedTransitions[this.status].includes(to)) throw new InvalidTaskTransitionError(this.status, to);
    return new Task(this.id, this.traceId, this.request, to, this.createdAt, this.result, this.error);
  }

  complete(output: Readonly<Record<string, unknown>>, completedAt: Date = new Date()): Task {
    const completed = this.transition("COMPLETED");
    return new Task(completed.id, completed.traceId, completed.request, completed.status, completed.createdAt, { output, completedAt });
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

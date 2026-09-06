import { InvalidTaskInputError } from "../task/task.js";

export class ExecutionContext {
  private constructor(
    readonly traceId: string, readonly executionId: string, readonly taskId: string,
    readonly createdAt: Date, readonly metadata: Readonly<Record<string, unknown>>,
    readonly input: Readonly<Record<string, unknown>>, private readonly values: Readonly<Record<string, unknown>>,
  ) {}

  static create(traceId: string, executionId: string, taskId: string, metadata: Readonly<Record<string, unknown>> = {}, createdAt: Date = new Date()): ExecutionContext {
    for (const [name, value] of [["Trace id", traceId], ["Execution id", executionId], ["Task id", taskId]] as const) {
      if (typeof value !== "string" || value.trim() === "") throw new InvalidTaskInputError(`${name} must be a non-empty string`);
    }
    return new ExecutionContext(traceId, executionId, taskId, createdAt, metadata, {}, {});
  }
  withInput(input: Readonly<Record<string, unknown>>): ExecutionContext {
    if (input === null || typeof input !== "object") throw new InvalidTaskInputError("Execution context input must be an object");
    return new ExecutionContext(this.traceId, this.executionId, this.taskId, this.createdAt, this.metadata, input, this.values);
  }
  withValue(key: string, value: unknown): ExecutionContext {
    if (typeof key !== "string" || key.trim() === "") throw new InvalidTaskInputError("Context key must be a non-empty string");
    return new ExecutionContext(this.traceId, this.executionId, this.taskId, this.createdAt, this.metadata, this.input, { ...this.values, [key]: value });
  }
  has(key: string): boolean { return key in this.values; }
  get(key: string): unknown { return this.values[key]; }
  snapshot(): Readonly<Record<string, unknown>> { return { ...this.values }; }
}

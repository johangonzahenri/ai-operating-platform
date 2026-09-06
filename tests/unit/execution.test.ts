import assert from "node:assert/strict";
import test from "node:test";
import { Execution, InvalidExecutionTransitionError } from "../../src/domain/execution/execution.js";
import { ExecutionContext } from "../../src/domain/execution/execution-context.js";
import { InvalidTaskInputError, TaskError } from "../../src/domain/task/task.js";

test("execution has an explicit lifecycle, timestamps, metadata and error", () => {
  const created = Execution.create("execution-1", "task-1", "trace-1", new Date("2026-01-01T00:00:00Z"));
  const completed = created.start(new Date("2026-01-01T00:01:00Z")).complete({ provider: "stub" }, new Date("2026-01-01T00:02:00Z"));
  assert.equal(completed.status, "COMPLETED"); assert.equal(completed.startedAt?.toISOString(), "2026-01-01T00:01:00.000Z"); assert.equal(completed.completedAt?.toISOString(), "2026-01-01T00:02:00.000Z"); assert.deepEqual(completed.resultMetadata, { provider: "stub" });
  const failed = created.start().fail(new TaskError("FAILURE", "unavailable")); assert.equal(failed.error?.code, "FAILURE");
});

test("execution rejects invalid identity and terminal transitions", () => {
  assert.throws(() => Execution.create("", "task-1", "trace-1"), InvalidTaskInputError);
  const completed = Execution.create("execution-1", "task-1", "trace-1").start().complete({});
  assert.throws(() => completed.start(), InvalidExecutionTransitionError);
});

test("execution context requires all correlation identifiers", () => {
  const context = ExecutionContext.create("trace-1", "execution-1", "task-1", { source: "test" });
  assert.equal(context.executionId, "execution-1"); assert.deepEqual(context.metadata, { source: "test" });
  assert.throws(() => ExecutionContext.create("", "execution-1", "task-1"), InvalidTaskInputError);
});

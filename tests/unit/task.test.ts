import assert from "node:assert/strict";
import test from "node:test";
import { InvalidTaskInputError, InvalidTaskTransitionError, Task, TaskError } from "../../src/domain/task/task.js";

const request = { agentId: "assistant", input: { question: "hello" } };
const task = () => Task.create("task-1", "trace-1", request, new Date("2026-01-01T00:00:00Z"));

test("task accepts every operational state transition", () => {
  const queued = task().transition("QUEUED");
  const running = queued.transition("RUNNING");
  assert.equal(running.transition("WAITING").transition("RUNNING").complete({ answer: "ok" }).status, "COMPLETED");
  assert.equal(running.fail(new TaskError("X", "failure")).status, "FAILED");
  assert.equal(queued.transition("CANCELLED").status, "CANCELLED");
});

test("task rejects invalid and terminal transitions", () => {
  assert.throws(() => task().transition("COMPLETED"), InvalidTaskTransitionError);
  assert.throws(() => task().transition("QUEUED").transition("RUNNING").complete({}).transition("RUNNING"), InvalidTaskTransitionError);
});

test("completion stores a durable result", () => {
  const complete = task().transition("QUEUED").transition("RUNNING").complete({ answer: 42 }, new Date("2026-01-02T00:00:00Z"));
  assert.deepEqual(complete.result?.output, { answer: 42 });
});

test("creation rejects empty identity, trace, agent and input", () => {
  assert.throws(() => Task.create("", "trace-1", request), InvalidTaskInputError);
  assert.throws(() => Task.create("task-1", "", request), InvalidTaskInputError);
  assert.throws(() => Task.create("task-1", "trace-1", { agentId: "", input: { value: 1 } }), InvalidTaskInputError);
  assert.throws(() => Task.create("task-1", "trace-1", { agentId: "agent", input: {} }), InvalidTaskInputError);
});

test("failure stores its error and cannot retain a result", () => {
  const error = new TaskError("MODEL_FAILURE", "unavailable");
  const failed = task().transition("QUEUED").transition("RUNNING").fail(error);
  assert.equal(failed.status, "FAILED"); assert.equal(failed.error, error); assert.equal(failed.error?.code, "MODEL_FAILURE"); assert.equal(failed.result, undefined);
});

test("task error requires a non-empty code and message", () => {
  assert.throws(() => new TaskError("", "message"), InvalidTaskInputError);
  assert.throws(() => new TaskError("CODE", ""), InvalidTaskInputError);
});

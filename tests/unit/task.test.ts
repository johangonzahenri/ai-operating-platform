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

test("Task Rehydration Suite", async (t) => {
  const baseCreatedAt = new Date("2026-01-01T10:00:00.000Z");
  const baseCompletedAt = new Date("2026-01-01T10:05:00.000Z");

  await t.test("rehydrates valid Task across all operational statuses", () => {
    // 1. CREATED
    const created = Task.rehydrate({
      id: "task-c1",
      traceId: "trace-c1",
      request: { agentId: "agent-1", input: { query: "search" } },
      status: "CREATED",
      createdAt: baseCreatedAt,
    });
    assert.equal(created.id, "task-c1");
    assert.equal(created.status, "CREATED");
    assert.equal(created.result, undefined);
    assert.equal(created.error, undefined);

    // 2. QUEUED
    const queued = Task.rehydrate({
      id: "task-q1",
      traceId: "trace-q1",
      request: { agentId: "agent-1", input: { query: "search" } },
      status: "QUEUED",
      createdAt: baseCreatedAt,
    });
    assert.equal(queued.status, "QUEUED");

    // 3. RUNNING
    const running = Task.rehydrate({
      id: "task-r1",
      traceId: "trace-r1",
      request: { agentId: "agent-1", input: { query: "search" } },
      status: "RUNNING",
      createdAt: baseCreatedAt,
    });
    assert.equal(running.status, "RUNNING");

    // 4. WAITING
    const waiting = Task.rehydrate({
      id: "task-w1",
      traceId: "trace-w1",
      request: { agentId: "agent-1", input: { query: "search" } },
      status: "WAITING",
      createdAt: baseCreatedAt,
    });
    assert.equal(waiting.status, "WAITING");

    // 5. COMPLETED
    const completed = Task.rehydrate({
      id: "task-comp1",
      traceId: "trace-comp1",
      request: { agentId: "agent-1", input: { query: "search" } },
      status: "COMPLETED",
      createdAt: baseCreatedAt,
      result: {
        output: { answer: "found" },
        completedAt: baseCompletedAt,
      },
    });
    assert.equal(completed.status, "COMPLETED");
    assert.deepEqual(completed.result?.output, { answer: "found" });
    assert.equal(completed.result?.completedAt.toISOString(), baseCompletedAt.toISOString());
    assert.equal(completed.error, undefined);

    // 6. FAILED (with TaskError instance)
    const failed1 = Task.rehydrate({
      id: "task-f1",
      traceId: "trace-f1",
      request: { agentId: "agent-1", input: { query: "search" } },
      status: "FAILED",
      createdAt: baseCreatedAt,
      error: new TaskError("ERR_TIMEOUT", "Execution timed out"),
    });
    assert.equal(failed1.status, "FAILED");
    assert.equal(failed1.error?.code, "ERR_TIMEOUT");
    assert.equal(failed1.error?.message, "Execution timed out");
    assert.equal(failed1.result, undefined);

    // 7. FAILED (with object error literal)
    const failed2 = Task.rehydrate({
      id: "task-f2",
      traceId: "trace-f2",
      request: { agentId: "agent-1", input: { query: "search" } },
      status: "FAILED",
      createdAt: baseCreatedAt,
      error: { code: "ERR_ABORT", message: "Aborted by system" },
    });
    assert.equal(failed2.status, "FAILED");
    assert.equal(failed2.error?.code, "ERR_ABORT");

    // 8. CANCELLED
    const cancelled = Task.rehydrate({
      id: "task-can1",
      traceId: "trace-can1",
      request: { agentId: "agent-1", input: { query: "search" } },
      status: "CANCELLED",
      createdAt: baseCreatedAt,
    });
    assert.equal(cancelled.status, "CANCELLED");
    assert.equal(cancelled.result, undefined);
    assert.equal(cancelled.error, undefined);
  });

  await t.test("preserves authentic prototype and passes instanceof Task", () => {
    const taskInstance = Task.rehydrate({
      id: "task-proto",
      traceId: "trace-proto",
      request: { agentId: "agent-1", input: { val: 1 } },
      status: "CREATED",
      createdAt: baseCreatedAt,
    });
    assert.equal(taskInstance instanceof Task, true);
    assert.equal(Object.getPrototypeOf(taskInstance), Task.prototype);
    assert.equal(typeof taskInstance.transition, "function");
    assert.equal(typeof taskInstance.complete, "function");
    assert.equal(typeof taskInstance.fail, "function");
  });

  await t.test("enforces runtime immutability and defensive copying", () => {
    const originalInput = { count: 10 };
    const originalOutput = { items: [1, 2, 3] };
    const originalCreated = new Date(baseCreatedAt.getTime());
    const originalCompleted = new Date(baseCompletedAt.getTime());

    const rehydrated = Task.rehydrate({
      id: "task-freeze",
      traceId: "trace-freeze",
      request: { agentId: "agent-1", input: originalInput },
      status: "COMPLETED",
      createdAt: originalCreated,
      result: {
        output: originalOutput,
        completedAt: originalCompleted,
      },
    });

    // Verify object freezing
    assert.equal(Object.isFrozen(rehydrated), true);
    assert.equal(Object.isFrozen(rehydrated.request), true);
    assert.equal(Object.isFrozen(rehydrated.request.input), true);
    assert.equal(Object.isFrozen(rehydrated.result), true);
    assert.equal(Object.isFrozen(rehydrated.result?.output), true);

    // Mutation resistance
    assert.throws(() => {
      // @ts-expect-error - Testing runtime mutation resistance
      rehydrated.status = "RUNNING";
    }, TypeError);

    assert.throws(() => {
      // @ts-expect-error - Testing runtime mutation resistance
      rehydrated.id = "hacked-id";
    }, TypeError);

    assert.throws(() => {
      // @ts-expect-error - Testing runtime mutation resistance
      rehydrated.request.input.count = 999;
    }, TypeError);

    assert.throws(() => {
      // @ts-expect-error - Testing runtime mutation resistance
      rehydrated.result.output.items = [];
    }, TypeError);

    // External mutations do not alter rehydrated state
    originalInput.count = 500;
    assert.equal(rehydrated.request.input.count, 10);

    originalCreated.setFullYear(2099);
    assert.equal(rehydrated.createdAt.toISOString(), baseCreatedAt.toISOString());

    originalCompleted.setFullYear(2099);
    assert.equal(rehydrated.result?.completedAt.toISOString(), baseCompletedAt.toISOString());
  });

  await t.test("rejects COMPLETED task without result or with error", () => {
    // Missing result
    assert.throws(
      () =>
        Task.rehydrate({
          id: "task-1",
          traceId: "trace-1",
          request: { agentId: "agent-1", input: { x: 1 } },
          status: "COMPLETED",
          createdAt: baseCreatedAt,
        }),
      InvalidTaskInputError
    );

    // Has error when COMPLETED
    assert.throws(
      () =>
        Task.rehydrate({
          id: "task-1",
          traceId: "trace-1",
          request: { agentId: "agent-1", input: { x: 1 } },
          status: "COMPLETED",
          createdAt: baseCreatedAt,
          result: { output: { ok: true }, completedAt: baseCompletedAt },
          error: new TaskError("E", "failed"),
        }),
      InvalidTaskInputError
    );
  });

  await t.test("rejects FAILED task without error or with result", () => {
    // Missing error
    assert.throws(
      () =>
        Task.rehydrate({
          id: "task-1",
          traceId: "trace-1",
          request: { agentId: "agent-1", input: { x: 1 } },
          status: "FAILED",
          createdAt: baseCreatedAt,
        }),
      InvalidTaskInputError
    );

    // Has result when FAILED
    assert.throws(
      () =>
        Task.rehydrate({
          id: "task-1",
          traceId: "trace-1",
          request: { agentId: "agent-1", input: { x: 1 } },
          status: "FAILED",
          createdAt: baseCreatedAt,
          error: new TaskError("E", "failed"),
          result: { output: { ok: true }, completedAt: baseCompletedAt },
        }),
      InvalidTaskInputError
    );
  });

  await t.test("rejects non-terminal task containing result or error", () => {
    const statuses = ["CREATED", "QUEUED", "RUNNING", "WAITING", "CANCELLED"] as const;
    for (const status of statuses) {
      assert.throws(
        () =>
          Task.rehydrate({
            id: "task-1",
            traceId: "trace-1",
            request: { agentId: "agent-1", input: { x: 1 } },
            status,
            createdAt: baseCreatedAt,
            result: { output: { ok: true }, completedAt: baseCompletedAt },
          }),
        InvalidTaskInputError
      );

      assert.throws(
        () =>
          Task.rehydrate({
            id: "task-1",
            traceId: "trace-1",
            request: { agentId: "agent-1", input: { x: 1 } },
            status,
            createdAt: baseCreatedAt,
            error: new TaskError("ERR", "bad"),
          }),
        InvalidTaskInputError
      );
    }
  });

  await t.test("rejects invalid timestamps and impossible chronological ordering", () => {
    // Invalid Date
    assert.throws(
      () =>
        Task.rehydrate({
          id: "task-1",
          traceId: "trace-1",
          request: { agentId: "agent-1", input: { x: 1 } },
          status: "CREATED",
          // @ts-expect-error - Testing invalid date
          createdAt: "not-a-date",
        }),
      InvalidTaskInputError
    );

    // CompletedAt earlier than createdAt
    assert.throws(
      () =>
        Task.rehydrate({
          id: "task-1",
          traceId: "trace-1",
          request: { agentId: "agent-1", input: { x: 1 } },
          status: "COMPLETED",
          createdAt: new Date("2026-01-02T00:00:00Z"),
          result: { output: { ok: true }, completedAt: new Date("2026-01-01T00:00:00Z") },
        }),
      InvalidTaskInputError
    );
  });

  await t.test("rejects invalid input, missing fields, and functions in payloads", () => {
    // Null props
    // @ts-expect-error - Testing null props
    assert.throws(() => Task.rehydrate(null), InvalidTaskInputError);

    // Empty id / traceId / agentId
    assert.throws(
      () =>
        Task.rehydrate({
          id: "",
          traceId: "trace-1",
          request: { agentId: "agent", input: { ok: 1 } },
          status: "CREATED",
          createdAt: baseCreatedAt,
        }),
      InvalidTaskInputError
    );

    assert.throws(
      () =>
        Task.rehydrate({
          id: "task-1",
          traceId: "",
          request: { agentId: "agent", input: { ok: 1 } },
          status: "CREATED",
          createdAt: baseCreatedAt,
        }),
      InvalidTaskInputError
    );

    assert.throws(
      () =>
        Task.rehydrate({
          id: "task-1",
          traceId: "trace-1",
          request: { agentId: "", input: { ok: 1 } },
          status: "CREATED",
          createdAt: baseCreatedAt,
        }),
      InvalidTaskInputError
    );

    // Invalid status
    assert.throws(
      () =>
        Task.rehydrate({
          id: "task-1",
          traceId: "trace-1",
          request: { agentId: "agent", input: { ok: 1 } },
          // @ts-expect-error - Testing invalid status
          status: "INVALID_STATUS",
          createdAt: baseCreatedAt,
        }),
      InvalidTaskInputError
    );

    // Functions in input
    assert.throws(
      () =>
        Task.rehydrate({
          id: "task-1",
          traceId: "trace-1",
          request: { agentId: "agent", input: { fn: () => {} } },
          status: "CREATED",
          createdAt: baseCreatedAt,
        }),
      InvalidTaskInputError
    );

    // Functions in result output
    assert.throws(
      () =>
        Task.rehydrate({
          id: "task-1",
          traceId: "trace-1",
          request: { agentId: "agent", input: { ok: 1 } },
          status: "COMPLETED",
          createdAt: baseCreatedAt,
          result: { output: { fn: () => {} }, completedAt: baseCompletedAt },
        }),
      InvalidTaskInputError
    );
  });

  await t.test("permits valid lifecycle continuation from rehydrated active states", () => {
    // Rehydrated RUNNING task can transition to WAITING and then back to RUNNING and COMPLETE
    const running = Task.rehydrate({
      id: "task-cont",
      traceId: "trace-cont",
      request: { agentId: "agent-1", input: { step: 1 } },
      status: "RUNNING",
      createdAt: baseCreatedAt,
    });

    const waiting = running.transition("WAITING");
    assert.equal(waiting.status, "WAITING");

    const resumed = waiting.transition("RUNNING");
    assert.equal(resumed.status, "RUNNING");

    const completed = resumed.complete({ done: true }, new Date("2026-01-01T10:10:00.000Z"));
    assert.equal(completed.status, "COMPLETED");
    assert.deepEqual(completed.result?.output, { done: true });

    // Terminal rehydrated task cannot transition
    assert.throws(() => completed.transition("RUNNING"), InvalidTaskTransitionError);
  });
});

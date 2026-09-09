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

test("Execution Rehydration Suite", async (t) => {
  const baseCreatedAt = new Date("2026-01-01T12:00:00.000Z");
  const baseStartedAt = new Date("2026-01-01T12:01:00.000Z");
  const baseCompletedAt = new Date("2026-01-01T12:02:00.000Z");

  await t.test("rehydrates valid Execution across all operational statuses", () => {
    // 1. CREATED
    const created = Execution.rehydrate({
      id: "exec-c1",
      taskId: "task-1",
      traceId: "trace-1",
      status: "CREATED",
      createdAt: baseCreatedAt,
    });
    assert.equal(created.id, "exec-c1");
    assert.equal(created.status, "CREATED");
    assert.equal(created.startedAt, undefined);
    assert.equal(created.completedAt, undefined);
    assert.equal(created.resultMetadata, undefined);
    assert.equal(created.error, undefined);

    // 2. RUNNING
    const running = Execution.rehydrate({
      id: "exec-r1",
      taskId: "task-1",
      traceId: "trace-1",
      status: "RUNNING",
      createdAt: baseCreatedAt,
      startedAt: baseStartedAt,
    });
    assert.equal(running.id, "exec-r1");
    assert.equal(running.status, "RUNNING");
    assert.equal(running.startedAt?.toISOString(), baseStartedAt.toISOString());
    assert.equal(running.completedAt, undefined);

    // 3. COMPLETED
    const completed = Execution.rehydrate({
      id: "exec-comp1",
      taskId: "task-1",
      traceId: "trace-1",
      status: "COMPLETED",
      createdAt: baseCreatedAt,
      startedAt: baseStartedAt,
      completedAt: baseCompletedAt,
      resultMetadata: { model: "stub", durationMs: 120 },
    });
    assert.equal(completed.status, "COMPLETED");
    assert.deepEqual(completed.resultMetadata, { model: "stub", durationMs: 120 });
    assert.equal(completed.completedAt?.toISOString(), baseCompletedAt.toISOString());
    assert.equal(completed.error, undefined);

    // 4. FAILED (with TaskError instance)
    const failed1 = Execution.rehydrate({
      id: "exec-f1",
      taskId: "task-1",
      traceId: "trace-1",
      status: "FAILED",
      createdAt: baseCreatedAt,
      startedAt: baseStartedAt,
      completedAt: baseCompletedAt,
      error: new TaskError("ERR_RATE_LIMIT", "Rate limit exceeded"),
    });
    assert.equal(failed1.status, "FAILED");
    assert.equal(failed1.error?.code, "ERR_RATE_LIMIT");
    assert.equal(failed1.resultMetadata, undefined);

    // 5. FAILED (with error object literal)
    const failed2 = Execution.rehydrate({
      id: "exec-f2",
      taskId: "task-1",
      traceId: "trace-1",
      status: "FAILED",
      createdAt: baseCreatedAt,
      completedAt: baseCompletedAt,
      error: { code: "ERR_INTERNAL", message: "Internal server error" },
    });
    assert.equal(failed2.status, "FAILED");
    assert.equal(failed2.error?.code, "ERR_INTERNAL");

    // 6. CANCELLED
    const cancelled = Execution.rehydrate({
      id: "exec-can1",
      taskId: "task-1",
      traceId: "trace-1",
      status: "CANCELLED",
      createdAt: baseCreatedAt,
      startedAt: baseStartedAt,
      completedAt: baseCompletedAt,
    });
    assert.equal(cancelled.status, "CANCELLED");
    assert.equal(cancelled.resultMetadata, undefined);
    assert.equal(cancelled.error, undefined);
  });

  await t.test("preserves authentic prototype and passes instanceof Execution", () => {
    const exec = Execution.rehydrate({
      id: "exec-proto",
      taskId: "task-1",
      traceId: "trace-1",
      status: "CREATED",
      createdAt: baseCreatedAt,
    });
    assert.equal(exec instanceof Execution, true);
    assert.equal(Object.getPrototypeOf(exec), Execution.prototype);
    assert.equal(typeof exec.start, "function");
    assert.equal(typeof exec.complete, "function");
    assert.equal(typeof exec.fail, "function");
    assert.equal(typeof exec.cancel, "function");
  });

  await t.test("enforces runtime immutability and defensive copying", () => {
    const originalMeta = { tokens: 150, info: { tag: "prod" } };
    const originalCreated = new Date(baseCreatedAt.getTime());
    const originalStarted = new Date(baseStartedAt.getTime());
    const originalCompleted = new Date(baseCompletedAt.getTime());

    const rehydrated = Execution.rehydrate({
      id: "exec-freeze",
      taskId: "task-1",
      traceId: "trace-1",
      status: "COMPLETED",
      createdAt: originalCreated,
      startedAt: originalStarted,
      completedAt: originalCompleted,
      resultMetadata: originalMeta,
    });

    // Object freezing
    assert.equal(Object.isFrozen(rehydrated), true);
    assert.equal(Object.isFrozen(rehydrated.resultMetadata), true);

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
      rehydrated.resultMetadata.tokens = 999;
    }, TypeError);

    // External mutations do not alter rehydrated state
    originalMeta.tokens = 500;
    assert.equal(rehydrated.resultMetadata?.tokens, 150);

    originalCreated.setFullYear(2099);
    assert.equal(rehydrated.createdAt.toISOString(), baseCreatedAt.toISOString());

    originalStarted.setFullYear(2099);
    assert.equal(rehydrated.startedAt?.toISOString(), baseStartedAt.toISOString());

    originalCompleted.setFullYear(2099);
    assert.equal(rehydrated.completedAt?.toISOString(), baseCompletedAt.toISOString());
  });

  await t.test("rejects CREATED and RUNNING executions with invalid or premature terminal data", () => {
    // CREATED with startedAt
    assert.throws(
      () =>
        Execution.rehydrate({
          id: "exec-1",
          taskId: "task-1",
          traceId: "trace-1",
          status: "CREATED",
          createdAt: baseCreatedAt,
          startedAt: baseStartedAt,
        }),
      InvalidTaskInputError
    );

    // CREATED with completedAt
    assert.throws(
      () =>
        Execution.rehydrate({
          id: "exec-1",
          taskId: "task-1",
          traceId: "trace-1",
          status: "CREATED",
          createdAt: baseCreatedAt,
          completedAt: baseCompletedAt,
        }),
      InvalidTaskInputError
    );

    // RUNNING without startedAt
    assert.throws(
      () =>
        Execution.rehydrate({
          id: "exec-1",
          taskId: "task-1",
          traceId: "trace-1",
          status: "RUNNING",
          createdAt: baseCreatedAt,
        }),
      InvalidTaskInputError
    );

    // RUNNING with completedAt
    assert.throws(
      () =>
        Execution.rehydrate({
          id: "exec-1",
          taskId: "task-1",
          traceId: "trace-1",
          status: "RUNNING",
          createdAt: baseCreatedAt,
          startedAt: baseStartedAt,
          completedAt: baseCompletedAt,
        }),
      InvalidTaskInputError
    );
  });

  await t.test("rejects COMPLETED execution without completedAt/resultMetadata or retaining error", () => {
    // Missing completedAt
    assert.throws(
      () =>
        Execution.rehydrate({
          id: "exec-1",
          taskId: "task-1",
          traceId: "trace-1",
          status: "COMPLETED",
          createdAt: baseCreatedAt,
          resultMetadata: { ok: true },
        }),
      InvalidTaskInputError
    );

    // Missing resultMetadata
    assert.throws(
      () =>
        Execution.rehydrate({
          id: "exec-1",
          taskId: "task-1",
          traceId: "trace-1",
          status: "COMPLETED",
          createdAt: baseCreatedAt,
          completedAt: baseCompletedAt,
        }),
      InvalidTaskInputError
    );

    // Has error
    assert.throws(
      () =>
        Execution.rehydrate({
          id: "exec-1",
          taskId: "task-1",
          traceId: "trace-1",
          status: "COMPLETED",
          createdAt: baseCreatedAt,
          completedAt: baseCompletedAt,
          resultMetadata: { ok: true },
          error: new TaskError("E", "fail"),
        }),
      InvalidTaskInputError
    );
  });

  await t.test("rejects FAILED execution without completedAt/error or retaining resultMetadata", () => {
    // Missing completedAt
    assert.throws(
      () =>
        Execution.rehydrate({
          id: "exec-1",
          taskId: "task-1",
          traceId: "trace-1",
          status: "FAILED",
          createdAt: baseCreatedAt,
          error: new TaskError("E", "fail"),
        }),
      InvalidTaskInputError
    );

    // Missing error
    assert.throws(
      () =>
        Execution.rehydrate({
          id: "exec-1",
          taskId: "task-1",
          traceId: "trace-1",
          status: "FAILED",
          createdAt: baseCreatedAt,
          completedAt: baseCompletedAt,
        }),
      InvalidTaskInputError
    );

    // Has resultMetadata
    assert.throws(
      () =>
        Execution.rehydrate({
          id: "exec-1",
          taskId: "task-1",
          traceId: "trace-1",
          status: "FAILED",
          createdAt: baseCreatedAt,
          completedAt: baseCompletedAt,
          error: new TaskError("E", "fail"),
          resultMetadata: { ok: true },
        }),
      InvalidTaskInputError
    );
  });

  await t.test("rejects CANCELLED execution without completedAt or retaining resultMetadata/error", () => {
    // Missing completedAt
    assert.throws(
      () =>
        Execution.rehydrate({
          id: "exec-1",
          taskId: "task-1",
          traceId: "trace-1",
          status: "CANCELLED",
          createdAt: baseCreatedAt,
        }),
      InvalidTaskInputError
    );

    // Has resultMetadata
    assert.throws(
      () =>
        Execution.rehydrate({
          id: "exec-1",
          taskId: "task-1",
          traceId: "trace-1",
          status: "CANCELLED",
          createdAt: baseCreatedAt,
          completedAt: baseCompletedAt,
          resultMetadata: { ok: true },
        }),
      InvalidTaskInputError
    );

    // Has error
    assert.throws(
      () =>
        Execution.rehydrate({
          id: "exec-1",
          taskId: "task-1",
          traceId: "trace-1",
          status: "CANCELLED",
          createdAt: baseCreatedAt,
          completedAt: baseCompletedAt,
          error: new TaskError("E", "fail"),
        }),
      InvalidTaskInputError
    );
  });

  await t.test("rejects invalid timestamps and impossible chronological ordering", () => {
    // startedAt < createdAt
    assert.throws(
      () =>
        Execution.rehydrate({
          id: "exec-1",
          taskId: "task-1",
          traceId: "trace-1",
          status: "RUNNING",
          createdAt: new Date("2026-01-01T12:05:00Z"),
          startedAt: new Date("2026-01-01T12:00:00Z"),
        }),
      InvalidTaskInputError
    );

    // completedAt < startedAt
    assert.throws(
      () =>
        Execution.rehydrate({
          id: "exec-1",
          taskId: "task-1",
          traceId: "trace-1",
          status: "COMPLETED",
          createdAt: new Date("2026-01-01T12:00:00Z"),
          startedAt: new Date("2026-01-01T12:05:00Z"),
          completedAt: new Date("2026-01-01T12:03:00Z"),
          resultMetadata: { ok: true },
        }),
      InvalidTaskInputError
    );
  });

  await t.test("rejects invalid input, missing identifiers, and functions in resultMetadata", () => {
    // Null props
    // @ts-expect-error - Testing null props
    assert.throws(() => Execution.rehydrate(null), InvalidTaskInputError);

    // Empty id / taskId / traceId
    assert.throws(
      () =>
        Execution.rehydrate({
          id: "",
          taskId: "task-1",
          traceId: "trace-1",
          status: "CREATED",
          createdAt: baseCreatedAt,
        }),
      InvalidTaskInputError
    );

    assert.throws(
      () =>
        Execution.rehydrate({
          id: "exec-1",
          taskId: "",
          traceId: "trace-1",
          status: "CREATED",
          createdAt: baseCreatedAt,
        }),
      InvalidTaskInputError
    );

    assert.throws(
      () =>
        Execution.rehydrate({
          id: "exec-1",
          taskId: "task-1",
          traceId: "",
          status: "CREATED",
          createdAt: baseCreatedAt,
        }),
      InvalidTaskInputError
    );

    // Functions in resultMetadata
    assert.throws(
      () =>
        Execution.rehydrate({
          id: "exec-1",
          taskId: "task-1",
          traceId: "trace-1",
          status: "COMPLETED",
          createdAt: baseCreatedAt,
          completedAt: baseCompletedAt,
          resultMetadata: { fn: () => {} },
        }),
      InvalidTaskInputError
    );
  });

  await t.test("permits valid lifecycle continuation from rehydrated active states", () => {
    // Rehydrated CREATED execution can start
    const created = Execution.rehydrate({
      id: "exec-cont",
      taskId: "task-1",
      traceId: "trace-1",
      status: "CREATED",
      createdAt: baseCreatedAt,
    });
    const running = created.start(baseStartedAt);
    assert.equal(running.status, "RUNNING");
    assert.equal(running.startedAt?.toISOString(), baseStartedAt.toISOString());

    // Rehydrated RUNNING execution can complete
    const completed = running.complete({ done: true }, baseCompletedAt);
    assert.equal(completed.status, "COMPLETED");
    assert.deepEqual(completed.resultMetadata, { done: true });

    // Terminal execution rejects starting again
    assert.throws(() => completed.start(), InvalidExecutionTransitionError);
  });
});

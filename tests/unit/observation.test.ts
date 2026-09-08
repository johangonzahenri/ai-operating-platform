import assert from "node:assert/strict";
import test from "node:test";
import {
  Observation,
  ObservationValidationError,
} from "../../src/domain/autonomy/observation.js";

test("Observation Domain Value Object Suite", async (t) => {
  await t.test("creates a valid SUCCESS observation via static factory", () => {
    const obs = Observation.success({
      observationId: "obs-1",
      operationId: "op-100",
      stepId: "step-1",
      durationMs: 1250,
      output: { recordsFound: 42 },
      toolCalls: 2,
      metadata: { source: "database-query" },
    });

    assert.equal(obs.observationId, "obs-1");
    assert.equal(obs.operationId, "op-100");
    assert.equal(obs.stepId, "step-1");
    assert.equal(obs.status, "SUCCESS");
    assert.equal(obs.durationMs, 1250);
    assert.deepEqual(obs.output, { recordsFound: 42 });
    assert.equal(obs.toolCalls, 2);
    assert.deepEqual(obs.metadata, { source: "database-query" });
    assert.equal(obs.error, undefined);
  });

  await t.test("creates a valid FAILED observation via static factory", () => {
    const obs = Observation.failure({
      observationId: "obs-2",
      operationId: "op-100",
      stepId: "step-2",
      durationMs: 340,
      error: { code: "TIMEOUT", message: "Database socket timed out" },
      toolCalls: 1,
    });

    assert.equal(obs.observationId, "obs-2");
    assert.equal(obs.operationId, "op-100");
    assert.equal(obs.stepId, "step-2");
    assert.equal(obs.status, "FAILED");
    assert.equal(obs.durationMs, 340);
    assert.deepEqual(obs.error, { code: "TIMEOUT", message: "Database socket timed out" });
    assert.equal(obs.output, undefined);
    assert.equal(obs.toolCalls, 1);
  });

  await t.test("creates a valid CANCELLED observation via static factory", () => {
    const obs = Observation.cancelled({
      observationId: "obs-3",
      operationId: "op-100",
      stepId: "step-3",
      durationMs: 50,
      error: { code: "USER_CANCELLED", message: "Operation was aborted" },
    });

    assert.equal(obs.status, "CANCELLED");
    assert.equal(obs.observationId, "obs-3");
    assert.equal(obs.durationMs, 50);
    assert.deepEqual(obs.error, { code: "USER_CANCELLED", message: "Operation was aborted" });
  });

  await t.test("rejects invalid props (null, array, primitive)", () => {
    assert.throws(
      () => Observation.create(null as unknown as { observationId: string; operationId: string; stepId: string; status: "SUCCESS"; durationMs: number }),
      (err: unknown) => err instanceof ObservationValidationError
    );
    assert.throws(
      () => Observation.create([] as unknown as { observationId: string; operationId: string; stepId: string; status: "SUCCESS"; durationMs: number }),
      (err: unknown) => err instanceof ObservationValidationError
    );
  });

  await t.test("rejects invalid identifiers", () => {
    assert.throws(
      () =>
        Observation.success({
          observationId: "invalid/id",
          operationId: "op-1",
          stepId: "step-1",
          durationMs: 100,
        }),
      (err: unknown) => err instanceof ObservationValidationError
    );

    assert.throws(
      () =>
        Observation.success({
          observationId: "obs-1",
          operationId: "   ",
          stepId: "step-1",
          durationMs: 100,
        }),
      (err: unknown) => err instanceof ObservationValidationError
    );

    assert.throws(
      () =>
        Observation.success({
          observationId: "obs-1",
          operationId: "op-1",
          stepId: "",
          durationMs: 100,
        }),
      (err: unknown) => err instanceof ObservationValidationError
    );
  });

  await t.test("rejects unknown status", () => {
    assert.throws(
      () =>
        Observation.create({
          observationId: "obs-1",
          operationId: "op-1",
          stepId: "step-1",
          status: "UNKNOWN_STATUS" as unknown as "SUCCESS",
          durationMs: 100,
        }),
      (err: unknown) =>
        err instanceof ObservationValidationError && err.message.includes("Invalid observation status")
    );
  });

  await t.test("rejects invalid durationMs (negative, float, string)", () => {
    assert.throws(
      () =>
        Observation.success({
          observationId: "obs-1",
          operationId: "op-1",
          stepId: "step-1",
          durationMs: -1,
        }),
      (err: unknown) => err instanceof ObservationValidationError
    );

    assert.throws(
      () =>
        Observation.success({
          observationId: "obs-1",
          operationId: "op-1",
          stepId: "step-1",
          durationMs: 12.34,
        }),
      (err: unknown) => err instanceof ObservationValidationError
    );
  });

  await t.test("rejects invalid toolCalls (negative, float, string)", () => {
    assert.throws(
      () =>
        Observation.success({
          observationId: "obs-1",
          operationId: "op-1",
          stepId: "step-1",
          durationMs: 10,
          toolCalls: -2,
        }),
      (err: unknown) => err instanceof ObservationValidationError
    );
  });

  await t.test("rejects SUCCESS observation with error", () => {
    assert.throws(
      () =>
        Observation.create({
          observationId: "obs-1",
          operationId: "op-1",
          stepId: "step-1",
          status: "SUCCESS",
          durationMs: 100,
          error: { code: "ERR", message: "fail" },
        }),
      (err: unknown) =>
        err instanceof ObservationValidationError && err.message.includes("cannot contain an error")
    );
  });

  await t.test("rejects FAILED observation with output or missing error", () => {
    assert.throws(
      () =>
        Observation.create({
          observationId: "obs-1",
          operationId: "op-1",
          stepId: "step-1",
          status: "FAILED",
          durationMs: 100,
          output: { res: "done" },
          error: { code: "ERR", message: "fail" },
        }),
      (err: unknown) =>
        err instanceof ObservationValidationError && err.message.includes("cannot contain output")
    );

    assert.throws(
      () =>
        Observation.create({
          observationId: "obs-1",
          operationId: "op-1",
          stepId: "step-1",
          status: "FAILED",
          durationMs: 100,
        }),
      (err: unknown) =>
        err instanceof ObservationValidationError && err.message.includes("requires an error object")
    );

    assert.throws(
      () =>
        Observation.failure({
          observationId: "obs-1",
          operationId: "op-1",
          stepId: "step-1",
          durationMs: 100,
          error: { code: "", message: "fail" },
        }),
      (err: unknown) =>
        err instanceof ObservationValidationError && err.message.includes("non-empty code")
    );
  });

  await t.test("rejects functions in output and metadata", () => {
    assert.throws(
      () =>
        Observation.success({
          observationId: "obs-1",
          operationId: "op-1",
          stepId: "step-1",
          durationMs: 100,
          output: { callback: () => true },
        }),
      (err: unknown) =>
        err instanceof ObservationValidationError && err.message.includes("cannot contain functions")
    );

    assert.throws(
      () =>
        Observation.success({
          observationId: "obs-1",
          operationId: "op-1",
          stepId: "step-1",
          durationMs: 100,
          metadata: { callback: () => true },
        }),
      (err: unknown) =>
        err instanceof ObservationValidationError && err.message.includes("cannot contain functions")
    );
  });

  await t.test("enforces runtime immutability and generates frozen snapshot", () => {
    const obs = Observation.success({
      observationId: "obs-1",
      operationId: "op-1",
      stepId: "step-1",
      durationMs: 0,
      output: { count: 10 },
      toolCalls: 0,
    });

    assert.throws(() => {
      (obs as unknown as { durationMs: number }).durationMs = 999;
    }, TypeError);

    const snap = obs.snapshot();
    assert.equal(snap.observationId, "obs-1");
    assert.equal(snap.durationMs, 0);
    assert.deepEqual(snap.output, { count: 10 });
    assert.ok(Object.isFrozen(snap));
    if (snap.output) {
      assert.ok(Object.isFrozen(snap.output));
    }
  });
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  AutonomyBudget,
  AutonomyBudgetValidationError,
} from "../../src/domain/autonomy/autonomy-budget.js";

test("AutonomyBudget Domain Value Object Suite", async (t) => {
  await t.test("creates a valid budget with required boundaries", () => {
    const budget = AutonomyBudget.create({
      maxSteps: 10,
      maxDurationMs: 60000,
      maxToolCalls: 20,
    });

    assert.equal(budget.maxSteps, 10);
    assert.equal(budget.maxDurationMs, 60000);
    assert.equal(budget.maxToolCalls, 20);
    assert.equal(budget.maxTokens, undefined);
  });

  await t.test("creates a valid budget with maxToolCalls = 0 (no tools allowed)", () => {
    const budget = AutonomyBudget.create({
      maxSteps: 5,
      maxDurationMs: 15000,
      maxToolCalls: 0,
    });

    assert.equal(budget.maxSteps, 5);
    assert.equal(budget.maxDurationMs, 15000);
    assert.equal(budget.maxToolCalls, 0);
  });

  await t.test("creates a valid budget with optional maxTokens", () => {
    const budget = AutonomyBudget.create({
      maxSteps: 10,
      maxDurationMs: 30000,
      maxToolCalls: 5,
      maxTokens: 4000,
    });

    assert.equal(budget.maxTokens, 4000);
  });

  await t.test("rejects invalid props input (null, undefined, non-object, array)", () => {
    assert.throws(
      () => AutonomyBudget.create(null as unknown as { maxSteps: number; maxDurationMs: number; maxToolCalls: number }),
      (err: unknown) =>
        err instanceof AutonomyBudgetValidationError &&
        err.message.includes("valid non-null object")
    );

    assert.throws(
      () => AutonomyBudget.create(undefined as unknown as { maxSteps: number; maxDurationMs: number; maxToolCalls: number }),
      (err: unknown) => err instanceof AutonomyBudgetValidationError
    );

    assert.throws(
      () => AutonomyBudget.create([] as unknown as { maxSteps: number; maxDurationMs: number; maxToolCalls: number }),
      (err: unknown) => err instanceof AutonomyBudgetValidationError
    );
  });

  await t.test("rejects invalid maxSteps (0, negative, decimals, NaN, Infinity, strings)", () => {
    const base = { maxDurationMs: 10000, maxToolCalls: 5 };

    assert.throws(
      () => AutonomyBudget.create({ ...base, maxSteps: 0 }),
      (err: unknown) =>
        err instanceof AutonomyBudgetValidationError &&
        err.message.includes("maxSteps must be a positive integer")
    );

    assert.throws(
      () => AutonomyBudget.create({ ...base, maxSteps: -1 }),
      (err: unknown) => err instanceof AutonomyBudgetValidationError
    );

    assert.throws(
      () => AutonomyBudget.create({ ...base, maxSteps: 2.5 }),
      (err: unknown) => err instanceof AutonomyBudgetValidationError
    );

    assert.throws(
      () => AutonomyBudget.create({ ...base, maxSteps: Number.NaN }),
      (err: unknown) => err instanceof AutonomyBudgetValidationError
    );

    assert.throws(
      () => AutonomyBudget.create({ ...base, maxSteps: Number.POSITIVE_INFINITY }),
      (err: unknown) => err instanceof AutonomyBudgetValidationError
    );

    assert.throws(
      () => AutonomyBudget.create({ ...base, maxSteps: "10" as unknown as number }),
      (err: unknown) => err instanceof AutonomyBudgetValidationError
    );
  });

  await t.test("rejects invalid maxDurationMs (0, negative, decimals, NaN, Infinity)", () => {
    const base = { maxSteps: 10, maxToolCalls: 5 };

    assert.throws(
      () => AutonomyBudget.create({ ...base, maxDurationMs: 0 }),
      (err: unknown) =>
        err instanceof AutonomyBudgetValidationError &&
        err.message.includes("maxDurationMs must be a positive integer")
    );

    assert.throws(
      () => AutonomyBudget.create({ ...base, maxDurationMs: -5000 }),
      (err: unknown) => err instanceof AutonomyBudgetValidationError
    );

    assert.throws(
      () => AutonomyBudget.create({ ...base, maxDurationMs: 1000.5 }),
      (err: unknown) => err instanceof AutonomyBudgetValidationError
    );

    assert.throws(
      () => AutonomyBudget.create({ ...base, maxDurationMs: Number.NaN }),
      (err: unknown) => err instanceof AutonomyBudgetValidationError
    );

    assert.throws(
      () => AutonomyBudget.create({ ...base, maxDurationMs: Number.POSITIVE_INFINITY }),
      (err: unknown) => err instanceof AutonomyBudgetValidationError
    );
  });

  await t.test("rejects invalid maxToolCalls (negative, decimals, NaN, Infinity)", () => {
    const base = { maxSteps: 10, maxDurationMs: 10000 };

    assert.throws(
      () => AutonomyBudget.create({ ...base, maxToolCalls: -1 }),
      (err: unknown) =>
        err instanceof AutonomyBudgetValidationError &&
        err.message.includes("maxToolCalls must be a non-negative integer")
    );

    assert.throws(
      () => AutonomyBudget.create({ ...base, maxToolCalls: 3.14 }),
      (err: unknown) => err instanceof AutonomyBudgetValidationError
    );

    assert.throws(
      () => AutonomyBudget.create({ ...base, maxToolCalls: Number.NaN }),
      (err: unknown) => err instanceof AutonomyBudgetValidationError
    );

    assert.throws(
      () => AutonomyBudget.create({ ...base, maxToolCalls: Number.POSITIVE_INFINITY }),
      (err: unknown) => err instanceof AutonomyBudgetValidationError
    );
  });

  await t.test("rejects invalid maxTokens (0, negative, decimals, NaN, Infinity)", () => {
    const base = { maxSteps: 10, maxDurationMs: 10000, maxToolCalls: 5 };

    assert.throws(
      () => AutonomyBudget.create({ ...base, maxTokens: 0 }),
      (err: unknown) =>
        err instanceof AutonomyBudgetValidationError &&
        err.message.includes("maxTokens must be a positive integer")
    );

    assert.throws(
      () => AutonomyBudget.create({ ...base, maxTokens: -100 }),
      (err: unknown) => err instanceof AutonomyBudgetValidationError
    );

    assert.throws(
      () => AutonomyBudget.create({ ...base, maxTokens: 100.5 }),
      (err: unknown) => err instanceof AutonomyBudgetValidationError
    );

    assert.throws(
      () => AutonomyBudget.create({ ...base, maxTokens: Number.NaN }),
      (err: unknown) => err instanceof AutonomyBudgetValidationError
    );
  });

  await t.test("enforces runtime immutability on budget instance", () => {
    const budget = AutonomyBudget.create({
      maxSteps: 10,
      maxDurationMs: 5000,
      maxToolCalls: 2,
    });

    assert.ok(Object.isFrozen(budget));

    assert.throws(
      () => {
        (budget as unknown as Record<string, unknown>).maxSteps = 9999;
      },
      (err: unknown) => err instanceof TypeError
    );

    assert.equal(budget.maxSteps, 10);
  });

  await t.test("snapshot produces frozen, independent representation", () => {
    const budget = AutonomyBudget.create({
      maxSteps: 8,
      maxDurationMs: 20000,
      maxToolCalls: 4,
      maxTokens: 1000,
    });

    const snap = budget.snapshot();

    assert.deepEqual(snap, {
      maxSteps: 8,
      maxDurationMs: 20000,
      maxToolCalls: 4,
      maxTokens: 1000,
    });
    assert.ok(Object.isFrozen(snap));

    assert.throws(
      () => {
        (snap as unknown as Record<string, unknown>).maxSteps = 999;
      },
      (err: unknown) => err instanceof TypeError
    );

    assert.equal(budget.maxSteps, 8);
  });

  await t.test("verifies value object equality via equals()", () => {
    const budget1 = AutonomyBudget.create({
      maxSteps: 10,
      maxDurationMs: 30000,
      maxToolCalls: 5,
    });

    const budget2 = AutonomyBudget.create({
      maxSteps: 10,
      maxDurationMs: 30000,
      maxToolCalls: 5,
    });

    const different = AutonomyBudget.create({
      maxSteps: 10,
      maxDurationMs: 30000,
      maxToolCalls: 6,
    });

    assert.ok(budget1.equals(budget2));
    assert.ok(budget2.equals(budget1));
    assert.equal(budget1.equals(different), false);
    assert.equal(budget1.equals(null), false);
    assert.equal(budget1.equals({ maxSteps: 10, maxDurationMs: 30000, maxToolCalls: 5 }), false);
  });
});

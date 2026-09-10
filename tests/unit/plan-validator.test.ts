import assert from "node:assert/strict";
import test from "node:test";
import { Plan, PlanStep } from "../../src/domain/autonomy/plan.js";
import { PlanValidator, PlanValidationError } from "../../src/domain/autonomy/plan-validator.js";

function createMockStep(order: number, action: string, input: Record<string, unknown> = { key: "value" }) {
  return PlanStep.create({
    id: `step-${order}`,
    order,
    action,
    input,
  });
}

test("PlanValidator passes a valid plan matching allowed actions", () => {
  const plan = Plan.create({
    id: "plan-1",
    operationId: "op-1",
    steps: [
      createMockStep(1, "read_data"),
      createMockStep(2, "transform_data"),
    ],
  });

  const result = PlanValidator.validate(plan, {
    allowedActions: ["read_data", "transform_data", "write_data"],
  });

  assert.equal(result.valid, true);
  assert.equal(result.violations.length, 0);
  assert.equal(result.validatedStepCount, 2);
});

test("PlanValidator rejects plan with unauthorized action (fail-closed)", () => {
  const plan = Plan.create({
    id: "plan-1",
    operationId: "op-1",
    steps: [
      createMockStep(1, "read_data"),
      createMockStep(2, "delete_database"),
    ],
  });

  const result = PlanValidator.validate(plan, {
    allowedActions: ["read_data", "write_data"],
  });

  assert.equal(result.valid, false);
  assert.ok(result.violations.some((v) => v.includes("unauthorized action 'delete_database'")));
});

test("PlanValidator rejects plan exceeding step count limit", () => {
  const plan = Plan.create({
    id: "plan-1",
    operationId: "op-1",
    steps: [
      createMockStep(1, "step_1"),
      createMockStep(2, "step_2"),
      createMockStep(3, "step_3"),
    ],
  });

  const result = PlanValidator.validate(plan, {
    maxSteps: 2,
  });

  assert.equal(result.valid, false);
  assert.ok(result.violations.some((v) => v.includes("exceeds maximum allowed constraint")));
});

test("PlanValidator rejects dangerous prototype keywords in step inputs", () => {
  const step = PlanStep.create({
    id: "step-1",
    order: 1,
    action: "read",
    input: JSON.parse('{"__proto__": {"admin": true}, "harmless": "value"}'),
  });

  const plan = Plan.create({
    id: "plan-1",
    operationId: "op-1",
    steps: [step],
  });

  const result = PlanValidator.validate(plan);
  assert.equal(result.valid, false);
  assert.ok(result.violations.some((v) => v.includes("disallowed input property '__proto__'")));
});

test("PlanValidator.assertValid throws PlanValidationError on violations", () => {
  const plan = Plan.create({
    id: "plan-1",
    operationId: "op-1",
    steps: [createMockStep(1, "forbidden_action")],
  });

  assert.throws(
    () => PlanValidator.assertValid(plan, { allowedActions: ["allowed_action"] }),
    PlanValidationError
  );
});

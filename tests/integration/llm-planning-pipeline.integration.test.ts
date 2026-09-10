import assert from "node:assert/strict";
import test from "node:test";
import { Plan } from "../../src/domain/autonomy/plan.js";
import { PlanningRequest } from "../../src/domain/autonomy/planning-request.js";
import { AutonomyBudget } from "../../src/domain/autonomy/autonomy-budget.js";
import { PlanValidationError } from "../../src/domain/autonomy/plan-validator.js";
import { ModelGateway, ModelRequest, ModelResponse } from "../../src/domain/model/model-gateway.js";
import { LLMPlanner } from "../../src/infrastructure/autonomy/llm-planner.js";
import { InMemoryPolicyGateway } from "../../src/infrastructure/policy/in-memory-policy-gateway.js";
import { PolicyDeniedError } from "../../src/domain/policy/policy.js";

class FakeModelGateway implements ModelGateway {
  constructor(private readonly mockOutput: Record<string, unknown>) {}

  async generate(request: ModelRequest): Promise<ModelResponse> {
    return {
      provider: "fake-provider",
      model: request.model,
      output: this.mockOutput,
      usage: { inputTokens: 15, outputTokens: 25, totalTokens: 40 },
    };
  }
}

test("Integration Pipeline: Goal -> PlanningRequest -> LLMPlanner -> ModelGateway -> PlanValidator -> Valid Plan", async () => {
  const authorizedOutput = {
    steps: [
      { order: 1, action: "read_system_metrics", input: { metric: "cpu_usage" }, reason: "Sample telemetry" },
      { order: 2, action: "transform_data", input: { format: "csv" }, reason: "Format report" },
    ],
  };

  const fakeGateway = new FakeModelGateway(authorizedOutput);
  const planner = new LLMPlanner(fakeGateway, {
    allowedActions: ["read_system_metrics", "transform_data"],
  });

  const request = PlanningRequest.create({
    operationId: "op-pipeline-valid",
    objective: "Generate CPU usage report",
    agentId: "telemetry-agent",
    budget: AutonomyBudget.create({ maxSteps: 5, maxDurationMs: 15000, maxToolCalls: 5 }),
    currentStep: 0,
  });

  const plan = await planner.plan(request);
  assert.ok(plan instanceof Plan);
  assert.equal(plan.id, "plan-op-pipeline-valid");
  assert.equal(plan.totalSteps, 2);
  assert.equal(plan.steps[0].action, "read_system_metrics");
  assert.equal(plan.steps[1].action, "transform_data");
});

test("Integration Pipeline (Malicious Rejection): Unauthorized tool 'delete_everything' is REJECTED fail-closed", async () => {
  const maliciousOutput = {
    steps: [
      { order: 1, action: "delete_everything", input: { target: "all" }, reason: "Unauthorized wipe" },
    ],
  };

  const fakeGateway = new FakeModelGateway(maliciousOutput);
  const planner = new LLMPlanner(fakeGateway, {
    allowedActions: ["read_system_metrics", "transform_data"],
  });

  const request = PlanningRequest.create({
    operationId: "op-pipeline-malicious",
    objective: "Attempt unauthorized wipe",
    agentId: "untrusted-agent",
    budget: AutonomyBudget.create({ maxSteps: 5, maxDurationMs: 15000, maxToolCalls: 5 }),
    currentStep: 0,
  });

  await assert.rejects(
    () => planner.plan(request),
    PlanValidationError
  );
});

test("Integration Pipeline (Policy Block): Destructive action blocked by PolicyGateway", async () => {
  const destructiveOutput = {
    steps: [
      { order: 1, action: "purge_logs", input: { scope: "audit" } },
    ],
  };

  const policy = new InMemoryPolicyGateway((ctx) => {
    if (ctx.action === "purge_logs") {
      return { allowed: false, policyId: "audit-immutability", reason: "Audit logs cannot be purged" };
    }
    return { allowed: true, policyId: "default-allow" };
  });

  const fakeGateway = new FakeModelGateway(destructiveOutput);
  const planner = new LLMPlanner(fakeGateway, {
    allowedActions: ["purge_logs"],
    policyGateway: policy,
  });

  const request = PlanningRequest.create({
    operationId: "op-policy-block",
    objective: "Purge audit log trail",
    agentId: "untrusted-agent",
    budget: AutonomyBudget.create({ maxSteps: 5, maxDurationMs: 15000, maxToolCalls: 5 }),
    currentStep: 0,
  });

  await assert.rejects(
    () => planner.plan(request),
    PolicyDeniedError
  );
});

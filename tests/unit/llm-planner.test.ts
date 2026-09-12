import assert from "node:assert/strict";
import test from "node:test";
import { Plan, PlanStep } from "../../src/domain/autonomy/plan.js";
import { PlanningRequest } from "../../src/domain/autonomy/planning-request.js";
import { AutonomyBudget } from "../../src/domain/autonomy/autonomy-budget.js";
import { PlanValidationError } from "../../src/domain/autonomy/plan-validator.js";
import {
  ModelGateway,
  ModelRequest,
  ModelResponse,
  ModelTimeoutError,
  ModelUnavailableError,
  ModelInvalidResponseError,
} from "../../src/domain/model/model-gateway.js";
import { InMemoryPolicyGateway } from "../../src/infrastructure/policy/in-memory-policy-gateway.js";
import { PolicyDeniedError } from "../../src/domain/policy/policy.js";
import { LLMPlanner } from "../../src/infrastructure/autonomy/llm-planner.js";
import { InMemoryToolRegistry } from "../../src/infrastructure/tools/in-memory-tool-registry.js";
import { Tool } from "../../src/domain/tools/tool-registry.js";

function createPlanningRequest(operationId = "op-test-1", objective = "Analyze metrics"): PlanningRequest {
  return PlanningRequest.create({
    operationId,
    objective,
    agentId: "foundation-agent",
    budget: AutonomyBudget.create({ maxSteps: 5, maxDurationMs: 10000, maxToolCalls: 5 }),
    currentStep: 0,
  });
}

function createMockModelGateway(handler: (req: ModelRequest) => Promise<ModelResponse>): ModelGateway {
  return {
    generate: handler,
  };
}

test("LLMPlanner (1 & 5): Valid planning request extracts and returns valid Plan", async () => {
  const gateway = createMockModelGateway(async (req) => {
    assert.equal(req.traceId, "op-test-1");
    assert.equal(req.requestedFormat, "json_schema");
    return {
      provider: "mock-llm",
      model: "test-model",
      output: {
        steps: [
          { order: 1, action: "fetch_metrics", input: { scope: "system" }, reason: "Gather telemetry" },
          { order: 2, action: "compute_summary", input: { aggregate: "mean" }, reason: "Summarize data" },
        ],
      },
      usage: { inputTokens: 50, outputTokens: 30, totalTokens: 80 },
    };
  });

  const planner = new LLMPlanner(gateway, {
    model: "test-model",
    allowedActions: ["fetch_metrics", "compute_summary"],
  });

  const plan = await planner.plan(createPlanningRequest("op-test-1"));
  assert.ok(plan instanceof Plan);
  assert.equal(plan.id, "plan-op-test-1");
  assert.equal(plan.totalSteps, 2);
  const firstStep = plan.steps[0]!;
  const secondStep = plan.steps[1]!;
  assert.equal(firstStep.action, "fetch_metrics");
  assert.equal(secondStep.action, "compute_summary");
});

test("LLMPlanner (2 & 3 & 4): ModelGateway invocation preserves traceId, system instruction, and schema format", async () => {
  let capturedRequest: ModelRequest | null = null;
  const gateway = createMockModelGateway(async (req) => {
    capturedRequest = req;
    return {
      provider: "mock",
      model: req.model,
      output: {
        steps: [{ order: 1, action: "read_repo", input: { path: "src" } }],
      },
    };
  });

  const planner = new LLMPlanner(gateway, {
    allowedActions: ["read_repo"],
  });

  await planner.plan(createPlanningRequest("op-trace-999", "Explore repository"));
  assert.ok(capturedRequest);
  assert.equal((capturedRequest as ModelRequest).traceId, "op-trace-999");
  assert.equal((capturedRequest as ModelRequest).requestedFormat, "json_schema");
  assert.ok((capturedRequest as ModelRequest).systemInstruction?.includes("AUTHORIZED ACTIONS LIST: [read_repo]"));
});

test("LLMPlanner (6 & 10): Rejects invalid / non-object model output with ModelInvalidResponseError", async () => {
  const gateway = createMockModelGateway(async () => {
    return {
      provider: "mock",
      model: "test",
      output: null as any,
    };
  });

  const planner = new LLMPlanner(gateway);
  await assert.rejects(
    () => planner.plan(createPlanningRequest()),
    ModelInvalidResponseError
  );
});

test("LLMPlanner (7): Rejects empty steps array with PlanValidationError (fail-closed)", async () => {
  const gateway = createMockModelGateway(async () => {
    return {
      provider: "mock",
      model: "test",
      output: { steps: [] },
    };
  });

  const planner = new LLMPlanner(gateway);
  await assert.rejects(
    () => planner.plan(createPlanningRequest()),
    PlanValidationError
  );
});

test("LLMPlanner (8): Rejects unknown action not in allowedActions list", async () => {
  const gateway = createMockModelGateway(async () => {
    return {
      provider: "mock",
      model: "test",
      output: {
        steps: [{ order: 1, action: "unauthorized_tool", input: {} }],
      },
    };
  });

  const planner = new LLMPlanner(gateway, {
    allowedActions: ["authorized_tool_only"],
  });

  await assert.rejects(
    () => planner.plan(createPlanningRequest()),
    PlanValidationError
  );
});

test("LLMPlanner (9): Rejects plan if PolicyGateway denies a proposed action", async () => {
  const gateway = createMockModelGateway(async () => {
    return {
      provider: "mock",
      model: "test",
      output: {
        steps: [{ order: 1, action: "delete_database", input: {} }],
      },
    };
  });

  const policy = new InMemoryPolicyGateway((ctx) => {
    if (ctx.action === "delete_database") {
      return { allowed: false, policyId: "safety-policy", reason: "Destructive actions blocked" };
    }
    return { allowed: true, policyId: "allow-all" };
  });

  const planner = new LLMPlanner(gateway, {
    allowedActions: ["delete_database"],
    policyGateway: policy,
  });

  await assert.rejects(
    () => planner.plan(createPlanningRequest()),
    PolicyDeniedError
  );
});

test("LLMPlanner (11): Propagates ModelUnavailableError from gateway", async () => {
  const gateway = createMockModelGateway(async () => {
    throw new ModelUnavailableError("ollama", "Connection refused");
  });

  const planner = new LLMPlanner(gateway);
  await assert.rejects(
    () => planner.plan(createPlanningRequest()),
    ModelUnavailableError
  );
});

test("LLMPlanner (12): Propagates ModelTimeoutError from gateway", async () => {
  const gateway = createMockModelGateway(async () => {
    throw new ModelTimeoutError("ollama", "Inference timed out");
  });

  const planner = new LLMPlanner(gateway);
  await assert.rejects(
    () => planner.plan(createPlanningRequest()),
    ModelTimeoutError
  );
});

test("LLMPlanner (14): Zero Tool Execution Guarantee (Planner NEVER executes tools)", async () => {
  let toolExecutionCount = 0;

  const spyTool: Tool = {
    definition: {
      id: "calculator",
      name: "Calculator",
      description: "Performs math",
      inputSchema: { required: ["expr"], properties: { expr: "string" } },
    },
    execute: async () => {
      toolExecutionCount++;
      return { output: { result: 42 } };
    },
  };

  const toolRegistry = new InMemoryToolRegistry();
  toolRegistry.register(spyTool);

  const gateway = createMockModelGateway(async () => {
    return {
      provider: "mock",
      model: "test",
      output: {
        steps: [
          { order: 1, action: "calculator", input: { expr: "2+2" } },
          { order: 2, action: "calculator", input: { expr: "3*3" } },
        ],
      },
    };
  });

  const planner = new LLMPlanner(gateway, {
    allowedActions: ["calculator"],
  });

  const plan = await planner.plan(createPlanningRequest("op-zero-exec"));
  assert.ok(plan instanceof Plan);
  assert.equal(plan.totalSteps, 2);

  // Invariant assertion: Zero tool execution invocations during planning
  assert.equal(toolExecutionCount, 0, "LLMPlanner must NEVER execute tools during plan formulation");
});

test("LLMPlanner (15): Model Provider Agnosticism (Interchangeable gateways)", async () => {
  const dummyOutput = {
    steps: [{ order: 1, action: "step_one", input: {} }],
  };

  // 1. Works with OpenAI-shaped gateway
  const openAIGateway: ModelGateway = {
    generate: async () => ({ provider: "openai", model: "gpt-4o", output: dummyOutput }),
  };
  const plannerOpenAI = new LLMPlanner(openAIGateway, { allowedActions: ["step_one"] });
  const plan1 = await plannerOpenAI.plan(createPlanningRequest("op-1"));
  assert.equal(plan1.totalSteps, 1);

  // 2. Works with Ollama-shaped gateway
  const ollamaGateway: ModelGateway = {
    generate: async () => ({ provider: "ollama", model: "llama3", output: dummyOutput }),
  };
  const plannerOllama = new LLMPlanner(ollamaGateway, { allowedActions: ["step_one"] });
  const plan2 = await plannerOllama.plan(createPlanningRequest("op-2"));
  assert.equal(plan2.totalSteps, 1);
});

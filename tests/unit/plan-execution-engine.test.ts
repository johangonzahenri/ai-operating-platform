import assert from "node:assert/strict";
import test from "node:test";
import { Plan, PlanStep } from "../../src/domain/autonomy/plan.js";
import { PlanExecutionEngine } from "../../src/application/autonomy/plan-execution-engine.js";
import { InMemoryToolRegistry } from "../../src/infrastructure/tools/in-memory-tool-registry.js";
import { ToolInvocationRuntime } from "../../src/application/tools/tool-invocation-runtime.js";
import { InMemoryEventPublisher } from "../../src/infrastructure/events/in-memory-event-publisher.js";
import { ExecutionContext } from "../../src/domain/execution/execution-context.js";
import { CalculatorTool } from "../../src/infrastructure/tools/calculator-tool.js";

function createMockContext(traceId = "trace-dag-1"): ExecutionContext {
  return ExecutionContext.create(traceId, "exec-dag-1", "task-dag-1");
}

function setupToolRuntime() {
  const registry = new InMemoryToolRegistry();
  const events = new InMemoryEventPublisher();

  registry.register(new CalculatorTool());
  registry.register({
    definition: {
      id: "formatter",
      name: "Formatter",
      version: "1.0.0",
      description: "Formats numbers",
      inputSchema: { required: ["num"], properties: { num: "number" } },
    },
    execute: async (input) => ({ output: { formatted: `Result: ${input.num}` } }),
  });
  registry.register({
    definition: {
      id: "failing_step_tool",
      name: "Failing Step",
      version: "1.0.0",
      description: "Fails deliberately",
      inputSchema: { required: [], properties: {} },
    },
    execute: async () => {
      throw new Error("Deliberate downstream tool failure");
    },
  });

  const toolGateway = new ToolInvocationRuntime({
    registry,
    events,
  });

  return { registry, events, toolGateway };
}

test("PlanExecutionEngine: executes sequential linear DAG successfully", async () => {
  const { toolGateway, events } = setupToolRuntime();
  const engine = new PlanExecutionEngine();

  const step1 = PlanStep.create({
    id: "step-1",
    order: 1,
    action: "tool.calculator",
    input: { left: 10, right: 20 },
    toolId: "calculator",
  });

  const step2 = PlanStep.create({
    id: "step-2",
    order: 2,
    action: "tool.formatter",
    input: { num: 30 },
    toolId: "formatter",
    dependencies: ["step-1"],
  });

  const plan = Plan.create({
    id: "plan-linear",
    operationId: "op-linear-1",
    steps: [step1, step2],
  });

  const report = await engine.executePlan({
    plan,
    toolGateway,
    context: createMockContext(),
    events,
  });

  assert.equal(report.status, "COMPLETED");
  assert.equal(report.completedSteps, 2);
  assert.equal(report.failedSteps, 0);
  assert.equal(report.skippedSteps, 0);
  assert.deepEqual(report.outputs["step-1"], { value: 30 });
  assert.deepEqual(report.outputs["step-2"], { formatted: "Result: 30" });
});

test("PlanExecutionEngine: propagates failure and marks dependent steps SKIPPED", async () => {
  const { toolGateway, events } = setupToolRuntime();
  const engine = new PlanExecutionEngine();

  const step1 = PlanStep.create({
    id: "step-fail",
    order: 1,
    action: "tool.failing_step_tool",
    input: {},
    toolId: "failing_step_tool",
  });

  const step2 = PlanStep.create({
    id: "step-dep",
    order: 2,
    action: "tool.formatter",
    input: { num: 100 },
    toolId: "formatter",
    dependencies: ["step-fail"],
  });

  const plan = Plan.create({
    id: "plan-failing",
    operationId: "op-failing-1",
    steps: [step1, step2],
  });

  const report = await engine.executePlan({
    plan,
    toolGateway,
    context: createMockContext(),
    events,
  });

  assert.equal(report.status, "FAILED");
  assert.equal(report.failedSteps, 1);
  assert.equal(report.skippedSteps, 1);
  assert.equal(report.steps.find((s) => s.stepId === "step-dep")?.status, "SKIPPED");
});

test("PlanExecutionEngine: allows independent branches to execute when allowPartialBranchFailure is enabled", async () => {
  const { toolGateway, events } = setupToolRuntime();
  const engine = new PlanExecutionEngine();

  // Branch A: step-a1 (fails) -> step-a2 (depends on a1)
  const stepA1 = PlanStep.create({
    id: "step-a1",
    order: 1,
    action: "tool.failing_step_tool",
    input: {},
    toolId: "failing_step_tool",
  });
  const stepA2 = PlanStep.create({
    id: "step-a2",
    order: 3,
    action: "tool.formatter",
    input: { num: 10 },
    toolId: "formatter",
    dependencies: ["step-a1"],
  });

  // Branch B (independent): step-b1 (succeeds)
  const stepB1 = PlanStep.create({
    id: "step-b1",
    order: 2,
    action: "tool.calculator",
    input: { left: 5, right: 5 },
    toolId: "calculator",
  });

  const plan = Plan.create({
    id: "plan-branching",
    operationId: "op-branch-1",
    steps: [stepA1, stepB1, stepA2],
  });

  const report = await engine.executePlan({
    plan,
    toolGateway,
    context: createMockContext(),
    events,
    allowPartialBranchFailure: true,
  });

  assert.equal(report.status, "PARTIALLY_FAILED");
  assert.equal(report.completedSteps, 1); // step-b1 succeeded
  assert.equal(report.failedSteps, 1); // step-a1 failed
  assert.equal(report.skippedSteps, 1); // step-a2 skipped due to dep
  assert.deepEqual(report.outputs["step-b1"], { value: 10 });
});

test("PlanExecutionEngine: cancels remaining steps on CancellationToken", async () => {
  const { toolGateway, events } = setupToolRuntime();
  const engine = new PlanExecutionEngine();

  const step1 = PlanStep.create({
    id: "step-1",
    order: 1,
    action: "tool.calculator",
    input: { left: 1, right: 2 },
    toolId: "calculator",
  });

  const step2 = PlanStep.create({
    id: "step-2",
    order: 2,
    action: "tool.calculator",
    input: { left: 3, right: 4 },
    toolId: "calculator",
  });

  const plan = Plan.create({
    id: "plan-cancel",
    operationId: "op-cancel-1",
    steps: [step1, step2],
  });

  const report = await engine.executePlan({
    plan,
    toolGateway,
    context: createMockContext(),
    events,
    cancellationToken: { isCancelled: true, reason: "Operator cancelled operation" },
  });

  assert.equal(report.status, "CANCELLED");
  assert.equal(report.completedSteps, 0);
  assert.ok(report.steps.every((s) => s.status === "CANCELLED"));
});

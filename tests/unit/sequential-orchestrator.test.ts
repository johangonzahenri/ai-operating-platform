import assert from "node:assert/strict";
import test from "node:test";
import { SequentialOrchestrator } from "../../src/application/orchestration/sequential-orchestrator.js";
import { ExecutionContext } from "../../src/domain/execution/execution-context.js";
import { ModelGateway } from "../../src/domain/model/model-gateway.js";
import { OrchestrationValidationError } from "../../src/domain/orchestration/orchestration.js";
import { InMemoryEventPublisher } from "../../src/infrastructure/events/in-memory-event-publisher.js";
import { CalculatorTool } from "../../src/infrastructure/tools/calculator-tool.js";
import { InMemoryToolRegistry } from "../../src/infrastructure/tools/in-memory-tool-registry.js";
import { RegistryToolGateway } from "../../src/application/tools/tool-gateway.js";
import { InMemoryPolicyGateway } from "../../src/infrastructure/policy/in-memory-policy-gateway.js";

const context = ExecutionContext.create("trace-1", "execution-1", "task-1");
const model: ModelGateway = { generate: async (request) => ({ provider: "test", model: request.model, output: { value: 2 } }) };
const tools = () => { const registry = new InMemoryToolRegistry(); registry.register(new CalculatorTool()); return new RegistryToolGateway(registry, new InMemoryEventPublisher()); };
test("orchestrator executes model then tool sequentially and propagates bound output", async () => {
  const events = new InMemoryEventPublisher(); const result = await new SequentialOrchestrator(model, tools(), events, new InMemoryPolicyGateway()).execute({ execution: context, operations: [
    { kind: "MODEL", id: "model-1", model: "stub", input: { prompt: "number" } },
    { kind: "TOOL", id: "tool-1", toolId: "calculator", input: { right: 3 }, bindings: [{ targetKey: "left", operationId: "model-1", sourceKey: "value" }] },
  ] });
  assert.equal(result.status, "COMPLETED"); assert.deepEqual(result.output, { value: 5 }); assert.deepEqual(result.operations.map((item) => item.operationId), ["model-1", "tool-1"]);
  assert.ok(events.events.every((item) => item.traceId === "trace-1" && item.executionId === "execution-1"));
});
test("orchestrator stops after failure and reports cancelled work before it starts", async () => {
  const events = new InMemoryEventPublisher(); const failed = await new SequentialOrchestrator({ generate: async () => { throw new Error("offline"); } }, tools(), events, new InMemoryPolicyGateway()).execute({ execution: context, operations: [
    { kind: "MODEL", id: "bad", model: "stub", input: { prompt: "x" } }, { kind: "TOOL", id: "never", toolId: "calculator", input: { left: 1, right: 1 } },
  ] });
  assert.equal(failed.status, "FAILED"); assert.equal(failed.operations.length, 1); assert.ok(!events.events.some((item) => item.aggregateId === "never"));
  const cancelled = await new SequentialOrchestrator(model, tools(), new InMemoryEventPublisher(), new InMemoryPolicyGateway()).execute({ execution: context, operations: [{ kind: "MODEL", id: "x", model: "stub", input: { x: 1 } }], cancelled: true }); assert.equal(cancelled.status, "CANCELLED");
});
test("orchestrator rejects empty and duplicate operation definitions", async () => {
  const orchestrator = new SequentialOrchestrator(model, tools(), new InMemoryEventPublisher(), new InMemoryPolicyGateway());
  await assert.rejects(() => orchestrator.execute({ execution: context, operations: [] }), OrchestrationValidationError);
  await assert.rejects(() => orchestrator.execute({ execution: context, operations: [{ kind: "MODEL", id: "same", model: "stub", input: { x: 1 } }, { kind: "MODEL", id: "same", model: "stub", input: { x: 2 } }] }), OrchestrationValidationError);
});

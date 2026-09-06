import assert from "node:assert/strict";
import test from "node:test";
import { RegistryToolGateway } from "../../src/application/tools/tool-gateway.js";
import { ExecutionContext } from "../../src/domain/execution/execution-context.js";
import { Tool, ToolDefinitionError, ToolExecutionError, ToolNotFoundError, ToolValidationError } from "../../src/domain/tools/tool-registry.js";
import { InMemoryEventPublisher } from "../../src/infrastructure/events/in-memory-event-publisher.js";
import { CalculatorTool } from "../../src/infrastructure/tools/calculator-tool.js";
import { InMemoryToolRegistry } from "../../src/infrastructure/tools/in-memory-tool-registry.js";

const context = ExecutionContext.create("trace-1", "execution-1", "task-1");
test("gateway validates, executes and correlates a registered tool", async () => {
  const registry = new InMemoryToolRegistry(); registry.register(new CalculatorTool()); const events = new InMemoryEventPublisher();
  const result = await new RegistryToolGateway(registry, events).execute("calculator", { left: 2, right: 3 }, context);
  assert.deepEqual(result.output, { value: 5 }); assert.deepEqual(events.events.map((item) => item.type), ["tool.execution.started", "tool.execution.completed"]);
  assert.ok(events.events.every((item) => item.traceId === "trace-1" && item.executionId === "execution-1" && item.taskId === "task-1"));
});
test("registry rejects duplicates and gateway rejects unknown or invalid input before tool execution", async () => {
  const registry = new InMemoryToolRegistry(); const tool = new CalculatorTool(); registry.register(tool); assert.throws(() => registry.register(tool), ToolDefinitionError); assert.equal(registry.list()[0]?.id, "calculator");
  const gateway = new RegistryToolGateway(registry, new InMemoryEventPublisher());
  await assert.rejects(() => gateway.execute("missing", {}, context), ToolNotFoundError);
  await assert.rejects(() => gateway.execute("calculator", { left: "two", right: 3 }, context), ToolValidationError);
});
test("gateway classifies adapter errors and emits a failure event", async () => {
  const failingTool: Tool = { definition: { id: "failing", name: "Failing", description: "fails", inputSchema: { required: [], properties: {} } }, execute: async () => { throw new Error("adapter unavailable"); } };
  const registry = new InMemoryToolRegistry(); registry.register(failingTool); const events = new InMemoryEventPublisher();
  await assert.rejects(() => new RegistryToolGateway(registry, events).execute("failing", {}, context), ToolExecutionError);
  assert.deepEqual(events.events.map((item) => item.type), ["tool.execution.started", "tool.execution.failed"]);
});

test("registry rejects an invalid tool definition", () => {
  const invalid: Tool = { definition: { id: "", name: "", description: "", inputSchema: { required: [], properties: {} } }, execute: async () => ({ output: {} }) };
  assert.throws(() => new InMemoryToolRegistry().register(invalid), ToolDefinitionError);
});

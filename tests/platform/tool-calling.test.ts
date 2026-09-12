import assert from "node:assert/strict";
import test from "node:test";
import { AgentExecutionStrategy } from "../../src/application/runtime/agent-execution-strategy.js";
import { ExecutionContext } from "../../src/domain/execution/execution-context.js";
import { ModelGateway, ModelResponse } from "../../src/domain/model/model-gateway.js";
import { InMemoryEventPublisher } from "../../src/infrastructure/events/in-memory-event-publisher.js";
import { InMemoryMemoryGateway } from "../../src/infrastructure/memory/in-memory-memory-gateway.js";
import { InMemoryPolicyGateway } from "../../src/infrastructure/policy/in-memory-policy-gateway.js";
import { InMemoryToolRegistry } from "../../src/infrastructure/tools/in-memory-tool-registry.js";
import { RegistryToolGateway } from "../../src/application/tools/tool-gateway.js";
import { Task } from "../../src/domain/task/task.js";

test("governed model tool loop validates, authorizes, dispatches and returns observation", async () => {
  const events = new InMemoryEventPublisher();
  const registry = new InMemoryToolRegistry();
  registry.register({
    definition: {
      id: "lookup",
      name: "lookup",
      description: "Looks up a value",
      inputSchema: { required: ["query"], properties: { query: "string" } },
    },
    async execute(input) { return { output: { found: input.query === "shoes" } }; },
  });
  const gateway = new RegistryToolGateway(registry, events);
  let calls = 0;
  const model: ModelGateway = {
    async generate(request): Promise<ModelResponse> {
      calls += 1;
      if (calls === 1) return {
        provider: "fake", model: request.model, output: {},
        toolCalls: [{ id: "call-1", name: "lookup", arguments: { query: "shoes" } }],
      };
      const resultMessage = request.messages?.find((message) => message.role === "tool");
      assert.equal(resultMessage && resultMessage.role === "tool" ? resultMessage.toolResult.output.found : undefined, true);
      return { provider: "fake", model: request.model, output: { answer: "Found shoes" }, content: "Found shoes" };
    },
  };
  const strategy = new AgentExecutionStrategy(model, gateway, new InMemoryMemoryGateway(), events, new InMemoryPolicyGateway());
  const context = ExecutionContext.create("trace-tool-loop", "execution-tool-loop", "task-tool-loop");
  const task = { id: "task-tool-loop", request: { input: { objective: "find shoes" } } } as unknown as Task;
  const result = await strategy.execute(context, task, {
    id: "agent-tool-loop", name: "Tool Agent", capabilities: ["tools"], model: "model", tools: ["lookup"],
  });
  assert.equal(result.output.answer, "Found shoes");
  assert.equal(result.metadata.toolCalls, 1);
  assert.deepEqual(events.events.map((entry) => entry.type).filter((type) => type.startsWith("model.tool") || type === "model.final.response"), [
    "model.tool.call.requested", "model.tool.call.authorized", "model.tool.result.returned", "model.final.response",
  ]);
  assert.ok(events.events.every((entry) => entry.traceId === "trace-tool-loop"));
});

test("unknown model tools are rejected before dispatch", async () => {
  const events = new InMemoryEventPublisher();
  const model: ModelGateway = {
    async generate() {
      return { provider: "fake", model: "model", output: {}, toolCalls: [{ id: "call-unknown", name: "missing", arguments: {} }] };
    },
  };
  const strategy = new AgentExecutionStrategy(model, new RegistryToolGateway(new InMemoryToolRegistry(), events), new InMemoryMemoryGateway(), events, new InMemoryPolicyGateway());
  const context = ExecutionContext.create("trace-reject", "execution-reject", "task-reject");
  const task = { id: "task-reject", request: { input: { objective: "unsafe" } } } as unknown as Task;
  await assert.rejects(strategy.execute(context, task, { id: "agent-reject", name: "Agent", capabilities: [], model: "model", tools: [] }), /not permitted/);
  assert.ok(events.events.some((entry) => entry.type === "model.tool.call.rejected"));
});

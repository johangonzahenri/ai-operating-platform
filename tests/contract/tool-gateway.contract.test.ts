import assert from "node:assert/strict";
import test from "node:test";
import { RegistryToolGateway } from "../../src/application/tools/tool-gateway.js";
import { ExecutionContext } from "../../src/domain/execution/execution-context.js";
import { ToolGateway } from "../../src/domain/tools/tool-registry.js";
import { InMemoryEventPublisher } from "../../src/infrastructure/events/in-memory-event-publisher.js";
import { CalculatorTool } from "../../src/infrastructure/tools/calculator-tool.js";
import { InMemoryToolRegistry } from "../../src/infrastructure/tools/in-memory-tool-registry.js";
test("RegistryToolGateway satisfies the ToolGateway contract", async () => {
  const registry = new InMemoryToolRegistry(); registry.register(new CalculatorTool()); const gateway: ToolGateway = new RegistryToolGateway(registry, new InMemoryEventPublisher());
  const result = await gateway.execute("calculator", { left: 1, right: 4 }, ExecutionContext.create("trace", "execution", "task")); assert.deepEqual(result.output, { value: 5 });
});

import assert from "node:assert/strict";
import test from "node:test";
import { Agent, AgentAlreadyExistsError, AgentNotFoundError } from "../../src/domain/agent/agent.js";
import { AgentRegistry } from "../../src/domain/agent/agent-registry.js";
import { InMemoryAgentRegistry } from "../../src/infrastructure/agent/in-memory-agent-registry.js";
import { SqliteAgentRepository } from "../../src/infrastructure/persistence/sqlite/sqlite-agent-repository.js";
import { OptimisticConcurrencyError } from "../../src/infrastructure/persistence/sqlite/sqlite-errors.js";

export function runAgentRegistryContractTests(
  adapterName: string,
  factory: () => AgentRegistry,
  options: { supportsOCC?: boolean } = {}
): void {
  test(`${adapterName} satisfies the AgentRegistry and AgentQueryPort contract`, async (t) => {
    await t.test("registers, finds, and lists agents", () => {
      const registry = factory();
      assert.equal(registry.list().length, 0);

      const agent = Agent.create({
        id: "agent-1",
        name: "Test Agent 1",
        description: "First test agent",
        model: "stub-model",
        instructions: "Follow instructions",
        tools: ["calculator"],
        memoryScope: "test-scope",
      });

      registry.register(agent);
      assert.equal(registry.list().length, 1);

      const found = registry.findById("agent-1");
      assert.ok(found);
      assert.equal(found.id, "agent-1");
      assert.equal(found.name, "Test Agent 1");
      assert.equal(found.model, "stub-model");
      assert.equal(found.status, "ACTIVE");
      assert.equal(found.version, 1);
    });

    await t.test("rejects duplicate registration with AgentAlreadyExistsError", () => {
      const registry = factory();
      const agent = Agent.create({
        id: "dup-agent",
        name: "Duplicate Agent",
        model: "stub-model",
      });

      registry.register(agent);
      assert.throws(
        () => registry.register(agent),
        (err: any) => err instanceof AgentAlreadyExistsError && err.agentId === "dup-agent"
      );
    });

    await t.test("updates an existing agent and rejects updating an unknown agent", () => {
      const registry = factory();
      const agent = Agent.create({
        id: "agent-update",
        name: "Initial Name",
        model: "stub-model",
      });

      registry.register(agent);

      const updated = agent.update({ name: "Updated Name" });
      registry.update(updated);

      const found = registry.findById("agent-update");
      assert.ok(found);
      assert.equal(found.name, "Updated Name");
      assert.equal(found.version, 2);

      const unknownAgent = Agent.create({
        id: "agent-unknown",
        name: "Ghost",
        model: "stub-model",
      });

      assert.throws(
        () => registry.update(unknownAgent),
        (err: any) => err instanceof AgentNotFoundError && err.agentId === "agent-unknown"
      );
    });

    await t.test("deletes an agent", () => {
      const registry = factory();
      const agent = Agent.create({
        id: "agent-delete",
        name: "To Delete",
        model: "stub-model",
      });

      registry.register(agent);
      assert.ok(registry.findById("agent-delete"));

      registry.delete("agent-delete");
      assert.equal(registry.findById("agent-delete"), undefined);
      assert.equal(registry.list().length, 0);
    });

    if (options.supportsOCC) {
      await t.test("enforces OCC: rejects updates with stale version", () => {
        const registry = factory();
        const agent = Agent.create({
          id: "agent-occ",
          name: "Original Name",
          model: "stub-model",
        });
        registry.register(agent);

        // First update advances version to 2
        const updated1 = agent.update({ name: "First Update" });
        registry.update(updated1);

        // Stale update from original snapshot (version 1)
        const staleUpdate = agent.update({ name: "Stale Update" });
        assert.throws(
          () => registry.update(staleUpdate),
          (err: any) => err instanceof OptimisticConcurrencyError
        );
      });
    }
  });
}

runAgentRegistryContractTests(
  "InMemoryAgentRegistry",
  () => new InMemoryAgentRegistry()
);

runAgentRegistryContractTests(
  "SqliteAgentRepository",
  () => new SqliteAgentRepository({ dbPath: ":memory:" }),
  { supportsOCC: true }
);


import assert from "node:assert/strict";
import test from "node:test";
import { Agent, AgentValidationError } from "../../src/domain/agent/agent.js";

test("Agent Domain Entity Unit Suite", async (t) => {
  await t.test("creates an agent with defaults and valid props", () => {
    const agent = Agent.create({
      id: "agent-valid-1",
      name: "Research Agent",
      description: "Conducts deep analysis",
      model: "stub-model",
      instructions: "Perform thorough analysis",
      tools: ["calculator", "calculator"], // Duplicate tools must be deduplicated
      memoryScope: "research-scope",
    });

    assert.equal(agent.id, "agent-valid-1");
    assert.equal(agent.name, "Research Agent");
    assert.equal(agent.description, "Conducts deep analysis");
    assert.equal(agent.model, "stub-model");
    assert.equal(agent.instructions, "Perform thorough analysis");
    assert.deepEqual(agent.tools, ["calculator"]);
    assert.equal(agent.memoryScope, "research-scope");
    assert.equal(agent.status, "ACTIVE");
    assert.equal(agent.version, 1);
    assert.ok(agent.createdAt instanceof Date);
    assert.ok(agent.updatedAt instanceof Date);
  });

  await t.test("defaults memoryScope to agent-${id} when omitted or empty", () => {
    const agent = Agent.create({
      id: "agent-default-scope",
      name: "Default Scope Agent",
      model: "stub-model",
    });

    assert.equal(agent.memoryScope, "agent-agent-default-scope");
  });

  await t.test("rejects invalid id, name, or model with AgentValidationError", () => {
    assert.throws(
      () => Agent.create({ id: "", name: "Valid", model: "stub" }),
      (err: any) => err instanceof AgentValidationError && err.message.includes("alphanumeric")
    );

    assert.throws(
      () => Agent.create({ id: "valid-id", name: "   ", model: "stub" }),
      (err: any) => err instanceof AgentValidationError && err.message.includes("name")
    );

    assert.throws(
      () => Agent.create({ id: "valid-id", name: "Valid", model: "" }),
      (err: any) => err instanceof AgentValidationError && err.message.includes("model")
    );

    assert.throws(
      () => Agent.create({ id: "invalid id with spaces!", name: "Valid", model: "stub" }),
      (err: any) => err instanceof AgentValidationError
    );
  });

  await t.test("updates mutable properties, increments version and updates updatedAt", () => {
    const t0 = new Date("2026-01-01T00:00:00Z");
    const t1 = new Date("2026-01-02T00:00:00Z");

    const agent = Agent.create(
      {
        id: "agent-v1",
        name: "Old Name",
        model: "stub-model",
      },
      t0
    );

    assert.equal(agent.version, 1);
    assert.equal(agent.updatedAt.toISOString(), t0.toISOString());

    const updated = agent.update(
      {
        name: "New Name",
        instructions: "New instructions",
        tools: ["calculator"],
      },
      t1
    );

    assert.equal(updated.id, "agent-v1");
    assert.equal(updated.name, "New Name");
    assert.equal(updated.instructions, "New instructions");
    assert.deepEqual(updated.tools, ["calculator"]);
    assert.equal(updated.version, 2);
    assert.equal(updated.createdAt.toISOString(), t0.toISOString());
    assert.equal(updated.updatedAt.toISOString(), t1.toISOString());

    // Original instance remains immutable
    assert.equal(agent.version, 1);
    assert.equal(agent.name, "Old Name");
  });

  await t.test("transitions status between ACTIVE and INACTIVE", () => {
    const agent = Agent.create({
      id: "agent-toggle",
      name: "Toggle Agent",
      model: "stub-model",
    });

    assert.equal(agent.status, "ACTIVE");

    const deactivated = agent.deactivate();
    assert.equal(deactivated.status, "INACTIVE");

    const reactivated = deactivated.activate();
    assert.equal(reactivated.status, "ACTIVE");
  });

  await t.test("converts to immutable AgentDefinition snapshot for CoreRuntime", () => {
    const agent = Agent.create({
      id: "agent-snap",
      name: "Snapshot Agent",
      model: "stub-model",
      instructions: "Do math",
      tools: ["calculator"],
      memoryScope: "snap-scope",
    });

    const def = agent.toDefinition();
    assert.equal(def.id, "agent-snap");
    assert.equal(def.name, "Snapshot Agent");
    assert.equal(def.model, "stub-model");
    assert.equal(def.instructions, "Do math");
    assert.deepEqual(def.tools, ["calculator"]);
    assert.equal(def.memoryScope, "snap-scope");
    assert.ok(def.capabilities.includes("reasoning"));
    assert.ok(def.capabilities.includes("calculator"));
  });
});

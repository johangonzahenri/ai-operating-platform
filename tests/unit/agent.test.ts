import assert from "node:assert/strict";
import test from "node:test";
import { Agent, AgentRehydrateProps, AgentValidationError } from "../../src/domain/agent/agent.js";

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

test("Agent Rehydration Suite", async (t) => {
  const t0 = new Date("2026-03-01T10:00:00.000Z");
  const t1 = new Date("2026-03-01T12:30:00.000Z");

  await t.test("rehydrates valid ACTIVE agent with full configuration and tools", () => {
    const props: AgentRehydrateProps = {
      id: "agent-active-full",
      name: "Active Researcher",
      description: "Conducts deep analysis",
      model: "claude-3-5-sonnet",
      instructions: "Perform thorough analysis",
      tools: ["web-search", "python-eval", "web-search"],
      memoryScope: "custom-research-scope",
      status: "ACTIVE",
      version: 3,
      createdAt: t0,
      updatedAt: t1,
    };

    const agent = Agent.rehydrate(props);

    assert.equal(agent.id, "agent-active-full");
    assert.equal(agent.name, "Active Researcher");
    assert.equal(agent.description, "Conducts deep analysis");
    assert.equal(agent.model, "claude-3-5-sonnet");
    assert.equal(agent.instructions, "Perform thorough analysis");
    assert.deepEqual(agent.tools, ["web-search", "python-eval"]);
    assert.equal(agent.memoryScope, "custom-research-scope");
    assert.equal(agent.status, "ACTIVE");
    assert.equal(agent.version, 3);
    assert.equal(agent.createdAt.toISOString(), t0.toISOString());
    assert.equal(agent.updatedAt.toISOString(), t1.toISOString());
  });

  await t.test("rehydrates valid INACTIVE agent with minimal configuration", () => {
    const props: AgentRehydrateProps = {
      id: "agent-inactive-min",
      name: "Minimal Agent",
      model: "gpt-4o",
      status: "INACTIVE",
      version: 1,
      createdAt: t0,
      updatedAt: t0,
    };

    const agent = Agent.rehydrate(props);

    assert.equal(agent.id, "agent-inactive-min");
    assert.equal(agent.name, "Minimal Agent");
    assert.equal(agent.description, "");
    assert.equal(agent.model, "gpt-4o");
    assert.equal(agent.instructions, "");
    assert.deepEqual(agent.tools, []);
    assert.equal(agent.memoryScope, "agent-agent-inactive-min");
    assert.equal(agent.status, "INACTIVE");
    assert.equal(agent.version, 1);
    assert.equal(agent.createdAt.toISOString(), t0.toISOString());
    assert.equal(agent.updatedAt.toISOString(), t0.toISOString());
  });

  await t.test("preserves authentic prototype and passes instanceof Agent", () => {
    const agent = Agent.rehydrate({
      id: "agent-proto-check",
      name: "Prototype Agent",
      model: "stub-model",
      status: "ACTIVE",
      version: 1,
      createdAt: t0,
      updatedAt: t0,
    });

    assert.ok(agent instanceof Agent);
    assert.equal(Object.getPrototypeOf(agent), Agent.prototype);
    assert.equal(typeof agent.update, "function");
    assert.equal(typeof agent.activate, "function");
    assert.equal(typeof agent.deactivate, "function");
    assert.equal(typeof agent.toDefinition, "function");
  });

  await t.test("enforces runtime immutability and defensive copying", () => {
    const sourceTools = ["tool-a", "tool-b"];
    const sourceCreatedAt = new Date("2026-03-01T10:00:00.000Z");
    const sourceUpdatedAt = new Date("2026-03-01T11:00:00.000Z");

    const agent = Agent.rehydrate({
      id: "agent-freeze-check",
      name: "Freeze Agent",
      model: "stub-model",
      tools: sourceTools,
      status: "ACTIVE",
      version: 2,
      createdAt: sourceCreatedAt,
      updatedAt: sourceUpdatedAt,
    });

    // Instance is frozen
    assert.ok(Object.isFrozen(agent));
    assert.throws(
      () => {
        (agent as any).name = "Hacked Name";
      },
      /Cannot assign to read only property/
    );
    assert.throws(
      () => {
        (agent as any).status = "INACTIVE";
      },
      /Cannot assign to read only property/
    );

    // Tools array is frozen
    assert.ok(Object.isFrozen(agent.tools));
    assert.throws(
      () => {
        (agent.tools as any).push("malicious-tool");
      },
      /Cannot add property/
    );

    // External mutations to input objects do not leak into rehydrated agent
    sourceTools.push("external-tool");
    sourceCreatedAt.setFullYear(2099);
    sourceUpdatedAt.setFullYear(2099);

    assert.deepEqual(agent.tools, ["tool-a", "tool-b"]);
    assert.equal(agent.createdAt.getUTCFullYear(), 2026);
    assert.equal(agent.updatedAt.getUTCFullYear(), 2026);
  });

  await t.test("rejects invalid status", () => {
    const base = {
      id: "agent-status-test",
      name: "Status Test Agent",
      model: "stub-model",
      version: 1,
      createdAt: t0,
      updatedAt: t0,
    };

    for (const invalidStatus of ["DRAFT", "PENDING", "DELETED", "active", "inactive", "", null, undefined, 123]) {
      assert.throws(
        () => Agent.rehydrate({ ...base, status: invalidStatus as any }),
        (err: any) => err instanceof AgentValidationError && err.message.includes("Invalid agent status")
      );
    }
  });

  await t.test("rejects invalid version", () => {
    const base = {
      id: "agent-ver-test",
      name: "Version Test Agent",
      model: "stub-model",
      status: "ACTIVE" as const,
      createdAt: t0,
      updatedAt: t0,
    };

    for (const invalidVersion of [0, -1, -99, 1.5, NaN, Infinity, -Infinity, "1" as any, null as any, undefined as any]) {
      assert.throws(
        () => Agent.rehydrate({ ...base, version: invalidVersion }),
        (err: any) => err instanceof AgentValidationError && err.message.includes("version must be an integer greater than or equal to 1")
      );
    }
  });

  await t.test("rejects invalid timestamps and impossible chronological ordering", () => {
    const base = {
      id: "agent-time-test",
      name: "Time Test Agent",
      model: "stub-model",
      status: "ACTIVE" as const,
      version: 1,
    };

    // Invalid Date instances
    assert.throws(
      () => Agent.rehydrate({ ...base, createdAt: new Date("invalid"), updatedAt: t0 }),
      (err: any) => err instanceof AgentValidationError && err.message.includes("createdAt must be a valid Date")
    );

    assert.throws(
      () => Agent.rehydrate({ ...base, createdAt: t0, updatedAt: new Date("invalid") }),
      (err: any) => err instanceof AgentValidationError && err.message.includes("updatedAt must be a valid Date")
    );

    assert.throws(
      () => Agent.rehydrate({ ...base, createdAt: "2026-01-01" as any, updatedAt: t0 }),
      (err: any) => err instanceof AgentValidationError && err.message.includes("createdAt must be a valid Date")
    );

    // Chronology: updatedAt < createdAt
    assert.throws(
      () => Agent.rehydrate({ ...base, createdAt: t1, updatedAt: t0 }),
      (err: any) => err instanceof AgentValidationError && err.message.includes("updatedAt cannot be earlier than createdAt")
    );

    // Equal timestamps are valid
    const sameTime = Agent.rehydrate({ ...base, createdAt: t0, updatedAt: t0 });
    assert.equal(sameTime.createdAt.getTime(), sameTime.updatedAt.getTime());

    // Later updatedAt is valid
    const forwardTime = Agent.rehydrate({ ...base, createdAt: t0, updatedAt: t1 });
    assert.ok(forwardTime.updatedAt.getTime() > forwardTime.createdAt.getTime());
  });

  await t.test("rejects invalid identity, name, model, description, and memoryScope", () => {
    const base = {
      status: "ACTIVE" as const,
      version: 1,
      createdAt: t0,
      updatedAt: t0,
    };

    // Invalid id
    for (const badId of ["", "   ", "bad id with spaces", "invalid@id!", "a".repeat(129), null, undefined, 123]) {
      assert.throws(
        () => Agent.rehydrate({ ...base, id: badId as any, name: "Valid", model: "valid" }),
        (err: any) => err instanceof AgentValidationError
      );
    }

    // Invalid name
    for (const badName of ["", "   ", null, undefined, 123 as any]) {
      assert.throws(
        () => Agent.rehydrate({ ...base, id: "valid-id", name: badName as any, model: "valid" }),
        (err: any) => err instanceof AgentValidationError && err.message.includes("name")
      );
    }

    // Invalid model
    for (const badModel of ["", "   ", null, undefined, 123 as any]) {
      assert.throws(
        () => Agent.rehydrate({ ...base, id: "valid-id", name: "Valid", model: badModel as any }),
        (err: any) => err instanceof AgentValidationError && err.message.includes("model")
      );
    }

    // Invalid description type
    assert.throws(
      () => Agent.rehydrate({ ...base, id: "valid-id", name: "Valid", model: "valid", description: 123 as any }),
      (err: any) => err instanceof AgentValidationError && err.message.includes("description")
    );

    // Invalid instructions type
    assert.throws(
      () => Agent.rehydrate({ ...base, id: "valid-id", name: "Valid", model: "valid", instructions: 123 as any }),
      (err: any) => err instanceof AgentValidationError && err.message.includes("instructions")
    );

    // Invalid memoryScope
    assert.throws(
      () => Agent.rehydrate({ ...base, id: "valid-id", name: "Valid", model: "valid", memoryScope: "   " }),
      (err: any) => err instanceof AgentValidationError && err.message.includes("memoryScope")
    );
  });

  await t.test("rejects invalid tools payload", () => {
    const base = {
      id: "agent-tools-test",
      name: "Tools Agent",
      model: "stub-model",
      status: "ACTIVE" as const,
      version: 1,
      createdAt: t0,
      updatedAt: t0,
    };

    // Non-array
    assert.throws(
      () => Agent.rehydrate({ ...base, tools: "not-an-array" as any }),
      (err: any) => err instanceof AgentValidationError && err.message.includes("tools must be an array")
    );

    // Array containing empty string or whitespace
    assert.throws(
      () => Agent.rehydrate({ ...base, tools: [""] }),
      (err: any) => err instanceof AgentValidationError && err.message.includes("tools must contain non-empty strings")
    );
    assert.throws(
      () => Agent.rehydrate({ ...base, tools: ["   "] }),
      (err: any) => err instanceof AgentValidationError && err.message.includes("tools must contain non-empty strings")
    );

    // Array containing function
    assert.throws(
      () => Agent.rehydrate({ ...base, tools: [() => {}] as any }),
      (err: any) => err instanceof AgentValidationError && err.message.includes("tools cannot contain functions")
    );

    // Array containing non-string
    assert.throws(
      () => Agent.rehydrate({ ...base, tools: [123 as any] }),
      (err: any) => err instanceof AgentValidationError && err.message.includes("tools must contain non-empty strings")
    );
  });

  await t.test("permits valid lifecycle continuation from rehydrated active and inactive states", () => {
    const rehydrated = Agent.rehydrate({
      id: "agent-lifecycle",
      name: "Lifecycle Agent",
      description: "Initial description",
      model: "claude-3-haiku",
      instructions: "Follow instructions",
      tools: ["calc"],
      memoryScope: "custom-scope",
      status: "ACTIVE",
      version: 2,
      createdAt: t0,
      updatedAt: t1,
    });

    const t2 = new Date("2026-03-01T13:00:00.000Z");
    const t3 = new Date("2026-03-01T14:00:00.000Z");
    const t4 = new Date("2026-03-01T15:00:00.000Z");

    // 1. Deactivate
    const deactivated = rehydrated.deactivate(t2);
    assert.equal(deactivated.status, "INACTIVE");
    assert.equal(deactivated.version, 2);
    assert.equal(deactivated.updatedAt.toISOString(), t2.toISOString());
    assert.ok(deactivated instanceof Agent);

    // 2. Reactivate
    const reactivated = deactivated.activate(t3);
    assert.equal(reactivated.status, "ACTIVE");
    assert.equal(reactivated.version, 2);
    assert.equal(reactivated.updatedAt.toISOString(), t3.toISOString());
    assert.ok(reactivated instanceof Agent);

    // 3. Update
    const updated = reactivated.update(
      {
        name: "Renamed Lifecycle Agent",
        tools: ["calc", "search"],
      },
      t4
    );
    assert.equal(updated.name, "Renamed Lifecycle Agent");
    assert.deepEqual(updated.tools, ["calc", "search"]);
    assert.equal(updated.version, 3);
    assert.equal(updated.updatedAt.toISOString(), t4.toISOString());
    assert.ok(updated instanceof Agent);

    // 4. toDefinition produces valid immutable snapshot
    const def = updated.toDefinition();
    assert.equal(def.id, "agent-lifecycle");
    assert.equal(def.name, "Renamed Lifecycle Agent");
    assert.deepEqual(def.tools, ["calc", "search"]);
    assert.deepEqual(def.capabilities, ["reasoning", "calc", "search"]);
    assert.ok(Object.isFrozen(def));
    assert.ok(Object.isFrozen(def.capabilities));
  });

  await t.test("rejects adversarial malformed props payloads", () => {
    for (const badProps of [null, undefined, [], "string", 123, true]) {
      assert.throws(
        () => Agent.rehydrate(badProps as any),
        (err: any) => err instanceof AgentValidationError && err.message.includes("must be a valid non-null object")
      );
    }
  });
});

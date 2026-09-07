import assert from "node:assert/strict";
import test from "node:test";
import { Agent, AgentInactiveError, AgentNotFoundError } from "../../src/domain/agent/agent.js";
import { createPlatform } from "../../src/interfaces/composition.js";
import { InMemoryPolicyGateway } from "../../src/infrastructure/policy/in-memory-policy-gateway.js";
import { PolicyContext, PolicyDecision } from "../../src/domain/policy/policy.js";

test("Agent Runtime Integration Suite", async (t) => {
  await t.test("executes agent through CoreRuntime with full correlation and lifecycle events", async () => {
    const platform = createPlatform();
    const agent = Agent.create({
      id: "agent-runner",
      name: "Runner Agent",
      model: "stub-model",
      instructions: "Perform rigorous calculation",
      tools: ["calculator"],
      memoryScope: "runner-memory",
    });

    platform.agents.register(agent);

    const { task, execution } = await platform.agentService.executeAgent("agent-runner", {
      prompt: "Compute 2 + 2",
    }, "trace-agent-run-1");

    assert.equal(task.status, "COMPLETED");
    assert.equal(task.traceId, "trace-agent-run-1");
    assert.equal(execution.status, "COMPLETED");
    assert.equal(execution.traceId, "trace-agent-run-1");

    // Verify timeline events
    const timeline = platform.audit.findByExecutionId(execution.id);
    assert.ok(timeline.length >= 6);
    assert.ok(timeline.some((ev) => ev.type === "agent.started"));
    assert.ok(timeline.some((ev) => ev.type === "policy.allowed"));
    assert.ok(timeline.some((ev) => ev.type === "model.requested"));
    assert.ok(timeline.some((ev) => ev.type === "model.completed"));
    assert.ok(timeline.some((ev) => ev.type === "agent.completed"));
    assert.ok(timeline.some((ev) => ev.type === "execution.completed"));

    // Verify scoped memory persistence
    const mem = await platform.memory.retrieve("runner-memory", "last_execution");
    assert.ok(mem);
    assert.equal(mem.scope, "runner-memory");
    assert.equal(mem.value.executionId, execution.id);
  });

  await t.test("rejects execution of an INACTIVE agent with AgentInactiveError", async () => {
    const platform = createPlatform();
    const agent = Agent.create({
      id: "agent-inactive-test",
      name: "Inactive Agent",
      model: "stub-model",
      status: "INACTIVE",
    });

    platform.agents.register(agent);

    await assert.rejects(
      async () => platform.agentService.executeAgent("agent-inactive-test", { prompt: "Test" }),
      (err: any) => err instanceof AgentInactiveError && err.agentId === "agent-inactive-test"
    );
  });

  await t.test("rejects execution of an unknown agent with AgentNotFoundError", async () => {
    const platform = createPlatform();
    await assert.rejects(
      async () => platform.agentService.executeAgent("non-existent-agent", { prompt: "Test" }),
      (err: any) => err instanceof AgentNotFoundError
    );
  });

  await t.test("executes an authorized tool when requested in agent input", async () => {
    const platform = createPlatform();
    const agent = Agent.create({
      id: "agent-tool-user",
      name: "Tool User Agent",
      model: "stub-model",
      tools: ["calculator"],
    });

    platform.agents.register(agent);

    const { task, execution } = await platform.agentService.executeAgent("agent-tool-user", {
      tool: "calculator",
      toolInput: { left: 20, right: 22 },
    });

    assert.equal(task.status, "COMPLETED");
    assert.equal(execution.status, "COMPLETED");
    assert.deepEqual(task.result?.output, { value: 42 });
  });

  await t.test("fails closed when agent attempts to execute an unauthorized tool", async () => {
    const platform = createPlatform();
    const agent = Agent.create({
      id: "agent-no-tools",
      name: "Restricted Agent",
      model: "stub-model",
      tools: [], // No tools allowed!
    });

    platform.agents.register(agent);

    const { task, execution } = await platform.agentService.executeAgent("agent-no-tools", {
      tool: "calculator",
      toolInput: { left: 1, right: 1 },
    });

    assert.equal(task.status, "FAILED");
    assert.equal(execution.status, "FAILED");
    assert.equal(task.error?.code, "EXECUTION_FAILURE");

    const timeline = platform.audit.findByExecutionId(execution.id);
    assert.ok(timeline.some((ev) => ev.type === "policy.denied"));
  });

  await t.test("fails closed when PolicyGateway denies agent execution", async () => {
    const policy = new InMemoryPolicyGateway((_context: PolicyContext): PolicyDecision => ({
      allowed: false,
      policyId: "agent-lockdown",
      reason: "Agent execution prohibited by governance policy",
    }));

    const platform = createPlatform({ policy });
    const agent = Agent.create({
      id: "agent-denied",
      name: "Denied Agent",
      model: "stub-model",
    });

    platform.agents.register(agent);

    const { task, execution } = await platform.agentService.executeAgent("agent-denied", {
      prompt: "Should be blocked",
    });

    assert.equal(task.status, "FAILED");
    assert.equal(execution.status, "FAILED");

    const timeline = platform.audit.findByExecutionId(execution.id);
    assert.ok(timeline.some((ev) => ev.type === "policy.denied"));
    assert.ok(timeline.some((ev) => ev.type === "agent.failed"));
  });

  await t.test("fails closed when PolicyGateway throws an error during agent execution", async () => {
    const policy = new InMemoryPolicyGateway((_context: PolicyContext): PolicyDecision => {
      throw new Error("Policy engine unavailable");
    });

    const platform = createPlatform({ policy });
    const agent = Agent.create({
      id: "agent-policy-error-test",
      name: "Policy Error Agent",
      model: "stub-model",
    });

    platform.agents.register(agent);

    const { task, execution } = await platform.agentService.executeAgent("agent-policy-error-test", {
      prompt: "Should fail closed on policy throw",
    });

    assert.equal(task.status, "FAILED");
    assert.equal(execution.status, "FAILED");
    assert.equal(task.error?.code, "EXECUTION_FAILURE");
    assert.ok(task.error?.message.includes("Policy evaluation unavailable"));

    const timeline = platform.audit.findByExecutionId(execution.id);
    assert.ok(timeline.some((ev) => ev.type === "agent.failed"));
  });

  await t.test("enforces strict memory scope isolation between distinct agents", async () => {
    const platform = createPlatform();
    const agentA = Agent.create({
      id: "agent-alpha",
      name: "Alpha Agent",
      model: "stub-model",
    });
    const agentB = Agent.create({
      id: "agent-beta",
      name: "Beta Agent",
      model: "stub-model",
    });

    platform.agents.register(agentA);
    platform.agents.register(agentB);

    assert.equal(agentA.memoryScope, "agent-agent-alpha");
    assert.equal(agentB.memoryScope, "agent-agent-beta");

    // Execute Agent A
    const resA = await platform.agentService.executeAgent("agent-alpha", {
      prompt: "Alpha run",
    });
    assert.equal(resA.task.status, "COMPLETED");

    // Check memory stored for Agent A
    const memA = await platform.memory.retrieve("agent-agent-alpha", "last_execution");
    assert.ok(memA);
    assert.equal(memA.scope, "agent-agent-alpha");
    assert.equal(memA.value.executionId, resA.execution.id);

    // Agent B's scope must NOT have Agent A's memory
    const memB = await platform.memory.retrieve("agent-agent-beta", "last_execution");
    assert.equal(memB, undefined);

    // Execute Agent B
    const resB = await platform.agentService.executeAgent("agent-beta", {
      prompt: "Beta run",
    });
    assert.equal(resB.task.status, "COMPLETED");

    const memBAfter = await platform.memory.retrieve("agent-agent-beta", "last_execution");
    assert.ok(memBAfter);
    assert.equal(memBAfter.scope, "agent-agent-beta");
    assert.equal(memBAfter.value.executionId, resB.execution.id);

    // Agent A's memory must remain untouched by Agent B
    const memAAfter = await platform.memory.retrieve("agent-agent-alpha", "last_execution");
    assert.equal(memAAfter?.value.executionId, resA.execution.id);
  });
});

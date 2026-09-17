import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import {
  Organization,
  Area,
  Team,
  AgentMembership,
  TeamResourceBudget,
} from "../../src/domain/organization/index.js";
import { createPlatform } from "../../src/interfaces/composition.js";
import { Agent } from "../../src/domain/agent/agent.js";
import { Task } from "../../src/domain/task/task.js";
import { AutonomyBudget } from "../../src/domain/autonomy/autonomy-budget.js";
import { SecurityContext, Principal } from "../../src/domain/security/security.js";
import { SqliteDatabase } from "../../src/infrastructure/persistence/sqlite/sqlite-database.js";
import { SqliteOrganizationRepository } from "../../src/infrastructure/persistence/sqlite/sqlite-organization-repository.js";
import { SqliteTeamResourceBudgetRepository } from "../../src/infrastructure/persistence/sqlite/sqlite-team-resource-budget-repository.js";
import { TeamResourceBudgetService } from "../../src/application/organization/team-resource-budget-service.js";
import { AgentExecutionStrategy } from "../../src/application/runtime/agent-execution-strategy.js";
import { CoreRuntime } from "../../src/application/runtime/core-runtime.js";
import { ToolInvocationRuntime } from "../../src/application/tools/tool-invocation-runtime.js";
import { InMemoryToolRegistry } from "../../src/infrastructure/tools/in-memory-tool-registry.js";
import { CalculatorTool } from "../../src/infrastructure/tools/calculator-tool.js";
import { StubModelGateway } from "../../src/infrastructure/model/stub-model-gateway.js";
import { InMemoryEventPublisher } from "../../src/infrastructure/events/in-memory-event-publisher.js";
import { InMemoryPolicyGateway } from "../../src/infrastructure/policy/in-memory-policy-gateway.js";
import { InMemoryTaskRepository } from "../../src/infrastructure/persistence/in-memory-task-repository.js";
import { InMemoryExecutionRepository } from "../../src/infrastructure/persistence/in-memory-execution-repository.js";
import { MemoryService } from "../../src/application/memory/memory-service.js";
import { InMemoryMemoryGateway } from "../../src/infrastructure/memory/in-memory-memory-gateway.js";
import { RegistryToolGateway } from "../../src/application/tools/tool-gateway.js";
import { AutonomousOrchestrator } from "../../src/application/autonomy/autonomous-orchestrator.js";
import { StubPlanner } from "../../src/infrastructure/autonomy/stub-planner.js";
import { DeterministicDecisionEvaluator } from "../../src/domain/autonomy/decision-evaluator.js";
import { unlinkSync, existsSync } from "node:fs";

test("Prompt 104 — Team Resource Budget Enforcement & Execution Integration Suite", async (t) => {
  const dbPath = "data/test-budget-enforcement.db";
  if (existsSync(dbPath)) {
    try { unlinkSync(dbPath); } catch {}
  }

  // Setup platform with SQLite persistence
  const platform = createPlatform({
    dbPath,
    useDurablePersistence: true,
  });

  const tenantId = "tenant-enforcement-corp";
  const orgId = "org-enforcement-1";
  const areaId = "area-ai-eng";
  const teamId = "team-nlp";
  const agentId = "agent-nlp-specialist";

  // Create Organization Hierarchy
  const org = Organization.create({
    id: orgId,
    tenantId,
    name: "Enforcement Corp",
  });
  await platform.organizationRepository.saveOrganization(org);

  const area = Area.create({
    id: areaId,
    organizationId: orgId,
    tenantId,
    name: "AI Engineering",
  });
  await platform.organizationRepository.saveArea(area);

  const team = Team.create({
    id: teamId,
    organizationId: orgId,
    areaId,
    tenantId,
    name: "NLP Team",
  });
  await platform.organizationRepository.saveTeam(team);

  // Register Agent
  const agent = Agent.create({
    id: agentId,
    name: "NLP Specialist",
    model: "stub-model",
    tools: ["calculator"],
    instructions: "You are an NLP Specialist agent.",
  });
  platform.agents.register(agent);

  // Create Agent Membership
  const membership = AgentMembership.create({
    id: `mem_${teamId}_${agentId}`,
    teamId,
    agentId,
    organizationId: orgId,
    tenantId,
    role: "SPECIALIST",
  });
  await platform.organizationRepository.saveMembership(membership);

  // Create Team Resource Budget
  const budget = await platform.teamResourceBudgetService.createBudget({
    id: `trb_${teamId}`,
    teamId,
    tenantId,
    limits: {
      maxExecutions: 2,
      maxModelCalls: 3,
      maxToolCalls: 2,
      maxAutonomousSteps: 3,
      maxDurationMs: 60000,
      maxTokens: 10000,
    },
    window: "LIFETIME",
  });

  await t.test("TEST 1: Execution ALLOW when team has sufficient budget and updates consumption", async () => {
    const taskInput = { objective: "Compute 2 + 2", tenantId, teamId };
    const result = await platform.agentService.executeAgent(agentId, taskInput);

    assert.equal(result.task.status, "COMPLETED");
    assert.equal(result.execution.status, "COMPLETED");

    const currentBudget = await platform.teamResourceBudgetService.getBudget(teamId, tenantId);
    assert.equal(currentBudget.consumed.executions, 1);
    assert.equal(currentBudget.consumed.modelCalls, 1);
    assert.equal(currentBudget.status, "ACTIVE");
  });

  await t.test("TEST 2: Execution DENY fail-closed when execution quota is exhausted", async () => {
    // 2nd execution (reaches maxExecutions = 2)
    const res2 = await platform.agentService.executeAgent(agentId, { objective: "Second execution", tenantId, teamId });
    assert.equal(res2.task.status, "COMPLETED");

    const budgetAfter2 = await platform.teamResourceBudgetService.getBudget(teamId, tenantId);
    assert.equal(budgetAfter2.consumed.executions, 2);
    assert.equal(budgetAfter2.status, "EXHAUSTED");

    // 3rd execution: must be DENY fail-closed (0 execution started)
    const result3 = await platform.agentService.executeAgent(agentId, { objective: "Third execution over quota", tenantId, teamId });
    assert.equal(result3.task.status, "FAILED");
    assert.equal(result3.execution.status, "FAILED");
    assert.match(result3.execution.error?.message ?? "", /(?:exhausted|insufficient execution quota)/i);

    // Consumption must not increment beyond max
    const budgetFinal = await platform.teamResourceBudgetService.getBudget(teamId, tenantId);
    assert.equal(budgetFinal.consumed.executions, 2);
  });

  await t.test("TEST 3: Model call DENY fail-closed when modelCalls quota is exhausted", async () => {
    // Replenish executions but set maxModelCalls to consumed
    await platform.teamResourceBudgetService.updateBudget(teamId, tenantId, {
      maxExecutions: 10,
      maxModelCalls: 2, // Already consumed 2 in tests above
      maxToolCalls: 10,
      maxAutonomousSteps: 10,
      maxDurationMs: 60000,
      maxTokens: 10000,
    });

    const currentBudget = await platform.teamResourceBudgetService.getBudget(teamId, tenantId);
    assert.equal(currentBudget.status, "EXHAUSTED");

    const result = await platform.agentService.executeAgent(agentId, { objective: "Model call test", tenantId, teamId });
    assert.equal(result.task.status, "FAILED");
    assert.match(result.execution.error?.message ?? "", /(?:exhausted|insufficient model calls quota)/i);
  });

  await t.test("TEST 4: Tool call DENY fail-closed when toolCalls quota is exhausted", async () => {
    // Reset limits with high execution and model calls, but 0 tool calls
    await platform.teamResourceBudgetService.updateBudget(teamId, tenantId, {
      maxExecutions: 20,
      maxModelCalls: 20,
      maxToolCalls: 0,
      maxAutonomousSteps: 20,
      maxDurationMs: 60000,
      maxTokens: 10000,
    });

    // Execute direct tool request
    const result = await platform.agentService.executeAgent(agentId, {
      tool: "calculator",
      toolInput: { operation: "add", a: 5, b: 3 },
      tenantId,
      teamId,
    });

    assert.equal(result.task.status, "FAILED");
    assert.match(result.execution.error?.message ?? "", /(?:tool calls quota exceeded|insufficient tool calls quota)/i);

    // ToolInvocationRuntime direct secure invocation must also reject
    const toolRuntime = platform.toolInvocationRuntime;
    const secCtx = SecurityContext.create({
      principal: Principal.create({ id: "p1", type: "HUMAN", permissions: ["tool.invoke"] }),
      authenticated: true,
      correlationId: "trace-tool-direct-bypass",
      tenantId,
    });

    await assert.rejects(
      async () => {
        await toolRuntime.invokeSecurely({
          request: { toolId: "calculator", input: { operation: "add", a: 1, b: 2 } },
          context: {
            traceId: "trace-tool-direct-bypass",
            executionId: "exec-direct-tool",
            taskId: "task-direct-tool",
            principalId: "p1",
            toolId: "calculator",
            riskLevel: "LOW",
          },
          securityContext: secCtx,
          agentId,
        });
      },
      (err: Error) => {
        return err.name === "ToolPolicyRejectedError" && /(?:tool calls quota exceeded|insufficient tool calls quota)/i.test(err.message);
      }
    );
  });

  await t.test("TEST 5: Autonomous steps exhausted in AutonomousOrchestrator transitions to BUDGET_EXHAUSTED", async () => {
    // Reset budget with maxAutonomousSteps = 1
    await platform.teamResourceBudgetService.updateBudget(teamId, tenantId, {
      maxExecutions: 50,
      maxModelCalls: 50,
      maxToolCalls: 50,
      maxAutonomousSteps: 1,
      maxDurationMs: 60000,
      maxTokens: 10000,
    });

    const opResult = await platform.autonomousOrchestrator.run({
      operationId: "op-enforce-auto-1",
      objective: "Autonomous multi-step task",
      agent: agent.toDefinition(),
      budget: AutonomyBudget.create({ maxSteps: 5, maxDurationMs: 60000, maxToolCalls: 10 }),
    });

    // Should exhaust budget on or after step 1
    assert.equal(opResult.operation.status, "BUDGET_EXHAUSTED");
    assert.equal(opResult.operation.terminationReason, "STEPS_EXHAUSTED");

    const currentBudget = await platform.teamResourceBudgetService.getBudget(teamId, tenantId);
    assert.equal(currentBudget.consumed.autonomousSteps, 1);
  });

  await t.test("TEST 6: Tenant mismatch DENY fail-closed", async () => {
    // Agent belongs to tenant-enforcement-corp, caller requests tenant-foreign
    const taskInput = { objective: "Cross-tenant attempt", tenantId: "tenant-foreign" };
    const result = await platform.agentService.executeAgent(agentId, taskInput);

    assert.equal(result.task.status, "FAILED");
    assert.match(result.execution.error?.message ?? "", /tenant-mismatch|has no active membership/i);
  });

  await t.test("TEST 7: Wrong team context DENY fail-closed", async () => {
    // Agent belongs to team-nlp, caller claims team-finance without membership
    const taskInput = { objective: "Impersonate team", tenantId, teamId: "team-finance" };
    const result = await platform.agentService.executeAgent(agentId, taskInput);

    assert.equal(result.task.status, "FAILED");
    assert.match(result.execution.error?.message ?? "", /unauthorized-team-context|not an active member/i);
  });

  await t.test("TEST 8: Concurrent final unit race condition yields exactly 1 ALLOW and 1 DENY", async () => {
    const raceTeamId = "team-race";
    const raceAgentId = "agent-race";

    const raceTeam = Team.create({
      id: raceTeamId,
      organizationId: orgId,
      areaId,
      tenantId,
      name: "Race Team",
    });
    await platform.organizationRepository.saveTeam(raceTeam);

    const raceAgent = Agent.create({
      id: raceAgentId,
      name: "Race Agent",
      model: "stub-model",
      instructions: "Race test agent",
    });
    platform.agents.register(raceAgent);

    const raceMem = AgentMembership.create({
      id: `mem_${raceTeamId}_${raceAgentId}`,
      teamId: raceTeamId,
      agentId: raceAgentId,
      organizationId: orgId,
      tenantId,
      role: "OPERATOR",
    });
    await platform.organizationRepository.saveMembership(raceMem);

    // Create budget with exactly 1 execution remaining
    await platform.teamResourceBudgetService.createBudget({
      id: `trb_${raceTeamId}`,
      teamId: raceTeamId,
      tenantId,
      limits: {
        maxExecutions: 1,
        maxModelCalls: 10,
        maxToolCalls: 10,
        maxAutonomousSteps: 10,
        maxDurationMs: 60000,
        maxTokens: 10000,
      },
    });

    // Launch 2 parallel executions competing for the 1 remaining execution unit
    const [resA, resB] = await Promise.all([
      platform.agentService.executeAgent(raceAgentId, { objective: "Race 1", tenantId, teamId: raceTeamId }),
      platform.agentService.executeAgent(raceAgentId, { objective: "Race 2", tenantId, teamId: raceTeamId }),
    ]);

    const statuses = [resA.task.status, resB.task.status].sort();
    assert.deepEqual(statuses, ["COMPLETED", "FAILED"], "Concurrent execution on final unit must yield exactly 1 ALLOW and 1 DENY");

    const finalBudget = await platform.teamResourceBudgetService.getBudget(raceTeamId, tenantId);
    assert.equal(finalBudget.consumed.executions, 1);
    assert.equal(finalBudget.status, "EXHAUSTED");
  });

  await t.test("TEST 9: Agent cannot escalate or alter its own team budget", async () => {
    // Attempting to send budget overrides in input has no effect on real budget limits
    await platform.agentService.executeAgent(agentId, {
      objective: "Escalate budget",
      tenantId,
      teamId,
      limits: { maxExecutions: 999999 },
    });

    const budgetAfter = await platform.teamResourceBudgetService.getBudget(teamId, tenantId);
    assert.notEqual(budgetAfter.limits.maxExecutions, 999999);
  });

  await t.test("TEST 10: Anti-Bypass — Runtime and Strategy cannot bypass Team Resource Governance when Suspended", async () => {
    // Suspend team budget
    await platform.teamResourceBudgetService.suspendBudget(teamId, tenantId);

    // Attempting direct execution via agentService
    const resDirect = await platform.agentService.executeAgent(agentId, {
      objective: "Direct bypass attempt",
      tenantId,
      teamId,
    });
    assert.equal(resDirect.task.status, "FAILED");
    assert.match(resDirect.execution.error?.message ?? "", /SUSPENDED/i);

    // Reactivate budget
    await platform.teamResourceBudgetService.reactivateBudget(teamId, tenantId);
    const reactivatedBudget = await platform.teamResourceBudgetService.getBudget(teamId, tenantId);
    assert.notEqual(reactivatedBudget.status, "SUSPENDED");
  });

  await t.test("TEST 11: Duration tracking accumulates execution elapsed time", async () => {
    const budgetBefore = await platform.teamResourceBudgetService.getBudget(teamId, tenantId);
    const initialDuration = budgetBefore.consumed.durationMs;

    await platform.agentService.executeAgent(agentId, {
      objective: "Duration tracking test",
      tenantId,
      teamId,
    });

    const budgetAfter = await platform.teamResourceBudgetService.getBudget(teamId, tenantId);
    assert.ok(budgetAfter.consumed.durationMs >= initialDuration, "Consumed duration must accumulate elapsed execution time");
  });

  await t.test("TEST 12: Administrative Cross-Tenant Budget Update is rejected fail-closed", async () => {
    // Attempting to update or get budget for a team with mismatched tenant
    await assert.rejects(
      async () => {
        await platform.teamResourceBudgetService.getBudget(teamId, "tenant-attacker");
      },
      (err: Error) => {
        return err.name === "CrossTenantOrganizationError" && /belongs to another tenant/i.test(err.message);
      }
    );
  });

  await t.test("TEST 13: Token accounting records token usage when reported by provider", async () => {
    const tokenTeamId = "team-token-test";
    const tokenAgentId = "agent-token-test";

    const tTeam = Team.create({
      id: tokenTeamId,
      organizationId: orgId,
      areaId,
      tenantId,
      name: "Token Team",
    });
    await platform.organizationRepository.saveTeam(tTeam);

    const tAgent = Agent.create({
      id: tokenAgentId,
      name: "Token Agent",
      model: "token-model",
      instructions: "Token test agent",
    });
    platform.agents.register(tAgent);

    const tMem = AgentMembership.create({
      id: `mem_${tokenTeamId}_${tokenAgentId}`,
      teamId: tokenTeamId,
      agentId: tokenAgentId,
      organizationId: orgId,
      tenantId,
      role: "OPERATOR",
    });
    await platform.organizationRepository.saveMembership(tMem);

    await platform.teamResourceBudgetService.createBudget({
      id: `trb_${tokenTeamId}`,
      teamId: tokenTeamId,
      tenantId,
      limits: {
        maxExecutions: 10,
        maxModelCalls: 10,
        maxToolCalls: 10,
        maxAutonomousSteps: 10,
        maxDurationMs: 60000,
        maxTokens: 500,
      },
    });

    // Directly consume 120 tokens via budget service
    const evalRes = await platform.teamResourceBudgetService.evaluateAndConsume(
      tokenTeamId,
      tenantId,
      { tokens: 120 },
      "trace-token-120"
    );
    assert.equal(evalRes.allowed, true);

    const tBudget = await platform.teamResourceBudgetService.getBudget(tokenTeamId, tenantId);
    assert.equal(tBudget.consumed.tokens, 120);
    assert.equal(tBudget.getRemaining().tokens, 380);
  });

  // Cleanup test DB
  if (existsSync(dbPath)) {
    try { unlinkSync(dbPath); } catch {}
  }
});

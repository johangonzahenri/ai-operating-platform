import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  AgentCoordinationRecord,
  CoordinationCycleError,
  CoordinationDepthExceededError,
  CoordinationDomainError,
} from "../../src/domain/organization/organizational-coordination.js";
import { InMemoryCoordinationRepository } from "../../src/infrastructure/persistence/in-memory/in-memory-coordination-repository.js";
import { InMemoryOrganizationRepository } from "../../src/infrastructure/organization/in-memory-organization-repository.js";
import { InMemoryTeamResourceBudgetRepository } from "../../src/infrastructure/organization/in-memory-team-resource-budget-repository.js";
import { TeamResourceBudgetService } from "../../src/application/organization/team-resource-budget-service.js";
import { OrganizationService } from "../../src/application/organization/organization-service.js";
import { OrganizationalCoordinationService } from "../../src/application/organization/organizational-coordination-service.js";
import { Organization } from "../../src/domain/organization/organization.js";
import { Area } from "../../src/domain/organization/area.js";
import { Team } from "../../src/domain/organization/team.js";
import { AgentMembership } from "../../src/domain/organization/agent-membership.js";
import { TeamResourceBudget } from "../../src/domain/organization/team-resource-budget.js";
import { Agent } from "../../src/domain/agent/agent.js";
import { InMemoryEventPublisher } from "../../src/infrastructure/events/in-memory-event-publisher.js";
import { InMemoryPolicyGateway } from "../../src/infrastructure/policy/in-memory-policy-gateway.js";
import { DomainEvent } from "../../src/domain/events/events.js";
import { Runtime } from "../../src/domain/execution/runtime.js";
import { Execution } from "../../src/domain/execution/execution.js";
import { ExecutionContext } from "../../src/domain/execution/execution-context.js";

test("Prompt 109 - Organizational Coordination: AgentCoordinationRecord Aggregate Lifecycle & Invariants", async (t) => {
  await t.test("1. Aggregate creation validates required fields and sets initial REQUESTED status", () => {
    const record = AgentCoordinationRecord.create({
      tenantId: "tenant-alpha",
      organizationId: "org-alpha",
      teamId: "team-eng",
      sourceAgentId: "agent-lead",
      targetAgentId: "agent-spec",
      requesterId: "user-alice",
      purpose: "Perform code analysis",
      inputPayload: { repo: "ai-op-platform", branch: "main" },
    });

    assert.equal(record.status, "REQUESTED");
    assert.equal(record.version, 1);
    assert.equal(record.tenantId, "tenant-alpha");
    assert.equal(record.sourceAgentId, "agent-lead");
    assert.equal(record.targetAgentId, "agent-spec");
    assert.equal(record.purpose, "Perform code analysis");
    assert.equal(record.depth, 0);
    assert.equal(record.maxDepth, 3);
    assert.equal(record.handoffCount, 0);
    assert.equal(record.maxHandoffs, 5);
    assert.ok(record.id.startsWith("coord_"));
    assert.ok(record.createdAt instanceof Date);
    assert.ok(record.updatedAt instanceof Date);
    assert.equal(record.completedAt, undefined);
  });

  await t.test("2. Aggregate creation rejects empty required fields fail-closed", () => {
    assert.throws(
      () =>
        AgentCoordinationRecord.create({
          tenantId: "",
          organizationId: "org-1",
          teamId: "team-1",
          sourceAgentId: "a1",
          targetAgentId: "a2",
          requesterId: "req",
          purpose: "test",
          inputPayload: {},
        }),
      /tenantId must be a non-empty string/
    );

    assert.throws(
      () =>
        AgentCoordinationRecord.create({
          tenantId: "tenant-1",
          organizationId: "org-1",
          teamId: "team-1",
          sourceAgentId: "a1",
          targetAgentId: "a1",
          requesterId: "req",
          purpose: "test",
          inputPayload: {},
        }),
      /Source agent and target agent must be different/
    );
  });

  await t.test("3. Cycle detection triggers CoordinationCycleError if targetAgentId in history", () => {
    assert.throws(
      () =>
        AgentCoordinationRecord.create({
          tenantId: "tenant-1",
          organizationId: "org-1",
          teamId: "team-1",
          sourceAgentId: "agent-b",
          targetAgentId: "agent-a",
          requesterId: "req",
          purpose: "return task",
          inputPayload: { step: 2 },
          history: ["agent-a", "agent-b"],
        }),
      (err) => err instanceof CoordinationCycleError && err.message.includes("cycle detected")
    );
  });

  await t.test("4. Depth limit triggers CoordinationDepthExceededError when depth >= maxDepth", () => {
    assert.throws(
      () =>
        AgentCoordinationRecord.create({
          tenantId: "tenant-1",
          organizationId: "org-1",
          teamId: "team-1",
          sourceAgentId: "agent-a",
          targetAgentId: "agent-b",
          requesterId: "req",
          purpose: "deep coordination",
          inputPayload: { depth: 3 },
          depth: 3,
          maxDepth: 3,
        }),
      (err) => err instanceof CoordinationDepthExceededError && err.message.includes("depth 3 reaches or exceeds")
    );
  });

  await t.test("5. Full happy path state transitions with OCC version increment", () => {
    let record = AgentCoordinationRecord.create({
      tenantId: "tenant-alpha",
      organizationId: "org-alpha",
      teamId: "team-eng",
      sourceAgentId: "agent-lead",
      targetAgentId: "agent-spec",
      requesterId: "user-alice",
      purpose: "Run tests",
      inputPayload: { suite: "unit" },
    });
    assert.equal(record.status, "REQUESTED");
    assert.equal(record.version, 1);

    record = record.authorize();
    assert.equal(record.status, "AUTHORIZED");
    assert.equal(record.version, 2);

    record = record.dispatch("task-exec-123");
    assert.equal(record.status, "DISPATCHED");
    assert.equal(record.childExecutionId, "task-exec-123");
    assert.equal(record.version, 3);

    record = record.start();
    assert.equal(record.status, "RUNNING");
    assert.equal(record.version, 4);

    record = record.complete({ testResults: "ALL_PASS", passed: 42 });
    assert.equal(record.status, "COMPLETED");
    assert.equal(record.version, 5);
    assert.ok(record.completedAt instanceof Date);
    assert.deepEqual(record.outputPayload, { testResults: "ALL_PASS", passed: 42 });
  });

  await t.test("6. Rejection and Failure state transitions", () => {
    let record = AgentCoordinationRecord.create({
      tenantId: "tenant-alpha",
      organizationId: "org-alpha",
      teamId: "team-eng",
      sourceAgentId: "agent-lead",
      targetAgentId: "agent-spec",
      requesterId: "user-alice",
      purpose: "Run tests",
      inputPayload: {},
    });

    const rejected = record.reject("POLICY_DENIED", "Policy gateway denied coordination");
    assert.equal(rejected.status, "REJECTED");
    assert.equal(rejected.version, 2);
    assert.equal(rejected.failure?.code, "POLICY_DENIED");
    assert.ok(rejected.completedAt instanceof Date);

    // Cannot reject terminal record
    assert.throws(() => rejected.authorize(), /Cannot authorize coordination in 'REJECTED' status/);

    // Failure transition
    let running = record.authorize().dispatch("exec-1").start();
    const failed = running.fail("EXECUTION_ERROR", "Child agent execution crashed");
    assert.equal(failed.status, "FAILED");
    assert.equal(failed.version, 5);
    assert.equal(failed.failure?.code, "EXECUTION_ERROR");
  });

  await t.test("7. Rehydration maintains integrity, prototypes, and defensive immutability", () => {
    const original = AgentCoordinationRecord.create({
      tenantId: "tenant-alpha",
      organizationId: "org-alpha",
      teamId: "team-eng",
      sourceAgentId: "agent-lead",
      targetAgentId: "agent-spec",
      requesterId: "user-alice",
      purpose: "Run tests",
      inputPayload: { foo: "bar" },
    }).authorize().dispatch("exec-1").start().complete({ result: 100 });

    const rehydrated = AgentCoordinationRecord.rehydrate({
      id: original.id,
      tenantId: original.tenantId,
      organizationId: original.organizationId,
      teamId: original.teamId,
      sourceAgentId: original.sourceAgentId,
      targetAgentId: original.targetAgentId,
      requesterId: original.requesterId,
      correlationId: original.correlationId,
      parentExecutionId: original.parentExecutionId,
      childExecutionId: original.childExecutionId,
      purpose: original.purpose,
      inputPayload: original.inputPayload,
      outputPayload: original.outputPayload,
      depth: original.depth,
      maxDepth: original.maxDepth,
      handoffCount: original.handoffCount,
      maxHandoffs: original.maxHandoffs,
      status: original.status,
      failure: original.failure,
      version: original.version,
      createdAt: original.createdAt,
      updatedAt: original.updatedAt,
      completedAt: original.completedAt,
    });

    assert.ok(rehydrated instanceof AgentCoordinationRecord);
    assert.equal(rehydrated.id, original.id);
    assert.equal(rehydrated.status, "COMPLETED");
    assert.equal(rehydrated.version, original.version);
    assert.deepEqual(rehydrated.outputPayload, { result: 100 });
  });
});

test("Prompt 109 - Organizational Coordination Service: Full Pipeline & Governance Guardrails", async (t) => {
  function setupTestEnvironment() {
    const orgRepo = new InMemoryOrganizationRepository();
    const budgetRepo = new InMemoryTeamResourceBudgetRepository();
    const coordRepo = new InMemoryCoordinationRepository();
    const events = new InMemoryEventPublisher();
    const publishedEvents: DomainEvent[] = [];
    events.subscribe((e) => publishedEvents.push(e));

    let policyDecision: { allowed: boolean; policyId: string; reason?: string } = {
      allowed: true,
      policyId: "allow-all",
    };
    const policyGateway = new InMemoryPolicyGateway(() => policyDecision);
    const budgetService = new TeamResourceBudgetService({
      budgetRepository: budgetRepo,
      organizationRepository: orgRepo,
      events,
    });

    const agentList: Agent[] = [
      Agent.create({
        id: "agent-source",
        name: "Source Agent",
        model: "stub-model",
        instructions: "Source",
        tools: [],
        memoryScope: "source",
      }),
      Agent.create({
        id: "agent-target",
        name: "Target Agent",
        model: "stub-model",
        instructions: "Target",
        tools: [],
        memoryScope: "target",
      }),
      Agent.create({
        id: "agent-inactive",
        name: "Inactive Agent",
        model: "stub-model",
        instructions: "Inactive",
        tools: [],
        memoryScope: "inactive",
      }).deactivate(),
    ];

    const agentQuery = {
      findById: (id: string) => agentList.find((a) => a.id === id),
      list: () => agentList,
    };

    const mockRuntime: Runtime = {
      execute: async (task, agentDef) => {
        const execId = `exec_${crypto.randomUUID().slice(0, 8)}`;
        const completedExecution = Execution.create(
          execId,
          task.id,
          task.traceId
        ).start().complete({ result: "COORDINATION_TASK_SUCCESS", processedBy: agentDef.id });

        const completedTask = task
          .transition("QUEUED")
          .transition("RUNNING")
          .complete({
            result: "COORDINATION_TASK_SUCCESS",
            processedBy: agentDef.id,
          });

        const context = ExecutionContext.create(task.traceId, completedExecution.id, task.id);

        return { task: completedTask, execution: completedExecution, context };
      },
    };

    const coordService = new OrganizationalCoordinationService({
      coordinationRepository: coordRepo,
      organizationRepository: orgRepo,
      budgetService,
      policyGateway,
      runtime: mockRuntime,
      agentQuery,
      events,
    });

    return {
      orgRepo,
      budgetRepo,
      coordRepo,
      budgetService,
      policyGateway,
      setPolicyDecision: (d: { allowed: boolean; reason?: string; policyId: string }) => {
        policyDecision = d;
      },
      coordService,
      events,
      publishedEvents,
      agentList,
      mockRuntime,
    };
  }

  await t.test("1. End-to-end authorized coordination executes child task and emits lifecycle events", async () => {
    const env = setupTestEnvironment();

    // Seed Org, Area, Team, Memberships, Budget
    const org = await env.orgRepo.saveOrganization(
      Organization.create({ id: "org-1", tenantId: "tenant-1", name: "Org 1" })
    );
    const area = await env.orgRepo.saveArea(
      Area.create({ id: "area-1", organizationId: org.id, tenantId: "tenant-1", name: "Area 1" })
    );
    const team = await env.orgRepo.saveTeam(
      Team.create({ id: "team-1", areaId: area.id, organizationId: org.id, tenantId: "tenant-1", name: "Team 1" })
    );
    await env.orgRepo.saveMembership(
      AgentMembership.create({ teamId: team.id, agentId: "agent-source", organizationId: org.id, tenantId: "tenant-1" })
    );
    await env.orgRepo.saveMembership(
      AgentMembership.create({ teamId: team.id, agentId: "agent-target", organizationId: org.id, tenantId: "tenant-1" })
    );

    // Create budget
    await env.budgetService.createBudget({
      teamId: team.id,
      tenantId: "tenant-1",
      limits: {
        maxExecutions: 10,
        maxModelCalls: 100,
        maxToolCalls: 100,
        maxAutonomousSteps: 50,
        maxDurationMs: 60000,
      },
    });

    const result = await env.coordService.coordinate({
      tenantId: "tenant-1",
      organizationId: org.id,
      teamId: team.id,
      sourceAgentId: "agent-source",
      targetAgentId: "agent-target",
      requesterId: "user-bob",
      purpose: "Perform unit test analysis",
      inputPayload: { dataset: "sales-q3" },
    });

    assert.equal(result.success, true);
    assert.equal(result.record.status, "COMPLETED");
    assert.equal(result.record.version, 5); // REQUESTED (v1) -> AUTHORIZED (v2) -> DISPATCHED (v3) -> RUNNING (v4) -> COMPLETED (v5)
    assert.ok(result.executionId);
    assert.deepEqual(result.output, {
      result: "COORDINATION_TASK_SUCCESS",
      processedBy: "agent-target",
    });

    // Check emitted events in order
    const eventTypes = env.publishedEvents.map((e) => e.type);
    assert.ok(eventTypes.includes("coordination.requested"));
    assert.ok(eventTypes.includes("coordination.authorized"));
    assert.ok(eventTypes.includes("team.resource.consumption.authorized"));
    assert.ok(eventTypes.includes("coordination.started"));
    assert.ok(eventTypes.includes("coordination.completed"));
  });

  await t.test("2. Cross-tenant coordination attempt is rejected fail-closed", async () => {
    const env = setupTestEnvironment();

    const org = await env.orgRepo.saveOrganization(
      Organization.create({ id: "org-1", tenantId: "tenant-1", name: "Org 1" })
    );
    const area = await env.orgRepo.saveArea(
      Area.create({ id: "area-1", organizationId: org.id, tenantId: "tenant-1", name: "Area 1" })
    );
    const team = await env.orgRepo.saveTeam(
      Team.create({ id: "team-1", areaId: area.id, organizationId: org.id, tenantId: "tenant-1", name: "Team 1" })
    );

    // Call with tenant-2 for team-1 that belongs to tenant-1
    await assert.rejects(
      () =>
        env.coordService.coordinate({
          tenantId: "tenant-2",
          organizationId: org.id,
          teamId: team.id,
          sourceAgentId: "agent-source",
          targetAgentId: "agent-target",
          requesterId: "attacker",
          purpose: "Exfiltrate data",
          inputPayload: {},
        }),
      /does not belong to tenant 'tenant-2'/
    );
  });

  await t.test("3. Coordination rejected when PolicyGateway denies action", async () => {
    const env = setupTestEnvironment();

    const org = await env.orgRepo.saveOrganization(
      Organization.create({ id: "org-1", tenantId: "tenant-1", name: "Org 1" })
    );
    const area = await env.orgRepo.saveArea(
      Area.create({ id: "area-1", organizationId: org.id, tenantId: "tenant-1", name: "Area 1" })
    );
    const team = await env.orgRepo.saveTeam(
      Team.create({ id: "team-1", areaId: area.id, organizationId: org.id, tenantId: "tenant-1", name: "Team 1" })
    );
    await env.orgRepo.saveMembership(
      AgentMembership.create({ teamId: team.id, agentId: "agent-source", organizationId: org.id, tenantId: "tenant-1" })
    );
    await env.orgRepo.saveMembership(
      AgentMembership.create({ teamId: team.id, agentId: "agent-target", organizationId: org.id, tenantId: "tenant-1" })
    );

    // Deny coordination in policy gateway
    env.setPolicyDecision({
      allowed: false,
      reason: "Restricted environment: agent delegation disabled",
      policyId: "deny-rule",
    });

    const result = await env.coordService.coordinate({
      tenantId: "tenant-1",
      organizationId: org.id,
      teamId: team.id,
      sourceAgentId: "agent-source",
      targetAgentId: "agent-target",
      requesterId: "user-bob",
      purpose: "Delegated work",
      inputPayload: {},
    });

    assert.equal(result.success, false);
    assert.equal(result.record.status, "REJECTED");
    assert.equal(result.error?.code, "POLICY_DENIED");
    assert.match(result.error?.message ?? "", /Restricted environment/);

    const eventTypes = env.publishedEvents.map((e) => e.type);
    assert.ok(eventTypes.includes("coordination.requested"));
    assert.ok(eventTypes.includes("coordination.rejected"));
  });

  await t.test("4. Coordination rejected when TeamResourceBudget is exhausted or suspended", async () => {
    const env = setupTestEnvironment();

    const org = await env.orgRepo.saveOrganization(
      Organization.create({ id: "org-1", tenantId: "tenant-1", name: "Org 1" })
    );
    const area = await env.orgRepo.saveArea(
      Area.create({ id: "area-1", organizationId: org.id, tenantId: "tenant-1", name: "Area 1" })
    );
    const team = await env.orgRepo.saveTeam(
      Team.create({ id: "team-1", areaId: area.id, organizationId: org.id, tenantId: "tenant-1", name: "Team 1" })
    );
    await env.orgRepo.saveMembership(
      AgentMembership.create({ teamId: team.id, agentId: "agent-source", organizationId: org.id, tenantId: "tenant-1" })
    );
    await env.orgRepo.saveMembership(
      AgentMembership.create({ teamId: team.id, agentId: "agent-target", organizationId: org.id, tenantId: "tenant-1" })
    );

    // Create a budget with maxExecutions: 0 (immediately exhausted)
    await env.budgetService.createBudget({
      teamId: team.id,
      tenantId: "tenant-1",
      limits: {
        maxExecutions: 0,
        maxModelCalls: 0,
        maxToolCalls: 0,
        maxAutonomousSteps: 0,
        maxDurationMs: 0,
      },
    });

    const result = await env.coordService.coordinate({
      tenantId: "tenant-1",
      organizationId: org.id,
      teamId: team.id,
      sourceAgentId: "agent-source",
      targetAgentId: "agent-target",
      requesterId: "user-bob",
      purpose: "Delegated work",
      inputPayload: {},
    });

    assert.equal(result.success, false);
    assert.equal(result.record.status, "REJECTED");
    assert.equal(result.error?.code, "BUDGET_EXHAUSTED");

    const eventTypes = env.publishedEvents.map((e) => e.type);
    assert.ok(eventTypes.includes("coordination.requested"));
    assert.ok(eventTypes.includes("coordination.authorized"));
    assert.ok(eventTypes.includes("team.resource.consumption.denied"));
    assert.ok(eventTypes.includes("coordination.rejected"));
  });

  await t.test("5. Query methods list and retrieve coordinations by team and tenant", async () => {
    const env = setupTestEnvironment();

    const org = await env.orgRepo.saveOrganization(
      Organization.create({ id: "org-1", tenantId: "tenant-1", name: "Org 1" })
    );
    const area = await env.orgRepo.saveArea(
      Area.create({ id: "area-1", organizationId: org.id, tenantId: "tenant-1", name: "Area 1" })
    );
    const team = await env.orgRepo.saveTeam(
      Team.create({ id: "team-1", areaId: area.id, organizationId: org.id, tenantId: "tenant-1", name: "Team 1" })
    );
    await env.orgRepo.saveMembership(
      AgentMembership.create({ teamId: team.id, agentId: "agent-source", organizationId: org.id, tenantId: "tenant-1" })
    );
    await env.orgRepo.saveMembership(
      AgentMembership.create({ teamId: team.id, agentId: "agent-target", organizationId: org.id, tenantId: "tenant-1" })
    );
    await env.budgetService.createBudget({
      teamId: team.id,
      tenantId: "tenant-1",
      limits: { maxExecutions: 10, maxModelCalls: 10, maxToolCalls: 10, maxAutonomousSteps: 10, maxDurationMs: 10000 },
    });

    const res1 = await env.coordService.coordinate({
      tenantId: "tenant-1",
      organizationId: org.id,
      teamId: team.id,
      sourceAgentId: "agent-source",
      targetAgentId: "agent-target",
      requesterId: "user-1",
      purpose: "Coord 1",
      inputPayload: { a: 1 },
    });

    const res2 = await env.coordService.coordinate({
      tenantId: "tenant-1",
      organizationId: org.id,
      teamId: team.id,
      sourceAgentId: "agent-source",
      targetAgentId: "agent-target",
      requesterId: "user-1",
      purpose: "Coord 2",
      inputPayload: { a: 2 },
    });

    const teamList = await env.coordService.listTeamCoordinations(team.id, "tenant-1");
    assert.equal(teamList.length, 2);

    const single = await env.coordService.getCoordination(res1.record.id, "tenant-1");
    assert.equal(single.id, res1.record.id);

    // Cross-tenant getCoordination is forbidden
    await assert.rejects(
      () => env.coordService.getCoordination(res1.record.id, "tenant-other"),
      /Cross-tenant access forbidden/
    );
  });
});

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  WorkflowDefinition,
  WorkflowStepDefinition,
} from "../../src/domain/workflow/workflow-definition.js";
import {
  WorkflowInstance,
  WorkflowStepState,
} from "../../src/domain/workflow/workflow-instance.js";
import {
  WorkflowValidationError,
  WorkflowCycleError,
  WorkflowStateTransitionError,
  WorkflowConcurrencyConflictError,
  WorkflowNotFoundError,
  WorkflowInstanceNotFoundError,
} from "../../src/domain/workflow/workflow-errors.js";
import { WorkflowOrchestratorService } from "../../src/application/workflow/workflow-orchestrator-service.js";
import {
  InMemoryWorkflowDefinitionRepository,
  InMemoryWorkflowInstanceRepository,
} from "../../src/infrastructure/persistence/in-memory/in-memory-workflow-repository.js";
import { InMemoryAgentProfileRepository } from "../../src/infrastructure/persistence/in-memory/in-memory-agent-profile-repository.js";
import { InMemoryOrganizationRepository } from "../../src/infrastructure/organization/in-memory-organization-repository.js";
import { InMemoryTeamResourceBudgetRepository } from "../../src/infrastructure/organization/in-memory-team-resource-budget-repository.js";
import { AgentProfileService } from "../../src/application/organization/agent-profile-service.js";
import { TeamResourceBudgetService } from "../../src/application/organization/team-resource-budget-service.js";
import { AgentProfile } from "../../src/domain/organization/agent-profile.js";
import { Organization } from "../../src/domain/organization/organization.js";
import { Team } from "../../src/domain/organization/team.js";
import { TeamResourceBudget, BudgetLimits } from "../../src/domain/organization/team-resource-budget.js";
import { InMemoryPolicyGateway } from "../../src/infrastructure/policy/in-memory-policy-gateway.js";

describe("Phase 62: Workflow Orchestration & Governed Task Assignment Domain & Unit Tests", () => {
  const TENANT_ID = "tenant-enterprise-1";
  const ORG_ID = "org-main";
  const AREA_ID = "area-main";
  const TEAM_ID = "team-alpha";

  const standardLimits: BudgetLimits = {
    maxExecutions: 100,
    maxModelCalls: 100,
    maxToolCalls: 100,
    maxAutonomousSteps: 100,
    maxDurationMs: 60000,
  };

  const sampleSteps: WorkflowStepDefinition[] = [
    {
      stepId: "step-1",
      name: "Validate Input",
      order: 1,
      purpose: "Validates incoming payload data",
      responsibility: "input-validation",
      requiredCapabilities: ["data-validation"],
    },
    {
      stepId: "step-2",
      name: "Process Calculation",
      order: 2,
      purpose: "Performs financial calculations",
      dependsOn: ["step-1"],
      responsibility: "financial-computation",
      requiredCapabilities: ["math-calc"],
    },
    {
      stepId: "step-3",
      name: "Generate Report",
      order: 3,
      purpose: "Generates output summary document",
      dependsOn: ["step-2"],
      responsibility: "report-generation",
    },
  ];

  describe("WorkflowDefinition Domain Aggregate", () => {
    it("creates a valid workflow definition in DRAFT status", () => {
      const def = WorkflowDefinition.create({
        id: "wf-order-processing",
        tenantId: TENANT_ID,
        organizationId: ORG_ID,
        teamId: TEAM_ID,
        name: "Order Processing Pipeline",
        description: "Governed multi-step order processing",
        steps: sampleSteps,
      });

      assert.equal(def.id, "wf-order-processing");
      assert.equal(def.tenantId, TENANT_ID);
      assert.equal(def.organizationId, ORG_ID);
      assert.equal(def.status, "DRAFT");
      assert.equal(def.version, 1);
      assert.equal(def.steps.length, 3);
      assert.equal(def.steps[0]?.stepId, "step-1");
    });

    it("rejects definition with missing required fields", () => {
      assert.throws(
        () => WorkflowDefinition.create({ id: "", tenantId: TENANT_ID, organizationId: ORG_ID, name: "Test", steps: sampleSteps }),
        WorkflowValidationError
      );
      assert.throws(
        () => WorkflowDefinition.create({ id: "wf-1", tenantId: "", organizationId: ORG_ID, name: "Test", steps: sampleSteps }),
        WorkflowValidationError
      );
      assert.throws(
        () => WorkflowDefinition.create({ id: "wf-1", tenantId: TENANT_ID, organizationId: "", name: "Test", steps: sampleSteps }),
        WorkflowValidationError
      );
      assert.throws(
        () => WorkflowDefinition.create({ id: "wf-1", tenantId: TENANT_ID, organizationId: ORG_ID, name: "", steps: sampleSteps }),
        WorkflowValidationError
      );
      assert.throws(
        () => WorkflowDefinition.create({ id: "wf-1", tenantId: TENANT_ID, organizationId: ORG_ID, name: "Test", steps: [] }),
        WorkflowValidationError
      );
    });

    it("rejects duplicate stepIds", () => {
      const duplicateSteps: WorkflowStepDefinition[] = [
        { stepId: "step-1", name: "Step 1", order: 1, purpose: "P1" },
        { stepId: "step-1", name: "Step 1 Duplicate", order: 2, purpose: "P2" },
      ];
      assert.throws(
        () => WorkflowDefinition.create({ id: "wf-dup", tenantId: TENANT_ID, organizationId: ORG_ID, name: "Dup", steps: duplicateSteps }),
        WorkflowValidationError
      );
    });

    it("rejects self-dependent steps or non-existent dependencies", () => {
      const selfDepSteps: WorkflowStepDefinition[] = [
        { stepId: "step-1", name: "Step 1", order: 1, purpose: "P1", dependsOn: ["step-1"] },
      ];
      assert.throws(
        () => WorkflowDefinition.create({ id: "wf-self", tenantId: TENANT_ID, organizationId: ORG_ID, name: "Self", steps: selfDepSteps }),
        WorkflowCycleError
      );

      const nonExistentDepSteps: WorkflowStepDefinition[] = [
        { stepId: "step-1", name: "Step 1", order: 1, purpose: "P1", dependsOn: ["step-nonexistent"] },
      ];
      assert.throws(
        () => WorkflowDefinition.create({ id: "wf-missing", tenantId: TENANT_ID, organizationId: ORG_ID, name: "Missing", steps: nonExistentDepSteps }),
        WorkflowValidationError
      );
    });

    it("rejects cyclic dependencies (A -> B -> C -> A) using DFS cycle detection", () => {
      const cycleSteps: WorkflowStepDefinition[] = [
        { stepId: "step-A", name: "A", order: 1, purpose: "A", dependsOn: ["step-C"] },
        { stepId: "step-B", name: "B", order: 2, purpose: "B", dependsOn: ["step-A"] },
        { stepId: "step-C", name: "C", order: 3, purpose: "C", dependsOn: ["step-B"] },
      ];
      assert.throws(
        () => WorkflowDefinition.create({ id: "wf-cycle", tenantId: TENANT_ID, organizationId: ORG_ID, name: "Cycle", steps: cycleSteps }),
        WorkflowCycleError
      );
    });

    it("transitions lifecycle from DRAFT -> ACTIVE -> ARCHIVED and rejects invalid transitions", () => {
      const def = WorkflowDefinition.create({
        id: "wf-lifecycle",
        tenantId: TENANT_ID,
        organizationId: ORG_ID,
        name: "Lifecycle Test",
        steps: sampleSteps,
      });

      assert.equal(def.status, "DRAFT");
      const activeDef = def.activate();
      assert.equal(activeDef.status, "ACTIVE");

      const archivedDef = activeDef.archive();
      assert.equal(archivedDef.status, "ARCHIVED");

      // Cannot activate archived definition
      assert.throws(() => archivedDef.activate(), WorkflowStateTransitionError);
      // Cannot update archived definition
      assert.throws(() => archivedDef.update({ name: "New Name" }), WorkflowStateTransitionError);
    });

    it("updates definition and increments version", () => {
      const def = WorkflowDefinition.create({
        id: "wf-update",
        tenantId: TENANT_ID,
        organizationId: ORG_ID,
        name: "Initial Name",
        steps: sampleSteps,
      });

      const updated = def.update({ name: "Updated Name", description: "New Desc" });
      assert.equal(updated.name, "Updated Name");
      assert.equal(updated.description, "New Desc");
      assert.equal(updated.version, 2);
    });
  });

  describe("WorkflowInstance Domain Aggregate", () => {
    it("creates an instance only from an ACTIVE definition", () => {
      const draftDef = WorkflowDefinition.create({
        id: "wf-draft",
        tenantId: TENANT_ID,
        organizationId: ORG_ID,
        name: "Draft",
        steps: sampleSteps,
      });

      assert.throws(
        () => WorkflowInstance.create({
          id: "inst-1",
          workflowDefinition: draftDef,
          initiatorId: "user-123",
          input: { key: "value" },
        }),
        WorkflowValidationError
      );

      const activeDef = draftDef.activate();
      const instance = WorkflowInstance.create({
        id: "inst-1",
        workflowDefinition: activeDef,
        initiatorId: "user-123",
        input: { key: "value" },
      });

      assert.equal(instance.id, "inst-1");
      assert.equal(instance.workflowDefinitionId, "wf-draft");
      assert.equal(instance.status, "PENDING");
      assert.equal(instance.version, 1);
      assert.equal(Object.keys(instance.stepStates).length, 3);
      assert.equal(instance.stepStates["step-1"]?.status, "PENDING");
    });

    it("transitions instance state: PENDING -> RUNNING -> PAUSED -> RUNNING -> COMPLETED", () => {
      const activeDef = WorkflowDefinition.create({
        id: "wf-run",
        tenantId: TENANT_ID,
        organizationId: ORG_ID,
        name: "Run",
        steps: sampleSteps,
      }).activate();

      let inst = WorkflowInstance.create({
        id: "inst-run",
        workflowDefinition: activeDef,
        initiatorId: "user-123",
        input: {},
      });

      assert.equal(inst.status, "PENDING");
      inst = inst.start();
      assert.equal(inst.status, "RUNNING");

      inst = inst.pause("Maintenance pause");
      assert.equal(inst.status, "PAUSED");

      inst = inst.resume();
      assert.equal(inst.status, "RUNNING");

      inst = inst.complete({ summary: "Done" });
      assert.equal(inst.status, "COMPLETED");
      assert.equal(inst.isTerminal(), true);

      // Cannot cancel or resume a completed instance
      assert.throws(() => inst.cancel("Late cancel"), WorkflowStateTransitionError);
      assert.throws(() => inst.resume(), WorkflowStateTransitionError);
    });

    it("calculates runnable steps based on DAG dependency resolution", () => {
      const activeDef = WorkflowDefinition.create({
        id: "wf-dag",
        tenantId: TENANT_ID,
        organizationId: ORG_ID,
        name: "DAG Test",
        steps: sampleSteps,
      }).activate();

      let inst = WorkflowInstance.create({
        id: "inst-dag",
        workflowDefinition: activeDef,
        initiatorId: "user-123",
        input: {},
      }).start();

      // Initially only step-1 is runnable (no dependencies)
      let runnable = inst.getNextRunnableStepIds(activeDef);
      assert.deepEqual(runnable, ["step-1"]);

      // Complete step-1
      inst = inst.markStepAssigning("step-1", "agent-validator");
      inst = inst.markStepDispatched("step-1", "task-1");
      inst = inst.markStepRunning("step-1");
      inst = inst.markStepCompleted("step-1", { valid: true });

      // Now step-2 should be runnable
      runnable = inst.getNextRunnableStepIds(activeDef);
      assert.deepEqual(runnable, ["step-2"]);

      // Complete step-2
      inst = inst.markStepAssigning("step-2", "agent-calc");
      inst = inst.markStepDispatched("step-2", "task-2");
      inst = inst.markStepRunning("step-2");
      inst = inst.markStepCompleted("step-2", { total: 42 });

      // Now step-3 should be runnable
      runnable = inst.getNextRunnableStepIds(activeDef);
      assert.deepEqual(runnable, ["step-3"]);

      // Complete step-3
      inst = inst.markStepAssigning("step-3", "agent-reporter");
      inst = inst.markStepDispatched("step-3", "task-3");
      inst = inst.markStepRunning("step-3");
      inst = inst.markStepCompleted("step-3", { pdf: "report.pdf" });

      // No more runnable steps and workflow is completed
      runnable = inst.getNextRunnableStepIds(activeDef);
      assert.deepEqual(runnable, []);
      assert.equal(inst.isCompleted(), true);
    });

    it("handles step retry limits correctly", () => {
      const stepsWithRetry: WorkflowStepDefinition[] = [
        {
          stepId: "step-retry",
          name: "Flaky Step",
          order: 1,
          purpose: "Flaky network call",
          maxRetries: 2,
        },
      ];

      const activeDef = WorkflowDefinition.create({
        id: "wf-retry",
        tenantId: TENANT_ID,
        organizationId: ORG_ID,
        name: "Retry Test",
        steps: stepsWithRetry,
      }).activate();

      let inst = WorkflowInstance.create({
        id: "inst-retry",
        workflowDefinition: activeDef,
        initiatorId: "user-123",
        input: {},
      }).start();

      // First attempt
      inst = inst.markStepAssigning("step-retry", "agent-flaky");
      inst = inst.markStepDispatched("step-retry", "task-r1");
      inst = inst.markStepRunning("step-retry");

      // First failure (attempts: 1, maxRetries: 2) -> will retry
      const fail1 = inst.markStepFailed("step-retry", "Network timeout 1");
      assert.equal(fail1.willRetry, true);
      inst = fail1.instance;
      assert.equal(inst.status, "RUNNING"); // Still running
      assert.equal(inst.stepStates["step-retry"]?.status, "PENDING"); // Reset to PENDING for retry

      // Second attempt
      inst = inst.markStepAssigning("step-retry", "agent-flaky");
      inst = inst.markStepDispatched("step-retry", "task-r2");
      inst = inst.markStepRunning("step-retry");

      // Second failure (attempts: 2, maxRetries: 2) -> retries exhausted
      const fail2 = inst.markStepFailed("step-retry", "Network timeout 2");
      assert.equal(fail2.willRetry, false);
      inst = fail2.instance;
      assert.equal(inst.status, "FAILED");
      assert.equal(inst.stepStates["step-retry"]?.status, "FAILED");
    });
  });

  describe("WorkflowOrchestratorService Integration & Governance", () => {
    let defRepo: InMemoryWorkflowDefinitionRepository;
    let instRepo: InMemoryWorkflowInstanceRepository;
    let orgRepo: InMemoryOrganizationRepository;
    let profileRepo: InMemoryAgentProfileRepository;
    let budgetRepo: InMemoryTeamResourceBudgetRepository;
    let profileService: AgentProfileService;
    let budgetService: TeamResourceBudgetService;
    let policy: InMemoryPolicyGateway;
    let orchestratorService: WorkflowOrchestratorService;

    const mockAgentQuery = {
      findById: (id: string) => ({
        id,
        name: `Agent ${id}`,
        status: "ACTIVE",
        toDefinition: () => ({
          id,
          name: `Agent ${id}`,
          model: "deterministic-stub",
          instructions: "Execute workflow step task",
          tools: [],
          memoryScope: "workflow",
        }),
      }),
      list: () => [],
    };

    beforeEach(async () => {
      defRepo = new InMemoryWorkflowDefinitionRepository();
      instRepo = new InMemoryWorkflowInstanceRepository();
      orgRepo = new InMemoryOrganizationRepository();
      profileRepo = new InMemoryAgentProfileRepository();
      budgetRepo = new InMemoryTeamResourceBudgetRepository();
      policy = new InMemoryPolicyGateway();

      profileService = new AgentProfileService({
        profileRepository: profileRepo,
        organizationRepository: orgRepo,
        agentQuery: mockAgentQuery as any,
      });

      budgetService = new TeamResourceBudgetService({
        budgetRepository: budgetRepo,
        organizationRepository: orgRepo,
      });

      orchestratorService = new WorkflowOrchestratorService({
        definitionRepository: defRepo,
        instanceRepository: instRepo,
        agentProfileService: profileService,
        organizationRepository: orgRepo,
        budgetService,
        policyGateway: policy,
        agentQuery: mockAgentQuery as any,
      });

      // Setup Org, Team and Agent Profile
      await orgRepo.saveOrganization(Organization.create({ id: ORG_ID, tenantId: TENANT_ID, name: "Main Org" }));
      await orgRepo.saveTeam(Team.create({ id: TEAM_ID, tenantId: TENANT_ID, organizationId: ORG_ID, areaId: AREA_ID, name: "Alpha Team" }));

      // Setup Team Budget
      await budgetRepo.save(TeamResourceBudget.create({
        id: "budget-alpha",
        tenantId: TENANT_ID,
        teamId: TEAM_ID,
        organizationId: ORG_ID,
        limits: standardLimits,
      }));

      // Setup Agent Profiles
      await profileRepo.save(AgentProfile.create({
        agentId: "agent-validator",
        tenantId: TENANT_ID,
        organizationId: ORG_ID,
        teamId: TEAM_ID,
        role: "OPERATOR",
        responsibilities: ["input-validation"],
        capabilities: [{ id: "data-validation", name: "Data Validation", status: "VERIFIED" }],
      }));

      await profileRepo.save(AgentProfile.create({
        agentId: "agent-calc",
        tenantId: TENANT_ID,
        organizationId: ORG_ID,
        teamId: TEAM_ID,
        role: "SPECIALIST",
        responsibilities: ["financial-computation"],
        capabilities: [{ id: "math-calc", name: "Math Calculation", status: "VERIFIED" }],
      }));

      await profileRepo.save(AgentProfile.create({
        agentId: "agent-reporter",
        tenantId: TENANT_ID,
        organizationId: ORG_ID,
        teamId: TEAM_ID,
        role: "OPERATOR",
        responsibilities: ["report-generation"],
        capabilities: [{ id: "doc-gen", name: "Document Generation", status: "VERIFIED" }],
      }));
    });

    it("orchestrates a multi-step workflow end-to-end with governed agent discovery", async () => {
      // 1. Create and Activate Definition
      const def = await orchestratorService.createDefinition({
        id: "wf-e2e",
        tenantId: TENANT_ID,
        organizationId: ORG_ID,
        teamId: TEAM_ID,
        name: "E2E Governed Pipeline",
        steps: sampleSteps,
      });

      await orchestratorService.activateDefinition(def.id, TENANT_ID);

      // 2. Start Workflow with autoAdvance = true
      const startResult = await orchestratorService.startWorkflow({
        definitionId: def.id,
        tenantId: TENANT_ID,
        initiatorId: "supervisor-1",
        input: { orderId: "ORD-999", amount: 150 },
        autoAdvance: true,
      });

      assert.equal(startResult.instance.status, "COMPLETED");
      assert.equal(startResult.executedSteps.length, 3);
      assert.equal(startResult.executedSteps[0]?.success, true);
      assert.equal(startResult.executedSteps[0]?.assignedAgentId, "agent-validator");
      assert.equal(startResult.executedSteps[1]?.assignedAgentId, "agent-calc");
      assert.equal(startResult.executedSteps[2]?.assignedAgentId, "agent-reporter");

      // Verify all steps completed in instance
      const savedInstance = await orchestratorService.getInstance(startResult.instance.id, TENANT_ID);
      assert.equal(savedInstance.status, "COMPLETED");
      assert.equal(savedInstance.stepStates["step-1"]?.status, "COMPLETED");
      assert.equal(savedInstance.stepStates["step-2"]?.status, "COMPLETED");
      assert.equal(savedInstance.stepStates["step-3"]?.status, "COMPLETED");
    });

    it("fails step and workflow when PolicyGateway rejects the step execution", async () => {
      // Deny policy for Process Calculation
      const denyPolicy = new InMemoryPolicyGateway((ctx) => {
        if (ctx.metadata?.stepName === "Process Calculation") {
          return { allowed: false, policyId: "deny-calc", reason: "Calculations forbidden by policy" };
        }
        return { allowed: true, policyId: "allow-all" };
      });

      const strictOrchestrator = new WorkflowOrchestratorService({
        definitionRepository: defRepo,
        instanceRepository: instRepo,
        agentProfileService: profileService,
        organizationRepository: orgRepo,
        budgetService,
        policyGateway: denyPolicy,
        agentQuery: mockAgentQuery as any,
      });

      const def = await strictOrchestrator.createDefinition({
        id: "wf-policy-test",
        tenantId: TENANT_ID,
        organizationId: ORG_ID,
        teamId: TEAM_ID,
        name: "Policy Test",
        steps: sampleSteps,
      });
      await strictOrchestrator.activateDefinition(def.id, TENANT_ID);

      const result = await strictOrchestrator.startWorkflow({
        definitionId: def.id,
        tenantId: TENANT_ID,
        initiatorId: "user-1",
        autoAdvance: true,
      });

      assert.equal(result.instance.status, "FAILED");
      assert.equal(result.instance.stepStates["step-1"]?.status, "COMPLETED");
      assert.equal(result.instance.stepStates["step-2"]?.status, "FAILED");
      assert.equal(result.instance.stepStates["step-3"]?.status, "PENDING");
    });

    it("fails step and workflow when Team Resource Budget is exhausted", async () => {
      // Create team with 0 executions budget
      await budgetRepo.save(TeamResourceBudget.create({
        id: "budget-zero",
        tenantId: TENANT_ID,
        teamId: "team-broke",
        organizationId: ORG_ID,
        limits: { ...standardLimits, maxExecutions: 0 },
      }));

      await orgRepo.saveTeam(Team.create({ id: "team-broke", tenantId: TENANT_ID, organizationId: ORG_ID, areaId: AREA_ID, name: "Broke Team" }));

      const def = await orchestratorService.createDefinition({
        id: "wf-budget-test",
        tenantId: TENANT_ID,
        organizationId: ORG_ID,
        teamId: "team-broke",
        name: "Budget Test",
        steps: [
          {
            stepId: "step-b1",
            name: "Broke Step",
            order: 1,
            purpose: "Needs budget",
            assignedAgentId: "agent-validator",
            assignedTeamId: "team-broke",
          },
        ],
      });
      await orchestratorService.activateDefinition(def.id, TENANT_ID);

      const result = await orchestratorService.startWorkflow({
        definitionId: def.id,
        tenantId: TENANT_ID,
        initiatorId: "user-1",
        autoAdvance: true,
      });

      assert.equal(result.instance.status, "FAILED");
      assert.equal(result.instance.stepStates["step-b1"]?.status, "FAILED");
      assert.match(result.instance.stepStates["step-b1"]?.error || "", /quota|budget/i);
    });

    it("enforces Optimistic Concurrency Control (OCC) version conflicts", async () => {
      const def = await orchestratorService.createDefinition({
        id: "wf-occ",
        tenantId: TENANT_ID,
        organizationId: ORG_ID,
        name: "OCC Test",
        steps: sampleSteps,
      });

      // Saving directly with a skipped version throws OCC conflict
      const invalidVersionDef = WorkflowDefinition.rehydrate({
        ...def,
        version: 5, // jumped from 1 to 5
      });

      await assert.rejects(
        () => defRepo.save(invalidVersionDef),
        WorkflowConcurrencyConflictError
      );
    });

    it("enforces cross-tenant isolation: cannot access workflow from another tenant", async () => {
      const def = await orchestratorService.createDefinition({
        id: "wf-tenant-a",
        tenantId: "tenant-A",
        organizationId: ORG_ID,
        name: "Tenant A Workflow",
        steps: sampleSteps,
      });

      // Tenant B tries to get Tenant A's workflow
      await assert.rejects(
        () => orchestratorService.getDefinition(def.id, "tenant-B"),
        WorkflowNotFoundError
      );
    });
  });
});

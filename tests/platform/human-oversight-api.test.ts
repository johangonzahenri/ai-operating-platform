import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { AddressInfo } from "node:net";
import { createPlatform } from "../../src/interfaces/composition.js";
import { PlatformService } from "../../src/platform/api/platform-service.js";
import { createHttpServer } from "../../src/platform/api/http-router.js";
import { createPlatformClient } from "../../src/platform-client/index.js";
import { Agent } from "../../src/domain/agent/agent.js";
import { ApiKeyRecord } from "../../src/domain/security/authentication.js";

test("Prompt 113 — Platform HTTP REST API: Human Oversight, Approval & Escalation (/api/v1/approvals)", async (t) => {
  let server: http.Server;
  let client: ReturnType<typeof createPlatformClient>;
  let baseUrl: string;
  let platform: ReturnType<typeof createPlatform>;
  let service: PlatformService;

  const TEST_TENANT = "tenant-oversight-api-test";
  const OTHER_TENANT = "tenant-other-oversight";
  const TEST_KEY_SECRET = "secret-oversight-admin-12345";
  let apiKeyString: string;

  await t.test("Setup: Bootstrap Platform HTTP Server with Auth, Org & Human Oversight Services", async () => {
    platform = createPlatform();

    // Register API Key for auth
    const keyHash = ApiKeyRecord.hashSecret(TEST_KEY_SECRET);
    const keyRecord = ApiKeyRecord.create({
      id: "key-ho-1",
      principalId: "admin-approver",
      principalType: "SERVICE",
      keyHash,
      roles: ["system-admin"],
      tenantId: TEST_TENANT,
      status: "ACTIVE",
    });
    await platform.apiKeyRepository.save(keyRecord);
    apiKeyString = `key-ho-1.${TEST_KEY_SECRET}`;

    // Register agents
    const worker = Agent.create({
      id: "agent-payroll-calculator",
      name: "Payroll Calculator",
      model: "stub-model",
      instructions: "Calculate company payroll disbursements",
      tools: [],
    });
    const reviewer = Agent.create({
      id: "agent-compliance-officer",
      name: "Compliance Officer",
      model: "stub-model",
      instructions: "Review and approve payroll payouts",
      tools: [],
    });
    platform.agents.register(worker);
    platform.agents.register(reviewer);

    // Register org hierarchy
    const org = await platform.organizationService.createOrganization({ id: "org-finance", tenantId: TEST_TENANT, name: "Finance Org" });
    const area = await platform.organizationService.createArea({ id: "area-finance", organizationId: org.id, tenantId: TEST_TENANT, name: "Finance Area" });
    const team = await platform.organizationService.createTeam({ id: "team-payroll", organizationId: org.id, areaId: area.id, tenantId: TEST_TENANT, name: "Payroll Team" });

    await platform.organizationService.assignAgent({ teamId: team.id, agentId: "agent-payroll-calculator", role: "SPECIALIST", tenantId: TEST_TENANT, organizationId: org.id });
    await platform.organizationService.assignAgent({ teamId: team.id, agentId: "agent-compliance-officer", role: "REVIEWER", tenantId: TEST_TENANT, organizationId: org.id });

    // Assign agents and create profiles
    await platform.agentProfileService.createProfile({
      agentId: "agent-payroll-calculator",
      tenantId: TEST_TENANT,
      organizationId: org.id,
      teamId: team.id,
      role: "SPECIALIST",
      responsibilities: ["payroll-calc"],
      capabilities: [{ id: "calc-payroll", name: "Payroll Computation", status: "VERIFIED" }],
    });

    await platform.agentProfileService.createProfile({
      agentId: "agent-compliance-officer",
      tenantId: TEST_TENANT,
      organizationId: org.id,
      teamId: team.id,
      role: "REVIEWER",
      responsibilities: ["compliance-oversight"],
      capabilities: [{ id: "compliance-review", name: "Compliance Review", status: "VERIFIED" }],
    });

    // Create Team Budget
    await platform.teamResourceBudgetService.createBudget({
      teamId: team.id,
      tenantId: TEST_TENANT,
      limits: {
        maxExecutions: 50,
        maxModelCalls: 100,
        maxToolCalls: 100,
        maxAutonomousSteps: 100,
        maxDurationMs: 60000,
      },
    });

    service = new PlatformService({
      tasks: platform.tasks,
      taskRepository: platform.taskRepository,
      executions: platform.executions,
      audit: platform.audit,
      metrics: platform.metrics,
      tools: platform.tools,
      models: platform.modelRegistry,
      agents: platform.agents,
      agentService: platform.agentService,
      submitTask: platform.submitTask,
      executeOrchestration: platform.executeOrchestration,
      operations: platform.operations,
      operationService: platform.operationService,
      eventStore: platform.eventStore,
      db: platform.db,
      diagnostics: platform.diagnostics,
      organizationService: platform.organizationService,
      teamResourceBudgetService: platform.teamResourceBudgetService,
      organizationalCoordinationService: platform.organizationalCoordinationService,
      agentProfileService: platform.agentProfileService,
      workflowOrchestratorService: platform.workflowOrchestratorService,
      workflowVerificationService: platform.workflowVerificationService,
      humanOversightService: platform.humanOversightService,
      eventStream: platform.eventStream,
    });

    server = createHttpServer(service, {
      authService: platform.authenticationService,
      authzEvaluator: platform.rbacEvaluator,
      roleRepository: platform.roleRepository,
      apiKeyRepository: platform.apiKeyRepository,
      enforceSecurity: false,
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const port = (server.address() as AddressInfo).port;
    baseUrl = `http://127.0.0.1:${port}`;
    client = createPlatformClient({
      baseUrl,
      apiPrefix: "/api/v1",
      apiKey: apiKeyString,
      defaultHeaders: {
        "x-tenant-id": TEST_TENANT,
      },
    });
  });

  let createdDefinitionId: string;
  let startedInstanceId: string;
  let createdApprovalId: string;

  await t.test("1. Create workflow definition with step requiring approval and start instance", async () => {
    const def = await client.workflows.createDefinition({
      id: "wf-payroll-disbursement",
      name: "Payroll Disbursement with Human Oversight",
      organizationId: "org-finance",
      steps: [
        {
          stepId: "calc-step",
          name: "Calculate Payroll",
          order: 1,
          purpose: "Compute payroll ledger",
          responsibility: "payroll-calc",
          dependsOn: [],
          requiresApproval: true,
        },
        {
          stepId: "disburse-step",
          name: "Execute Disbursement",
          order: 2,
          purpose: "Transfer funds to bank accounts",
          responsibility: "compliance-oversight",
          dependsOn: ["calc-step"],
        },
      ],
    });
    createdDefinitionId = def.id;
    assert.strictEqual(def.id, "wf-payroll-disbursement");
    assert.strictEqual(def.status, "DRAFT");

    // Activate
    const active = await client.workflows.activateDefinition(createdDefinitionId);
    assert.strictEqual(active.status, "ACTIVE");

    // Start instance
    const started = await client.workflows.start(createdDefinitionId, { autoAdvance: true });
    startedInstanceId = started.instance.id;
    assert.strictEqual(started.instance.workflowDefinitionId, createdDefinitionId);
  });

  await t.test("2. POST /approvals: create approval request", async () => {
    const approval = await client.approvals.request({
      workflowId: createdDefinitionId,
      workflowInstanceId: startedInstanceId,
      workflowStepId: "calc-step",
      requesterPrincipalId: "agent-payroll-calculator",
      producerPrincipalId: "agent-payroll-calculator",
      purpose: "Authorize payment of $12,500 for monthly payroll",
      requiredRole: "REVIEWER",
    });

    assert.ok(approval.id);
    createdApprovalId = approval.id;
    assert.strictEqual(approval.status, "REQUESTED");
    assert.strictEqual(approval.requesterPrincipalId, "agent-payroll-calculator");
    assert.strictEqual(approval.workflowStepId, "calc-step");
  });

  await t.test("3. GET /approvals: list approvals with status filter", async () => {
    const list = await client.approvals.list({ status: "REQUESTED" });
    assert.ok(list.length >= 1);
    const found = list.find((a) => a.id === createdApprovalId);
    assert.ok(found);
    assert.strictEqual(found.status, "REQUESTED");
  });

  await t.test("4. GET /approvals/:id: retrieve single approval request", async () => {
    const approval = await client.approvals.get(createdApprovalId);
    assert.strictEqual(approval.id, createdApprovalId);
    assert.strictEqual(approval.tenantId, TEST_TENANT);
    assert.strictEqual(approval.purpose, "Authorize payment of $12,500 for monthly payroll");
  });

  await t.test("5. POST /approvals/:id/review: start review process", async () => {
    const reviewing = await client.approvals.startReview(createdApprovalId, {
      reviewerPrincipalId: "agent-compliance-officer",
    });

    assert.strictEqual(reviewing.status, "REVIEWING");
    assert.strictEqual(reviewing.reviewerPrincipalId, "agent-compliance-officer");
    assert.strictEqual(reviewing.version, 2);
  });

  await t.test("6. POST /approvals/:id/approve: approve request and advance workflow step", async () => {
    const approved = await client.approvals.approve(createdApprovalId, {
      approverPrincipalId: "agent-compliance-officer",
      reason: "All timesheets and tax withholdings verified",
      metadata: { disbursementBatch: "BATCH-2026-09" },
    });

    assert.strictEqual(approved.status, "APPROVED");
    assert.strictEqual(approved.approverPrincipalId, "agent-compliance-officer");
    assert.strictEqual(approved.decisionReason, "All timesheets and tax withholdings verified");
    assert.strictEqual(approved.version, 3);
  });

  await t.test("7. Invariant: Terminal state cannot be re-decided (POST /reject on approved returns 409)", async () => {
    await assert.rejects(async () => {
      await client.approvals.reject(createdApprovalId, {
        approverPrincipalId: "agent-compliance-officer",
        reason: "Attempt to reject approved request",
      });
    }, (err: any) => {
      assert.strictEqual(err.status, 409);
      return true;
    });
  });

  await t.test("8. Invariant: Producer cannot self-approve (SelfApprovalError returns 403)", async () => {
    const secondReq = await client.approvals.request({
      workflowId: createdDefinitionId,
      workflowInstanceId: startedInstanceId,
      workflowStepId: "calc-step",
      requesterPrincipalId: "agent-payroll-calculator",
      producerPrincipalId: "agent-payroll-calculator",
      purpose: "Second disbursement request",
    });

    await assert.rejects(async () => {
      await client.approvals.approve(secondReq.id, {
        approverPrincipalId: "agent-payroll-calculator", // Attempted self-approval by producer
        reason: "I approve my own calculation",
      });
    }, (err: any) => {
      assert.strictEqual(err.status, 403);
      assert.match(err.message, /Self-approval rejected/);
      return true;
    });
  });

  await t.test("9. Multi-Tenant Boundary: Cross-tenant approval request rejected fail-closed", async () => {
    const crossClient = createPlatformClient({
      baseUrl,
      apiPrefix: "/api/v1",
      apiKey: apiKeyString,
      defaultHeaders: {
        "x-tenant-id": OTHER_TENANT,
      },
    });

    await assert.rejects(async () => {
      await crossClient.approvals.get(createdApprovalId);
    }, (err: any) => {
      assert.ok(err.status === 404 || err.status === 403);
      return true;
    });
  });

  await t.test("Teardown: Close HTTP server", async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });
});

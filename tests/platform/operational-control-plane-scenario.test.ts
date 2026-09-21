/**
 * AI Operating Platform - End-to-End Operational Control Plane Scenario (Phase 80)
 * 
 * Demonstrates the canonical pipeline consumed by the Operational Control Plane:
 * Workflow Definition -> Activation -> Instance Start -> DAG Advancement ->
 * Deterministic Verification -> Human Oversight & Approval (SoD Invariant) -> 
 * Complete Lifecycle & Evidence Export
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createPlatform } from "../../src/interfaces/composition.js";
import { createHttpServer } from "../../src/platform/api/http-router.js";
import { PlatformService } from "../../src/platform/api/platform-service.js";
import { createPlatformClient, PlatformClient } from "../../src/platform-client/index.js";
import { Agent } from "../../src/domain/agent/agent.js";

describe("Phase 80 — E2E Operational Control Plane Integration Scenario", () => {
  let server: http.Server;
  let baseUrl: string;
  let client: PlatformClient;
  let service: PlatformService;
  const TEST_TENANT = "tenant-ops-control-plane";

  it("0. Setup: Bootstrap Platform Server and Client", async () => {
    const platform = createPlatform({
      logger: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} } as any,
    });

    // 1. Register agents
    const agent1 = Agent.create({
      id: "agent-finance-reader",
      name: "Finance Reader",
      model: "stub-model",
      instructions: "Read financial data",
      tools: [],
    });
    const agent2 = Agent.create({
      id: "agent-finance-reconciler",
      name: "Finance Reconciler",
      model: "stub-model",
      instructions: "Reconcile ledgers",
      tools: [],
    });
    platform.agents.register(agent1);
    platform.agents.register(agent2);

    // 2. Org hierarchy & team budget
    const org = await platform.organizationService.createOrganization({ id: "org-finance", tenantId: TEST_TENANT, name: "Finance Org" });
    const area = await platform.organizationService.createArea({ id: "area-finance", organizationId: org.id, tenantId: TEST_TENANT, name: "Finance Area" });
    const team = await platform.organizationService.createTeam({ id: "team-finance", organizationId: org.id, areaId: area.id, tenantId: TEST_TENANT, name: "Finance Team" });

    await platform.organizationService.assignAgent({ teamId: team.id, agentId: "agent-finance-reader", role: "SPECIALIST", tenantId: TEST_TENANT, organizationId: org.id });
    await platform.organizationService.assignAgent({ teamId: team.id, agentId: "agent-finance-reconciler", role: "REVIEWER", tenantId: TEST_TENANT, organizationId: org.id });

    await platform.agentProfileService.createProfile({
      agentId: "agent-finance-reader",
      tenantId: TEST_TENANT,
      organizationId: org.id,
      teamId: team.id,
      role: "SPECIALIST",
      responsibilities: ["reading"],
      capabilities: [{ id: "finance.read", name: "Finance Read", status: "VERIFIED" }],
    });

    await platform.agentProfileService.createProfile({
      agentId: "agent-finance-reconciler",
      tenantId: TEST_TENANT,
      organizationId: org.id,
      teamId: team.id,
      role: "REVIEWER",
      responsibilities: ["reconciliation"],
      capabilities: [{ id: "finance.reconcile", name: "Finance Reconcile", status: "VERIFIED" }],
    });

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
      executions: platform.executions,
      audit: platform.audit,
      metrics: platform.metrics,
      tools: platform.tools,
      agents: platform.agents,
      agentService: platform.agentService,
      agentProfileService: platform.agentProfileService,
      organizationService: platform.organizationService,
      teamResourceBudgetService: platform.teamResourceBudgetService,
      submitTask: platform.submitTask,
      executeOrchestration: platform.executeOrchestration,
      portfolioGovernanceService: platform.portfolioGovernanceService,
      enterpriseOperatingService: platform.enterpriseOperatingService,
      workflowOrchestratorService: platform.workflowOrchestratorService,
      workflowVerificationService: platform.workflowVerificationService,
      humanOversightService: platform.humanOversightService,
      evidenceExportService: platform.evidenceExportService,
      eventStore: platform.eventStore,
    });

    server = createHttpServer(service, {
      enforceSecurity: false,
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;

    client = createPlatformClient({
      baseUrl,
      tenantId: TEST_TENANT,
    });
  });

  it("1. Scenario: Full Operational Lifecycle — Define -> Start -> Verify -> Oversight -> Evidence", async () => {
    // 1. Create Workflow Definition
    const wfDef = await client.workflows.createDefinition({
      id: "wf-quarterly-audit",
      organizationId: "org-finance",
      teamId: "team-finance",
      name: "Quarterly Financial Reconciliation",
      description: "Governed multi-step ledger reconciliation with deterministic verification and executive sign-off",
      steps: [
        {
          stepId: "step-1-fetch",
          name: "Fetch Ledger Entries",
          requiredCapability: "finance.read",
          order: 0,
          dependencies: [],
        },
        {
          stepId: "step-2-reconcile",
          name: "Execute Reconciliation",
          requiredCapability: "finance.reconcile",
          order: 1,
          dependencies: ["step-1-fetch"],
        },
      ],
    });

    assert.ok(wfDef.id);
    assert.equal(wfDef.status, "DRAFT");
    assert.equal(wfDef.steps.length, 2);

    // 2. Activate Workflow Definition
    const activated = await client.workflows.activateDefinition(wfDef.id);
    assert.equal(activated.status, "ACTIVE");

    // 3. Start Workflow Instance
    const startResult = await client.workflows.start(wfDef.id, {
      input: {
        fiscalPeriod: "2026-Q3",
        reconciliationMode: "STRICT_CANONICAL",
      },
    });
    const instance = startResult.instance;
    assert.ok(instance.id);
    assert.equal(instance.workflowDefinitionId, wfDef.id);
    assert.ok(instance.status === "COMPLETED" || instance.status === "RUNNING");
    assert.equal(startResult.executedSteps.length, 2);

    // 5. Submit Deterministic Step Verification (Producer != Verifier)
    const verifRes = await client.verifications.verify({
      workflowInstanceId: instance.id,
      stepId: "step-1-fetch",
      tenantId: TEST_TENANT,
      verifierPrincipalId: "verifier-auditor",
      producerPrincipalId: "agent-finance-reader",
    });
    assert.ok(verifRes);
    assert.equal(verifRes.verdict, "PASS");

    // 6. Request Human Oversight / Approval for Critical Step
    const approvalReq = await client.approvals.request({
      workflowId: wfDef.id,
      workflowInstanceId: instance.id,
      workflowStepId: "step-1-fetch",
      requesterPrincipalId: "agent-finance-reader",
      producerPrincipalId: "agent-finance-reader",
      purpose: "Authorize ledger closing reconciliation",
      requiredRole: "REVIEWER",
    });
    assert.ok(approvalReq.id);
    assert.ok(approvalReq.status === "REQUESTED" || approvalReq.status === "PENDING");

    // 7. Invariant: Segregation of Duties (SoD) — Self-Approval Attempt MUST Fail
    await assert.rejects(
      async () => {
        await client.approvals.approve(approvalReq.id, {
          approverPrincipalId: "agent-finance-reader", // Same as producerPrincipalId!
          reason: "Attempting illegal self-approval",
        });
      },
      (err: any) => {
        assert.ok(err);
        return true;
      },
      "Self-approval attempt must be rejected fail-closed"
    );

    // 8. Authorized Approver Signs Off (Segregation of Duties Respected)
    const approved = await client.approvals.approve(approvalReq.id, {
      approverPrincipalId: "agent-finance-reconciler", // Distinct authorized principal
      reason: "Quarterly balance reconciliation certified and verified against ledger",
    });
    assert.equal(approved.status, "APPROVED");

    // 9. Inspect Instance State & DAG
    const finalInst = await client.workflows.getInstance(instance.id);
    assert.ok(finalInst);
    assert.equal(finalInst.id, instance.id);

    // 10. Generate Compliance Evidence Package Sealed with SHA-256
    const evidencePkg = await client.governance.exportEvidence({
      scope: "WORKFLOW",
      targetId: instance.id,
      limit: 50,
    });

    assert.ok(evidencePkg.manifest);
    assert.equal(evidencePkg.manifest.scope, "WORKFLOW");
    assert.equal(typeof evidencePkg.manifest.checksumSha256, "string");
    assert.equal(evidencePkg.manifest.checksumSha256.length, 64, "Seal must be valid 64-char SHA-256 hex");
  });

  it("99. Teardown: Stop Server", async () => {
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });
});

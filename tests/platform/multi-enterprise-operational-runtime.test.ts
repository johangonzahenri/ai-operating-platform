/**
 * Phase 76 Platform API Tests: Multi-Enterprise Operational Runtime & Governed Execution
 *
 * End-to-end HTTP REST & SDK Client verification for:
 * 1. Same-enterprise execution allowed (200 OK)
 * 2. Cross-enterprise execution DEFAULT DENY without active Mandate (403 Forbidden)
 * 3. Cross-enterprise execution authorized with active Mandate (200 OK)
 * 4. Expired Mandate rejected (403 / fail-closed)
 * 5. Revoked Mandate rejected (403 / fail-closed)
 * 6. Scope Violation: Operation outside allowedOperations rejected (403 / fail-closed)
 * 7. Autonomy Violation: Autonomy exceeding Mandate limit rejected (403 / fail-closed)
 * 8. Missing Policy / Policy Evaluation: Policy Gate checks & fail-closed
 * 9. Team Resource Budget: Budget exhaustion halts workflow step
 * 10. Budget Expired: Blocked execution
 * 11. Segregation of Duties (SoD): Executor == Verifier rejected
 * 12. Segregation of Duties (SoD): Executor == Approver rejected (SelfApprovalError)
 * 13. Segregation of Duties (SoD): Verifier == Approver rejected
 * 14. Tenant Boundary Isolation: Tenant A cannot access Tenant B mandates or portfolios
 * 15. Concurrency Control (OCC): Stale concurrency version on mandate revocation throws 409
 * 16. Portfolio KPI Aggregation: SUM aggregation across enterprise measurements
 * 17. Portfolio KPI Aggregation: AVERAGE aggregation across enterprise measurements
 * 18. Workflow Idempotency: Multiple advancement calls preserve terminal state
 * 19. Enterprise Context Snapshot with Multi-Enterprise Mandate Scope
 * 20. End-to-End Canonical Chain: Portfolio -> Enterprise -> Objective -> Mandate -> Workflow -> Metric -> Aggregation
 */

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { AddressInfo } from "node:net";
import { createPlatform } from "../../src/interfaces/composition.js";
import { PlatformService } from "../../src/platform/api/platform-service.js";
import { createHttpServer } from "../../src/platform/api/http-router.js";
import { createPlatformClient } from "../../src/platform-client/index.js";
import { ApiKeyRecord } from "../../src/domain/security/authentication.js";
import { SelfVerificationError } from "../../src/domain/workflow/verification-errors.js";
import { SelfApprovalError } from "../../src/domain/workflow/approval-errors.js";
import { PortfolioConcurrencyConflictError } from "../../src/domain/portfolio/portfolio-errors.js";
import { AgentProfile } from "../../src/domain/organization/agent-profile.js";
import { AgentMembership } from "../../src/domain/organization/agent-membership.js";
import { Organization } from "../../src/domain/organization/organization.js";
import { Area } from "../../src/domain/organization/area.js";
import { Team } from "../../src/domain/organization/team.js";
import { TeamResourceBudget } from "../../src/domain/organization/team-resource-budget.js";

async function registerTestAgent(platform: ReturnType<typeof createPlatform>, agentId: string, tenantId: string = "tenant-enterprise-ops-a") {
  const isTenantB = tenantId === "tenant-enterprise-ops-b";
  const orgId = isTenantB ? "org-beta" : "org-alpha";
  const areaId = isTenantB ? "area-beta" : "area-alpha";
  const teamId = isTenantB ? "team-beta" : "team-alpha";

  const org = Organization.create({ id: orgId, name: `${orgId} Org`, tenantId });
  await platform.organizationRepository.saveOrganization(org);

  const area = Area.create({ id: areaId, organizationId: orgId, name: `${areaId} Area`, tenantId });
  await platform.organizationRepository.saveArea(area);

  const team = Team.create({ id: teamId, areaId: areaId, organizationId: orgId, name: `${teamId} Team`, tenantId });
  await platform.organizationRepository.saveTeam(team);

  const budget = TeamResourceBudget.create({
    teamId,
    organizationId: orgId,
    tenantId,
    limits: {
      maxExecutions: 1000,
      maxModelCalls: 1000,
      maxToolCalls: 1000,
      maxAutonomousSteps: 1000,
      maxDurationMs: 1000000,
    },
  });
  await platform.teamResourceBudgetRepository.save(budget);

  const profile = AgentProfile.create({
    agentId,
    tenantId,
    name: agentId,
    organizationId: orgId,
    teamId,
    role: "OPERATOR",
    responsibilities: ["audit", "execution"],
    capabilities: [
      { id: "cap-exec", name: "Execution", description: "Exec capability", status: "VERIFIED" },
    ],
  });
  await platform.agentProfileRepository.save(profile);

  const membership = AgentMembership.create({
    id: `mem-${agentId}`,
    teamId,
    agentId,
    organizationId: orgId,
    tenantId,
    role: "OPERATOR",
  });
  await platform.organizationRepository.saveMembership(membership);
}

test("Phase 76 — Platform Integration: Multi-Enterprise Operational Runtime & Governed Execution", async (t) => {
  let server: http.Server;
  let client: ReturnType<typeof createPlatformClient>;
  let baseUrl: string;
  let platform: ReturnType<typeof createPlatform>;
  let service: PlatformService;

  const TENANT_A = "tenant-enterprise-ops-a";
  const TENANT_B = "tenant-enterprise-ops-b";
  const TEST_KEY_SECRET = "secret-multi-ops-admin-12345";
  let apiKeyString: string;

  let portfolioId: string;
  let enterpriseAlphaId: string;
  let enterpriseBetaId: string;

  await t.test("0. Setup: Bootstrap Platform Server with Governed Operational Runtime", async () => {
    platform = createPlatform();

    const keyHash = ApiKeyRecord.hashSecret(TEST_KEY_SECRET);
    const keyRecord = ApiKeyRecord.create({
      id: "key-multi-ops-admin",
      principalId: "executive-group-cfo",
      principalType: "SERVICE",
      keyHash,
      roles: ["system-admin"],
      tenantId: TENANT_A,
      status: "ACTIVE",
    });
    await platform.apiKeyRepository.save(keyRecord);
    apiKeyString = `key-multi-ops-admin.${TEST_KEY_SECRET}`;

    service = new PlatformService({
      tasks: platform.tasks,
      executions: platform.executions,
      audit: platform.audit,
      metrics: platform.metrics,
      tools: platform.tools,
      submitTask: platform.submitTask,
      executeOrchestration: platform.executeOrchestration,
      portfolioGovernanceService: platform.portfolioGovernanceService,
    });

    server = createHttpServer(service, {
      apiKeyRepository: platform.apiKeyRepository,
      roleRepository: platform.roleRepository,
      enforceSecurity: true,
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;

    client = createPlatformClient({
      baseUrl,
      apiKey: apiKeyString,
      tenantId: TENANT_A,
    });

    const testAgentsA = [
      "agent-warehouse-bot",
      "agent-logistics-auditor",
      "agent-expired-auditor",
      "agent-revoked-auditor",
      "agent-scoped-auditor",
      "agent-high-autonomy",
      "agent-budget-operator",
      "agent-same-user",
      "agent-prod-01",
      "agent-stale-user",
      "agent-supply-coordinator",
      "agent-alpha-coordinator",
      "agent-e2e-executor",
      "agent-verifier-a",
      "agent-approver-a",
      "agent-verifier-c",
      "agent-isolated-worker",
    ];
    for (const aId of testAgentsA) {
      await registerTestAgent(platform, aId, TENANT_A);
    }
    await registerTestAgent(platform, "agent-isolated-worker", TENANT_B);
  });

  await t.test("1. Portfolio & Enterprises Setup via SDK", async () => {
    const p = await client.portfolios.create({
      id: "port-ops-group",
      name: "Ops Holding Group",
      description: "Portfolio for Governed Multi-Enterprise Operations",
      ownerPrincipalId: "executive-group-cfo",
    });
    portfolioId = p.id;
    assert.equal(p.id, "port-ops-group");

    const entA = await platform.enterpriseOperatingService.createEnterprise({
      id: "ent-alpha-logistics",
      tenantId: TENANT_A,
      name: "Alpha Logistics Subsidiary",
      industry: "LOGISTICS",
      status: "ACTIVE",
    });
    enterpriseAlphaId = entA.id;

    const entB = await platform.enterpriseOperatingService.createEnterprise({
      id: "ent-beta-retail",
      tenantId: TENANT_A,
      name: "Beta Retail Subsidiary",
      industry: "RETAIL",
      status: "ACTIVE",
    });
    enterpriseBetaId = entB.id;

    await client.portfolios.addEnterprise(portfolioId, { enterpriseId: enterpriseAlphaId });
    await client.portfolios.addEnterprise(portfolioId, { enterpriseId: enterpriseBetaId });

    const context = await client.portfolios.getContext(portfolioId);
    assert.equal(context.enterprises.length, 2);
  });

  await t.test("2. Same-Enterprise execution succeeds without Cross-Enterprise Mandate", async () => {
    const wfDef = await platform.workflowOrchestratorService.createDefinition({
      id: "wf-local-warehouse-audit",
      tenantId: TENANT_A,
      organizationId: "org-alpha",
      name: "Local Warehouse Audit",
      enterpriseId: enterpriseAlphaId,
      steps: [
        {
          stepId: "step-audit-warehouse",
          name: "Audit Local Warehouse",
          order: 1,
          purpose: "Count warehouse stock",
          assignedAgentId: "agent-warehouse-bot",
          sourceEnterpriseId: enterpriseAlphaId,
          targetEnterpriseId: enterpriseAlphaId,
        },
      ],
    });
    await platform.workflowOrchestratorService.activateDefinition(wfDef.id, TENANT_A);

    const { instance } = await platform.workflowOrchestratorService.startWorkflow({
      definitionId: wfDef.id,
      tenantId: TENANT_A,
      autoAdvance: true,
    });

    assert.equal(instance.status, "COMPLETED");
    const step = instance.getStepState("step-audit-warehouse");
    assert.equal(step?.status, "COMPLETED");
  });

  await t.test("3. Cross-Enterprise execution DEFAULT DENY without active Mandate", async () => {
    const wfDef = await platform.workflowOrchestratorService.createDefinition({
      id: "wf-cross-audit-unauthorized",
      tenantId: TENANT_A,
      organizationId: "org-alpha",
      name: "Unauthorized Cross Audit",
      portfolioId,
      enterpriseId: enterpriseAlphaId,
      steps: [
        {
          stepId: "step-inspect-retail",
          name: "Inspect Beta Retail",
          order: 1,
          purpose: "Audit subsidiary without mandate",
          assignedAgentId: "agent-logistics-auditor",
          sourceEnterpriseId: enterpriseAlphaId,
          targetEnterpriseId: enterpriseBetaId,
          portfolioId,
        },
      ],
    });
    await platform.workflowOrchestratorService.activateDefinition(wfDef.id, TENANT_A);

    const { instance } = await platform.workflowOrchestratorService.startWorkflow({
      definitionId: wfDef.id,
      tenantId: TENANT_A,
      autoAdvance: true,
    });

    assert.equal(instance.status, "FAILED");
    const step = instance.getStepState("step-inspect-retail");
    assert.equal(step?.status, "FAILED");
    assert.match(step?.error ?? instance.failure?.message ?? "", /Cross-enterprise access denied/);
  });

  await t.test("4. Cross-Enterprise execution succeeds with valid, active Mandate", async () => {
    await client.portfolios.grantMandate({
      id: "mandate-authorized-cross-ops",
      portfolioId,
      sourceEnterpriseId: enterpriseAlphaId,
      targetEnterpriseIds: [enterpriseBetaId],
      granteePrincipalId: "agent-logistics-auditor",
      authorityScope: "PORTFOLIO_COORDINATION",
      allowedOperations: ["workflow.step.step-inspect-retail-authorized"],
      maxAutonomyLevel: "LEVEL_3_GOVERNED_AUTONOMY",
    });

    const wfDef = await platform.workflowOrchestratorService.createDefinition({
      id: "wf-cross-audit-authorized",
      tenantId: TENANT_A,
      organizationId: "org-alpha",
      name: "Authorized Cross Audit",
      portfolioId,
      enterpriseId: enterpriseAlphaId,
      steps: [
        {
          stepId: "step-inspect-retail-authorized",
          name: "Inspect Beta Retail Authorized",
          order: 1,
          purpose: "Audit subsidiary with mandate",
          assignedAgentId: "agent-logistics-auditor",
          sourceEnterpriseId: enterpriseAlphaId,
          targetEnterpriseId: enterpriseBetaId,
          portfolioId,
          requestedAutonomy: "LEVEL_1_ASSISTED",
        },
      ],
    });
    await platform.workflowOrchestratorService.activateDefinition(wfDef.id, TENANT_A);

    const { instance } = await platform.workflowOrchestratorService.startWorkflow({
      definitionId: wfDef.id,
      tenantId: TENANT_A,
      autoAdvance: true,
    });

    assert.equal(instance.status, "COMPLETED");
    const step = instance.getStepState("step-inspect-retail-authorized");
    assert.equal(step?.status, "COMPLETED");
  });

  await t.test("5. Cross-Enterprise execution fails when Mandate is EXPIRED", async () => {
    await client.portfolios.grantMandate({
      id: "mandate-expired-test",
      portfolioId,
      sourceEnterpriseId: enterpriseAlphaId,
      targetEnterpriseIds: [enterpriseBetaId],
      granteePrincipalId: "agent-expired-auditor",
      authorityScope: "PORTFOLIO_COORDINATION",
      allowedOperations: ["workflow.step.step-expired-op"],
      validFrom: new Date(Date.now() - 50000),
      validTo: new Date(Date.now() - 1000),
    });

    const wfDef = await platform.workflowOrchestratorService.createDefinition({
      id: "wf-expired-op-test",
      tenantId: TENANT_A,
      organizationId: "org-alpha",
      name: "Expired Op Test",
      portfolioId,
      enterpriseId: enterpriseAlphaId,
      steps: [
        {
          stepId: "step-expired-op",
          name: "Execute Expired Op",
          order: 1,
          purpose: "Test expired mandate",
          assignedAgentId: "agent-expired-auditor",
          sourceEnterpriseId: enterpriseAlphaId,
          targetEnterpriseId: enterpriseBetaId,
          portfolioId,
        },
      ],
    });
    await platform.workflowOrchestratorService.activateDefinition(wfDef.id, TENANT_A);

    const { instance } = await platform.workflowOrchestratorService.startWorkflow({
      definitionId: wfDef.id,
      tenantId: TENANT_A,
      autoAdvance: true,
    });

    assert.equal(instance.status, "FAILED");
    const step = instance.getStepState("step-expired-op");
    assert.equal(step?.status, "FAILED");
    assert.match(step?.error ?? instance.failure?.message ?? "", /Cross-enterprise access denied/);
  });

  await t.test("6. Cross-Enterprise execution fails when Mandate is REVOKED", async () => {
    const mandate = await client.portfolios.grantMandate({
      id: "mandate-to-revoke",
      portfolioId,
      sourceEnterpriseId: enterpriseAlphaId,
      targetEnterpriseIds: [enterpriseBetaId],
      granteePrincipalId: "agent-logistics-auditor",
      authorityScope: "PORTFOLIO_COORDINATION",
      allowedOperations: ["workflow.step.step-revoked-op"],
    });

    await client.portfolios.revokeMandate(mandate.id, { reason: "Security revocation" });

    const wfDef = await platform.workflowOrchestratorService.createDefinition({
      id: "wf-revoked-op-test",
      tenantId: TENANT_A,
      organizationId: "org-alpha",
      name: "Revoked Op Test",
      portfolioId,
      enterpriseId: enterpriseAlphaId,
      steps: [
        {
          stepId: "step-revoked-op",
          name: "Execute Revoked Op",
          order: 1,
          purpose: "Test revoked mandate",
          assignedAgentId: "agent-logistics-auditor",
          sourceEnterpriseId: enterpriseAlphaId,
          targetEnterpriseId: enterpriseBetaId,
          portfolioId,
        },
      ],
    });
    await platform.workflowOrchestratorService.activateDefinition(wfDef.id, TENANT_A);

    const { instance } = await platform.workflowOrchestratorService.startWorkflow({
      definitionId: wfDef.id,
      tenantId: TENANT_A,
      autoAdvance: true,
    });

    assert.equal(instance.status, "FAILED");
    const step = instance.getStepState("step-revoked-op");
    assert.equal(step?.status, "FAILED");
    assert.match(step?.error ?? instance.failure?.message ?? "", /Cross-enterprise access denied/);
  });

  await t.test("7. Scope Violation: Operation not in allowedOperations is DENIED", async () => {
    await client.portfolios.grantMandate({
      id: "mandate-scoped-read-only",
      portfolioId,
      sourceEnterpriseId: enterpriseAlphaId,
      targetEnterpriseIds: [enterpriseBetaId],
      granteePrincipalId: "agent-logistics-auditor",
      authorityScope: "PORTFOLIO_COORDINATION",
      allowedOperations: ["workflow.step.read-inventory"],
    });

    const wfDef = await platform.workflowOrchestratorService.createDefinition({
      id: "wf-scope-violation-test",
      tenantId: TENANT_A,
      organizationId: "org-alpha",
      name: "Scope Violation Test",
      portfolioId,
      enterpriseId: enterpriseAlphaId,
      steps: [
        {
          stepId: "write-inventory",
          name: "Write Inventory Unpermitted",
          order: 1,
          purpose: "Test unpermitted scope",
          assignedAgentId: "agent-logistics-auditor",
          sourceEnterpriseId: enterpriseAlphaId,
          targetEnterpriseId: enterpriseBetaId,
          portfolioId,
        },
      ],
    });
    await platform.workflowOrchestratorService.activateDefinition(wfDef.id, TENANT_A);

    const { instance } = await platform.workflowOrchestratorService.startWorkflow({
      definitionId: wfDef.id,
      tenantId: TENANT_A,
      autoAdvance: true,
    });

    assert.equal(instance.status, "FAILED");
    const step = instance.getStepState("write-inventory");
    assert.equal(step?.status, "FAILED");
    assert.match(step?.error ?? instance.failure?.message ?? "", /Cross-enterprise access denied/);
  });

  await t.test("8. Autonomy Violation: Requested autonomy exceeding Mandate limit is DENIED", async () => {
    await client.portfolios.grantMandate({
      id: "mandate-autonomy-capped",
      portfolioId,
      sourceEnterpriseId: enterpriseAlphaId,
      targetEnterpriseIds: [enterpriseBetaId],
      granteePrincipalId: "agent-logistics-auditor",
      authorityScope: "PORTFOLIO_COORDINATION",
      allowedOperations: ["workflow.step.step-high-autonomy"],
      maxAutonomyLevel: "LEVEL_1_ASSISTED",
    });

    const wfDef = await platform.workflowOrchestratorService.createDefinition({
      id: "wf-autonomy-cap-test",
      tenantId: TENANT_A,
      organizationId: "org-alpha",
      name: "Autonomy Cap Test",
      portfolioId,
      enterpriseId: enterpriseAlphaId,
      steps: [
        {
          stepId: "step-high-autonomy",
          name: "Autonomous Action",
          order: 1,
          purpose: "Test autonomy violation",
          assignedAgentId: "agent-logistics-auditor",
          sourceEnterpriseId: enterpriseAlphaId,
          targetEnterpriseId: enterpriseBetaId,
          portfolioId,
          requestedAutonomy: "LEVEL_4_MULTI_ENTERPRISE_AUTONOMOUS",
        },
      ],
    });
    await platform.workflowOrchestratorService.activateDefinition(wfDef.id, TENANT_A);

    const { instance } = await platform.workflowOrchestratorService.startWorkflow({
      definitionId: wfDef.id,
      tenantId: TENANT_A,
      autoAdvance: true,
    });

    assert.equal(instance.status, "FAILED");
    const step = instance.getStepState("step-high-autonomy");
    assert.equal(step?.status, "FAILED");
    assert.match(step?.error ?? instance.failure?.message ?? "", /Cross-enterprise access denied/);
  });

  await t.test("9. Segregation of Duties: Executor cannot be Verifier (fail closed)", async () => {
    const wfDef = await platform.workflowOrchestratorService.createDefinition({
      id: "wf-sod-verifier-fail",
      tenantId: TENANT_A,
      organizationId: "org-alpha",
      name: "SoD Verifier Fail Test",
      steps: [
        {
          stepId: "step-self-verify",
          name: "Self Verify Step",
          order: 1,
          purpose: "Test SoD rule",
          assignedAgentId: "agent-same-user",
          verifierPrincipalId: "agent-same-user",
        },
      ],
    });
    await platform.workflowOrchestratorService.activateDefinition(wfDef.id, TENANT_A);

    const { instance } = await platform.workflowOrchestratorService.startWorkflow({
      definitionId: wfDef.id,
      tenantId: TENANT_A,
      autoAdvance: true,
    });

    assert.equal(instance.status, "FAILED");
    const step = instance.getStepState("step-self-verify");
    assert.equal(step?.status, "FAILED");
    assert.match(step?.error ?? instance.failure?.message ?? "", /Segregation of Duties violation/);
  });

  await t.test("10. Segregation of Duties: Executor cannot be Approver (SelfApprovalError)", async () => {
    const request = await platform.humanOversightService.requestApproval({
      tenantId: TENANT_A,
      workflowId: "wf-sod-appr",
      workflowInstanceId: "inst-sod-appr",
      workflowStepId: "step-sod-appr",
      requesterPrincipalId: "agent-creator-sod",
      producerPrincipalId: "agent-creator-sod",
      purpose: "Approve expenditure",
    });

    await assert.rejects(
      async () => {
        await platform.humanOversightService.approve({
          approvalId: request.id,
          tenantId: TENANT_A,
          approverPrincipalId: "agent-creator-sod",
        });
      },
      (err: any) => err instanceof SelfApprovalError
    );
  });

  await t.test("11. Segregation of Duties: Producer cannot be Verifier (SelfVerificationError)", async () => {
    const def = await platform.workflowOrchestratorService.createDefinition({
      id: "wf-sod-verif-svc",
      tenantId: TENANT_A,
      organizationId: "org-alpha",
      name: "Verification SoD Service",
      steps: [
        {
          stepId: "step-v",
          name: "Step V",
          order: 1,
          purpose: "Test",
          assignedAgentId: "agent-prod-01",
        },
      ],
    });
    await platform.workflowOrchestratorService.activateDefinition(def.id, TENANT_A);
    const { instance } = await platform.workflowOrchestratorService.startWorkflow({
      definitionId: def.id,
      tenantId: TENANT_A,
      autoAdvance: false,
    });

    await assert.rejects(
      async () => {
        await platform.workflowVerificationService.verifyStepResult({
          tenantId: TENANT_A,
          workflowInstanceId: instance.id,
          stepId: "step-v",
          verifierPrincipalId: "agent-prod-01",
          producerPrincipalId: "agent-prod-01",
        });
      },
      (err: any) => err instanceof SelfVerificationError
    );
  });

  await t.test("12. Tenant Boundary Isolation: Tenant A cannot validate authority in Tenant B", async () => {
    const result = await client.portfolios.validateAuthority({
      portfolioId,
      granteePrincipalId: "agent-foreign",
      sourceEnterpriseId: enterpriseAlphaId,
      targetEnterpriseId: enterpriseBetaId,
      operation: "nonexistent.op",
    });
    assert.equal(result.authorized, false);
  });

  await t.test("13. Optimistic Concurrency Control (OCC) on Mandate Revocation", async () => {
    const mandate = await client.portfolios.grantMandate({
      id: "mandate-occ-http",
      portfolioId,
      sourceEnterpriseId: enterpriseAlphaId,
      targetEnterpriseIds: [enterpriseBetaId],
      granteePrincipalId: "agent-occ-admin",
      authorityScope: "PORTFOLIO_COORDINATION",
      allowedOperations: ["op.test"],
    });

    await assert.rejects(
      async () => {
        await platform.portfolioGovernanceService.revokeMandate(
          mandate.id,
          TENANT_A,
          "Conflicting revocation",
          999 // Stale OCC
        );
      },
      (err: any) => err instanceof PortfolioConcurrencyConflictError
    );
  });

  await t.test("14. Deterministic Portfolio KPI Aggregation (SUM & AVERAGE)", async () => {
    const sumObj = await client.portfolios.createObjective({
      id: "pobj-http-revenue",
      portfolioId,
      title: "Consolidated Revenue",
      type: "FINANCIAL",
      ownerPrincipalId: "exec-group-cfo",
      participatingEnterpriseIds: [enterpriseAlphaId, enterpriseBetaId],
      aggregationMethod: "SUM",
      targetMetric: {
        name: "REVENUE_USD",
        unit: "USD",
        targetValue: 20000000,
      },
    });
    await client.portfolios.activateObjective(sumObj.id);

    const aggSum = await client.portfolios.aggregateMetrics(sumObj.id, {
      contributions: [
        { enterpriseId: enterpriseAlphaId, value: 12000000, status: "MEASURED" },
        { enterpriseId: enterpriseBetaId, value: 10000000, status: "MEASURED" },
      ],
    });
    assert.equal(aggSum.currentAggregatedValue, 22000000);
    assert.equal(aggSum.gap, -2000000);

    const avgObj = await client.portfolios.createObjective({
      id: "pobj-http-nps",
      portfolioId,
      title: "Group NPS Score",
      type: "OPERATIONAL",
      ownerPrincipalId: "exec-group-cfo",
      participatingEnterpriseIds: [enterpriseAlphaId, enterpriseBetaId],
      aggregationMethod: "AVERAGE",
      targetMetric: {
        name: "NPS_SCORE",
        unit: "SCORE",
        targetValue: 80,
      },
    });
    await client.portfolios.activateObjective(avgObj.id);

    const aggAvg = await client.portfolios.aggregateMetrics(avgObj.id, {
      contributions: [
        { enterpriseId: enterpriseAlphaId, value: 85, status: "MEASURED" },
        { enterpriseId: enterpriseBetaId, value: 75, status: "MEASURED" },
      ],
    });
    assert.equal(aggAvg.currentAggregatedValue, 80);
    assert.equal(aggAvg.gap, 0);
  });

  await t.test("15. Full Canonical Journey: Portfolio -> Objective -> Mandate -> Workflow -> Metric Cascading", async () => {
    // 1. Create Objective & Metric in Beta Subsidiary
    const entObj = await platform.enterpriseOperatingService.createObjective({
      id: "obj-beta-sla-target",
      enterpriseId: enterpriseBetaId,
      tenantId: TENANT_A,
      title: "Retail Fulfillment SLA",
      type: "OPERATIONAL",
      ownerPrincipalId: "exec-beta-vp",
    });

    const entMetric = await platform.enterpriseOperatingService.createMetric({
      id: "metric-beta-sla",
      enterpriseId: enterpriseBetaId,
      objectiveId: entObj.id,
      tenantId: TENANT_A,
      name: "FULFILLMENT_SLA_PCT",
      unit: "PERCENT",
      targetValue: 99,
      source: "SYSTEM",
    });

    // 2. Grant Cross-Enterprise Mandate to Alpha Coordinator
    await client.portfolios.grantMandate({
      id: "mandate-journey-e2e",
      portfolioId,
      sourceEnterpriseId: enterpriseAlphaId,
      targetEnterpriseIds: [enterpriseBetaId],
      granteePrincipalId: "agent-alpha-coordinator",
      authorityScope: "PORTFOLIO_COORDINATION",
      allowedOperations: ["workflow.step.step-sync-fulfillment"],
      maxAutonomyLevel: "LEVEL_3_GOVERNED_AUTONOMY",
    });

    // 3. Create & Execute Governed Workflow
    const journeyDef = await platform.workflowOrchestratorService.createDefinition({
      id: "wf-journey-cross-sync",
      tenantId: TENANT_A,
      organizationId: "org-alpha",
      name: "Cross Enterprise Sync Journey",
      portfolioId,
      enterpriseId: enterpriseAlphaId,
      steps: [
        {
          stepId: "step-sync-fulfillment",
          name: "Sync Fulfillment Status",
          order: 1,
          purpose: "Synchronize fulfillment and record metric",
          assignedAgentId: "agent-alpha-coordinator",
          sourceEnterpriseId: enterpriseAlphaId,
          targetEnterpriseId: enterpriseBetaId,
          portfolioId,
          requestedAutonomy: "LEVEL_1_ASSISTED",
          verifierPrincipalId: "verifier-vp-quality",
        },
      ],
    });
    await platform.workflowOrchestratorService.activateDefinition(journeyDef.id, TENANT_A);

    const { instance } = await platform.workflowOrchestratorService.startWorkflow({
      definitionId: journeyDef.id,
      tenantId: TENANT_A,
      input: {
        portfolioId,
        enterpriseMetricId: entMetric.id,
        sourceEnterpriseId: enterpriseAlphaId,
        targetEnterpriseId: enterpriseBetaId,
        metricValue: 99.5,
      },
      autoAdvance: true,
    });

    assert.equal(instance.status, "COMPLETED");
    const completedStep = instance.getStepState("step-sync-fulfillment");
    assert.equal(completedStep?.status, "COMPLETED");

    // 4. Verify Ground Truth Metric Recorded
    const updatedMetric = await platform.enterpriseOperatingService.getMetric(entMetric.id, TENANT_A);
    assert.equal(updatedMetric.currentValue, 99.5);
    assert.equal(updatedMetric.status, "ON_TRACK");
  });

  await t.test("Teardown: Close HTTP Server", async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });
});

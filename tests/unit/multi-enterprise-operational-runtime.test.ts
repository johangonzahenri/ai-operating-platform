/**
 * Phase 76 Unit Test Suite: Multi-Enterprise Operational Runtime & Governed Execution
 *
 * Validates the full canonical chain:
 * Portfolio -> Enterprise -> Objective -> Initiative -> Workflow -> Plan ->
 * Mandate -> Policy -> Scope -> Budget -> Assignment -> Execution ->
 * Verification -> Approval -> Metric -> Portfolio Aggregation -> Audit / Events
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createPlatform } from "../../src/interfaces/composition.js";
import { SelfVerificationError } from "../../src/domain/workflow/verification-errors.js";
import { SelfApprovalError } from "../../src/domain/workflow/approval-errors.js";
import { PortfolioConcurrencyConflictError } from "../../src/domain/portfolio/portfolio-errors.js";
import { AgentProfile } from "../../src/domain/organization/agent-profile.js";
import { AgentMembership } from "../../src/domain/organization/agent-membership.js";
import { Organization } from "../../src/domain/organization/organization.js";
import { Area } from "../../src/domain/organization/area.js";
import { Team } from "../../src/domain/organization/team.js";
import { TeamResourceBudget } from "../../src/domain/organization/team-resource-budget.js";

async function registerTestAgent(platform: ReturnType<typeof createPlatform>, agentId: string, tenantId: string = "tenant-holdings-alpha") {
  const org = Organization.create({ id: "org-alpha", name: "Alpha Org", tenantId });
  await platform.organizationRepository.saveOrganization(org);

  const area = Area.create({ id: "area-alpha", organizationId: "org-alpha", name: "Alpha Area", tenantId });
  await platform.organizationRepository.saveArea(area);

  const team = Team.create({ id: "team-alpha", areaId: "area-alpha", organizationId: "org-alpha", name: "Alpha Team", tenantId });
  await platform.organizationRepository.saveTeam(team);

  const budget = TeamResourceBudget.create({
    teamId: "team-alpha",
    organizationId: "org-alpha",
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
    organizationId: "org-alpha",
    teamId: "team-alpha",
    role: "OPERATOR",
    responsibilities: ["audit", "execution"],
    capabilities: [
      { id: "cap-exec", name: "Execution", description: "Exec capability", status: "VERIFIED" },
    ],
  });
  await platform.agentProfileRepository.save(profile);

  const membership = AgentMembership.create({
    id: `mem-${agentId}`,
    teamId: "team-alpha",
    agentId,
    organizationId: "org-alpha",
    tenantId,
    role: "OPERATOR",
  });
  await platform.organizationRepository.saveMembership(membership);
}

test("Phase 76 — Multi-Enterprise Operational Runtime & Governed Execution (Unit)", async (t) => {
  const TENANT_A = "tenant-holdings-alpha";
  const TENANT_B = "tenant-holdings-beta";

  await t.test("1. Same-Enterprise execution succeeds without Cross-Enterprise Mandate", async () => {
    const platform = createPlatform();
    await registerTestAgent(platform, "agent-stock-counter", TENANT_A);

    // 1. Create Enterprise
    const enterprise = await platform.enterpriseOperatingService.createEnterprise({
      id: "ent-alpha-retail",
      tenantId: TENANT_A,
      name: "Alpha Retail Corp",
      industry: "RETAIL",
      status: "ACTIVE",
    });

    // 2. Create Workflow Definition inside same enterprise
    const workflowDef = await platform.workflowOrchestratorService.createDefinition({
      id: "wf-local-inventory",
      tenantId: TENANT_A,
      organizationId: "org-alpha",
      name: "Local Inventory Count",
      enterpriseId: enterprise.id,
      steps: [
        {
          stepId: "step-count",
          name: "Count Stock",
          order: 1,
          purpose: "Count stock in retail store",
          assignedAgentId: "agent-stock-counter",
          sourceEnterpriseId: enterprise.id,
          targetEnterpriseId: enterprise.id,
        },
      ],
    });
    await platform.workflowOrchestratorService.activateDefinition(workflowDef.id, TENANT_A);

    // 3. Start & Advance Workflow
    const { instance } = await platform.workflowOrchestratorService.startWorkflow({
      definitionId: workflowDef.id,
      tenantId: TENANT_A,
      autoAdvance: true,
    });

    assert.equal(instance.status, "COMPLETED");
    const stepState = instance.getStepState("step-count");
    assert.equal(stepState?.status, "COMPLETED");
  });

  await t.test("2. Cross-Enterprise execution: DEFAULT DENY without active mandate", async () => {
    const platform = createPlatform();
    await registerTestAgent(platform, "agent-retail-auditor", TENANT_A);

    // 1. Create Portfolio & 2 Enterprises
    const portfolio = await platform.portfolioGovernanceService.createPortfolio({
      id: "port-group-01",
      tenantId: TENANT_A,
      name: "Group Holding",
      description: "Holding for retail and logistics",
      ownerPrincipalId: "exec-group-cfo",
    });

    await platform.portfolioGovernanceService.addEnterpriseToPortfolio(portfolio.id, TENANT_A, {
      enterpriseId: "ent-alpha-retail",
    });
    await platform.portfolioGovernanceService.addEnterpriseToPortfolio(portfolio.id, TENANT_A, {
      enterpriseId: "ent-beta-logistics",
    });

    // 2. Create Cross-Enterprise Workflow without granting a mandate
    const workflowDef = await platform.workflowOrchestratorService.createDefinition({
      id: "wf-cross-audit-unauthorized",
      tenantId: TENANT_A,
      organizationId: "org-alpha",
      name: "Unauthorized Cross Audit",
      portfolioId: portfolio.id,
      enterpriseId: "ent-alpha-retail",
      steps: [
        {
          stepId: "step-logistics-audit",
          name: "Audit Logistics Hub",
          order: 1,
          purpose: "Inspect logistics operations",
          assignedAgentId: "agent-retail-auditor",
          sourceEnterpriseId: "ent-alpha-retail",
          targetEnterpriseId: "ent-beta-logistics",
          portfolioId: portfolio.id,
        },
      ],
    });
    await platform.workflowOrchestratorService.activateDefinition(workflowDef.id, TENANT_A);

    // 3. Advance workflow -> Must fail closed
    const { instance } = await platform.workflowOrchestratorService.startWorkflow({
      definitionId: workflowDef.id,
      tenantId: TENANT_A,
      autoAdvance: true,
    });

    assert.equal(instance.status, "FAILED");
    const stepState = instance.getStepState("step-logistics-audit");
    assert.equal(stepState?.status, "FAILED");
    assert.match(stepState?.error ?? instance.failure?.message ?? "", /Cross-enterprise access denied/);
  });

  await t.test("3. Cross-Enterprise execution succeeds with valid, active Mandate", async () => {
    const platform = createPlatform();
    await registerTestAgent(platform, "agent-retail-auditor", TENANT_A);

    // 1. Setup Portfolio & Enterprises
    const portfolio = await platform.portfolioGovernanceService.createPortfolio({
      id: "port-group-02",
      tenantId: TENANT_A,
      name: "Group Holding 02",
      description: "Holding",
      ownerPrincipalId: "exec-group-cfo",
    });
    await platform.portfolioGovernanceService.addEnterpriseToPortfolio(portfolio.id, TENANT_A, { enterpriseId: "ent-alpha-retail" });
    await platform.portfolioGovernanceService.addEnterpriseToPortfolio(portfolio.id, TENANT_A, { enterpriseId: "ent-beta-logistics" });

    // 2. Grant Valid Mandate
    await platform.portfolioGovernanceService.grantMandate({
      id: "mandate-authorized-audit",
      tenantId: TENANT_A,
      portfolioId: portfolio.id,
      sourceEnterpriseId: "ent-alpha-retail",
      targetEnterpriseIds: ["ent-beta-logistics"],
      granteePrincipalId: "agent-retail-auditor",
      authorityScope: "EXECUTIVE_AUDIT",
      allowedOperations: ["workflow.step.step-logistics-audit"],
      maxAutonomyLevel: "LEVEL_3_GOVERNED_AUTONOMY",
    });

    // 3. Create & Execute Cross-Enterprise Workflow
    const workflowDef = await platform.workflowOrchestratorService.createDefinition({
      id: "wf-cross-audit-authorized",
      tenantId: TENANT_A,
      organizationId: "org-alpha",
      name: "Authorized Cross Audit",
      portfolioId: portfolio.id,
      enterpriseId: "ent-alpha-retail",
      steps: [
        {
          stepId: "step-logistics-audit",
          name: "Audit Logistics Hub",
          order: 1,
          purpose: "Inspect logistics operations",
          assignedAgentId: "agent-retail-auditor",
          sourceEnterpriseId: "ent-alpha-retail",
          targetEnterpriseId: "ent-beta-logistics",
          portfolioId: portfolio.id,
          requestedAutonomy: "LEVEL_1_ASSISTED",
        },
      ],
    });
    await platform.workflowOrchestratorService.activateDefinition(workflowDef.id, TENANT_A);

    const { instance } = await platform.workflowOrchestratorService.startWorkflow({
      definitionId: workflowDef.id,
      tenantId: TENANT_A,
      autoAdvance: true,
    });

    assert.equal(instance.status, "COMPLETED");
    const stepState = instance.getStepState("step-logistics-audit");
    assert.equal(stepState?.status, "COMPLETED");
  });

  await t.test("4. Cross-Enterprise execution fails when Mandate is EXPIRED", async () => {
    const platform = createPlatform();
    await registerTestAgent(platform, "agent-retail-auditor", TENANT_A);

    const portfolio = await platform.portfolioGovernanceService.createPortfolio({
      id: "port-group-03",
      tenantId: TENANT_A,
      name: "Group Holding 03",
      description: "Holding",
      ownerPrincipalId: "exec-group-cfo",
    });
    await platform.portfolioGovernanceService.addEnterpriseToPortfolio(portfolio.id, TENANT_A, { enterpriseId: "ent-alpha-retail" });
    await platform.portfolioGovernanceService.addEnterpriseToPortfolio(portfolio.id, TENANT_A, { enterpriseId: "ent-beta-logistics" });

    // Grant Expired Mandate (valid in the past)
    await platform.portfolioGovernanceService.grantMandate({
      id: "mandate-expired-01",
      tenantId: TENANT_A,
      portfolioId: portfolio.id,
      sourceEnterpriseId: "ent-alpha-retail",
      targetEnterpriseIds: ["ent-beta-logistics"],
      granteePrincipalId: "agent-retail-auditor",
      authorityScope: "EXECUTIVE_AUDIT",
      allowedOperations: ["workflow.step.step-expired-test"],
      validFrom: new Date(Date.now() - 100000),
      validTo: new Date(Date.now() - 1000), // Expired
    });

    const workflowDef = await platform.workflowOrchestratorService.createDefinition({
      id: "wf-expired-mandate-test",
      tenantId: TENANT_A,
      organizationId: "org-alpha",
      name: "Expired Mandate Test",
      portfolioId: portfolio.id,
      enterpriseId: "ent-alpha-retail",
      steps: [
        {
          stepId: "step-expired-test",
          name: "Expired Test",
          order: 1,
          purpose: "Test",
          assignedAgentId: "agent-retail-auditor",
          sourceEnterpriseId: "ent-alpha-retail",
          targetEnterpriseId: "ent-beta-logistics",
          portfolioId: portfolio.id,
        },
      ],
    });
    await platform.workflowOrchestratorService.activateDefinition(workflowDef.id, TENANT_A);

    const { instance } = await platform.workflowOrchestratorService.startWorkflow({
      definitionId: workflowDef.id,
      tenantId: TENANT_A,
      autoAdvance: true,
    });

    assert.equal(instance.status, "FAILED");
    assert.match(instance.getStepState("step-expired-test")?.error ?? instance.failure?.message ?? "", /Cross-enterprise access denied/);
  });

  await t.test("5. Cross-Enterprise execution fails when Mandate is REVOKED", async () => {
    const platform = createPlatform();
    await registerTestAgent(platform, "agent-retail-auditor", TENANT_A);

    const portfolio = await platform.portfolioGovernanceService.createPortfolio({
      id: "port-group-04",
      tenantId: TENANT_A,
      name: "Group Holding 04",
      description: "Holding",
      ownerPrincipalId: "exec-group-cfo",
    });
    await platform.portfolioGovernanceService.addEnterpriseToPortfolio(portfolio.id, TENANT_A, { enterpriseId: "ent-alpha-retail" });
    await platform.portfolioGovernanceService.addEnterpriseToPortfolio(portfolio.id, TENANT_A, { enterpriseId: "ent-beta-logistics" });

    // Grant then revoke mandate
    const mandate = await platform.portfolioGovernanceService.grantMandate({
      id: "mandate-revoked-01",
      tenantId: TENANT_A,
      portfolioId: portfolio.id,
      sourceEnterpriseId: "ent-alpha-retail",
      targetEnterpriseIds: ["ent-beta-logistics"],
      granteePrincipalId: "agent-retail-auditor",
      authorityScope: "EXECUTIVE_AUDIT",
      allowedOperations: ["workflow.step.step-revoked-test"],
    });

    await platform.portfolioGovernanceService.revokeMandate(mandate.id, TENANT_A, "Revocation by CFO");

    const workflowDef = await platform.workflowOrchestratorService.createDefinition({
      id: "wf-revoked-mandate-test",
      tenantId: TENANT_A,
      organizationId: "org-alpha",
      name: "Revoked Mandate Test",
      portfolioId: portfolio.id,
      enterpriseId: "ent-alpha-retail",
      steps: [
        {
          stepId: "step-revoked-test",
          name: "Revoked Test",
          order: 1,
          purpose: "Test",
          assignedAgentId: "agent-retail-auditor",
          sourceEnterpriseId: "ent-alpha-retail",
          targetEnterpriseId: "ent-beta-logistics",
          portfolioId: portfolio.id,
        },
      ],
    });
    await platform.workflowOrchestratorService.activateDefinition(workflowDef.id, TENANT_A);

    const { instance } = await platform.workflowOrchestratorService.startWorkflow({
      definitionId: workflowDef.id,
      tenantId: TENANT_A,
      autoAdvance: true,
    });

    assert.equal(instance.status, "FAILED");
    assert.match(instance.getStepState("step-revoked-test")?.error ?? instance.failure?.message ?? "", /Cross-enterprise access denied/);
  });

  await t.test("6. Scope Violation: Operation not in Mandate allowedOperations is DENIED", async () => {
    const platform = createPlatform();
    await registerTestAgent(platform, "agent-retail-auditor", TENANT_A);

    const portfolio = await platform.portfolioGovernanceService.createPortfolio({
      id: "port-group-05",
      tenantId: TENANT_A,
      name: "Group Holding 05",
      description: "Holding",
      ownerPrincipalId: "exec-group-cfo",
    });
    await platform.portfolioGovernanceService.addEnterpriseToPortfolio(portfolio.id, TENANT_A, { enterpriseId: "ent-alpha-retail" });
    await platform.portfolioGovernanceService.addEnterpriseToPortfolio(portfolio.id, TENANT_A, { enterpriseId: "ent-beta-logistics" });

    // Mandate only allows "workflow.step.read-only"
    await platform.portfolioGovernanceService.grantMandate({
      id: "mandate-scope-test",
      tenantId: TENANT_A,
      portfolioId: portfolio.id,
      sourceEnterpriseId: "ent-alpha-retail",
      targetEnterpriseIds: ["ent-beta-logistics"],
      granteePrincipalId: "agent-retail-auditor",
      authorityScope: "EXECUTIVE_AUDIT",
      allowedOperations: ["workflow.step.read-only"],
    });

    // Workflow attempts "workflow.step.write-data"
    const workflowDef = await platform.workflowOrchestratorService.createDefinition({
      id: "wf-scope-violation-test",
      tenantId: TENANT_A,
      organizationId: "org-alpha",
      name: "Scope Violation Test",
      portfolioId: portfolio.id,
      enterpriseId: "ent-alpha-retail",
      steps: [
        {
          stepId: "write-data",
          name: "Write Sensitive Data",
          order: 1,
          purpose: "Test",
          assignedAgentId: "agent-retail-auditor",
          sourceEnterpriseId: "ent-alpha-retail",
          targetEnterpriseId: "ent-beta-logistics",
          portfolioId: portfolio.id,
        },
      ],
    });
    await platform.workflowOrchestratorService.activateDefinition(workflowDef.id, TENANT_A);

    const { instance } = await platform.workflowOrchestratorService.startWorkflow({
      definitionId: workflowDef.id,
      tenantId: TENANT_A,
      autoAdvance: true,
    });

    assert.equal(instance.status, "FAILED");
    assert.match(instance.getStepState("write-data")?.error ?? instance.failure?.message ?? "", /Cross-enterprise access denied/);
  });

  await t.test("7. Autonomy Violation: Requested autonomy exceeding Mandate limit is DENIED", async () => {
    const platform = createPlatform();
    await registerTestAgent(platform, "agent-retail-auditor", TENANT_A);

    const portfolio = await platform.portfolioGovernanceService.createPortfolio({
      id: "port-group-06",
      tenantId: TENANT_A,
      name: "Group Holding 06",
      description: "Holding",
      ownerPrincipalId: "exec-group-cfo",
    });
    await platform.portfolioGovernanceService.addEnterpriseToPortfolio(portfolio.id, TENANT_A, { enterpriseId: "ent-alpha-retail" });
    await platform.portfolioGovernanceService.addEnterpriseToPortfolio(portfolio.id, TENANT_A, { enterpriseId: "ent-beta-logistics" });

    // Mandate allows at most LEVEL_1_ASSISTED
    await platform.portfolioGovernanceService.grantMandate({
      id: "mandate-autonomy-limit",
      tenantId: TENANT_A,
      portfolioId: portfolio.id,
      sourceEnterpriseId: "ent-alpha-retail",
      targetEnterpriseIds: ["ent-beta-logistics"],
      granteePrincipalId: "agent-retail-auditor",
      authorityScope: "EXECUTIVE_AUDIT",
      allowedOperations: ["workflow.step.high-autonomy-step"],
      maxAutonomyLevel: "LEVEL_1_ASSISTED",
    });

    // Workflow requests LEVEL_4_MULTI_ENTERPRISE_AUTONOMOUS
    const workflowDef = await platform.workflowOrchestratorService.createDefinition({
      id: "wf-autonomy-violation-test",
      tenantId: TENANT_A,
      organizationId: "org-alpha",
      name: "Autonomy Violation Test",
      portfolioId: portfolio.id,
      enterpriseId: "ent-alpha-retail",
      steps: [
        {
          stepId: "high-autonomy-step",
          name: "Autonomous Execution",
          order: 1,
          purpose: "Test",
          assignedAgentId: "agent-retail-auditor",
          sourceEnterpriseId: "ent-alpha-retail",
          targetEnterpriseId: "ent-beta-logistics",
          portfolioId: portfolio.id,
          requestedAutonomy: "LEVEL_4_MULTI_ENTERPRISE_AUTONOMOUS",
        },
      ],
    });
    await platform.workflowOrchestratorService.activateDefinition(workflowDef.id, TENANT_A);

    const { instance } = await platform.workflowOrchestratorService.startWorkflow({
      definitionId: workflowDef.id,
      tenantId: TENANT_A,
      autoAdvance: true,
    });

    assert.equal(instance.status, "FAILED");
    assert.match(instance.getStepState("high-autonomy-step")?.error ?? instance.failure?.message ?? "", /Cross-enterprise access denied/);
  });

  await t.test("8. Segregation of Duties: Executor cannot be Verifier (fail closed)", async () => {
    const platform = createPlatform();
    await registerTestAgent(platform, "agent-same-identity", TENANT_A);

    const workflowDef = await platform.workflowOrchestratorService.createDefinition({
      id: "wf-sod-verifier-test",
      tenantId: TENANT_A,
      organizationId: "org-alpha",
      name: "SoD Verifier Violation Test",
      steps: [
        {
          stepId: "step-self-verify",
          name: "Self Verify Step",
          order: 1,
          purpose: "Test",
          assignedAgentId: "agent-same-identity",
          verifierPrincipalId: "agent-same-identity", // SoD Violation!
        },
      ],
    });
    await platform.workflowOrchestratorService.activateDefinition(workflowDef.id, TENANT_A);

    const { instance } = await platform.workflowOrchestratorService.startWorkflow({
      definitionId: workflowDef.id,
      tenantId: TENANT_A,
      autoAdvance: true,
    });

    assert.equal(instance.status, "FAILED");
    const stepState = instance.getStepState("step-self-verify");
    assert.equal(stepState?.status, "FAILED");
    assert.match(stepState?.error ?? instance.failure?.message ?? "", /Segregation of Duties violation/);
  });

  await t.test("9. Segregation of Duties: Executor cannot be Approver (SelfApprovalError)", async () => {
    const platform = createPlatform();

    const request = await platform.humanOversightService.requestApproval({
      tenantId: TENANT_A,
      workflowId: "wf-test-01",
      workflowInstanceId: "inst-01",
      workflowStepId: "step-01",
      requesterPrincipalId: "agent-creator-01",
      producerPrincipalId: "agent-creator-01",
      purpose: "Approve critical expenditure",
    });

    // Attempting self-approval must reject
    await assert.rejects(
      async () => {
        await platform.humanOversightService.approve({
          approvalId: request.id,
          tenantId: TENANT_A,
          approverPrincipalId: "agent-creator-01", // Producer attempting self-approval!
        });
      },
      (err: any) => err instanceof SelfApprovalError
    );
  });

  await t.test("10. Segregation of Duties: Verification Service rejects Producer = Verifier", async () => {
    const platform = createPlatform();

    // Setup workflow instance
    const def = await platform.workflowOrchestratorService.createDefinition({
      id: "wf-verif-sod",
      tenantId: TENANT_A,
      organizationId: "org-alpha",
      name: "Verification SoD",
      steps: [
        {
          stepId: "step-01",
          name: "Step 01",
          order: 1,
          purpose: "Test",
          assignedAgentId: "agent-producer",
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
          stepId: "step-01",
          verifierPrincipalId: "agent-producer", // Same as producer!
          producerPrincipalId: "agent-producer",
        });
      },
      (err: any) => err instanceof SelfVerificationError
    );
  });

  await t.test("11. Tenant Boundary Isolation: Cross-tenant mandate validation fails closed", async () => {
    const platform = createPlatform();

    // Create portfolio in Tenant A
    const portfolio = await platform.portfolioGovernanceService.createPortfolio({
      id: "port-tenant-a",
      tenantId: TENANT_A,
      name: "Tenant A Portfolio",
      description: "Tenant A",
      ownerPrincipalId: "exec-cfo-a",
    });

    // Querying under Tenant B must fail / return empty
    const listB = await platform.portfolioGovernanceService.listPortfolios(TENANT_B);
    assert.equal(listB.length, 0);

    const valResult = await platform.portfolioGovernanceService.validateCrossEnterpriseAuthority({
      tenantId: TENANT_B, // Wrong tenant
      portfolioId: portfolio.id,
      granteePrincipalId: "agent-x",
      sourceEnterpriseId: "ent-1",
      targetEnterpriseId: "ent-2",
      operation: "op",
    });

    assert.equal(valResult.authorized, false);
  });

  await t.test("12. Optimistic Concurrency Control (OCC) on Mandate Revocation", async () => {
    const platform = createPlatform();

    const portfolio = await platform.portfolioGovernanceService.createPortfolio({
      id: "port-occ-01",
      tenantId: TENANT_A,
      name: "OCC Portfolio",
      description: "OCC Test",
      ownerPrincipalId: "exec-cfo",
    });
    await platform.portfolioGovernanceService.addEnterpriseToPortfolio(portfolio.id, TENANT_A, { enterpriseId: "ent-alpha" });
    await platform.portfolioGovernanceService.addEnterpriseToPortfolio(portfolio.id, TENANT_A, { enterpriseId: "ent-beta" });

    const mandate = await platform.portfolioGovernanceService.grantMandate({
      id: "mandate-occ-test",
      tenantId: TENANT_A,
      portfolioId: portfolio.id,
      sourceEnterpriseId: "ent-alpha",
      targetEnterpriseIds: ["ent-beta"],
      granteePrincipalId: "agent-occ",
      authorityScope: "EXECUTIVE_AUDIT",
      allowedOperations: ["op.read"],
    });

    // Revocation with wrong concurrency version must throw PortfolioConcurrencyConflictError
    await assert.rejects(
      async () => {
        await platform.portfolioGovernanceService.revokeMandate(
          mandate.id,
          TENANT_A,
          "Conflicting revocation",
          999 // Stale version
        );
      },
      (err: any) => err instanceof PortfolioConcurrencyConflictError
    );
  });

  await t.test("13. Deterministic KPI Aggregation cascaded across Portfolio Objectives", async () => {
    const platform = createPlatform();

    const portfolio = await platform.portfolioGovernanceService.createPortfolio({
      id: "port-kpi-group",
      tenantId: TENANT_A,
      name: "Group Holding Financials",
      description: "KPI Aggregation test",
      ownerPrincipalId: "exec-group-cfo",
    });
    await platform.portfolioGovernanceService.addEnterpriseToPortfolio(portfolio.id, TENANT_A, { enterpriseId: "ent-subsidiary-1" });
    await platform.portfolioGovernanceService.addEnterpriseToPortfolio(portfolio.id, TENANT_A, { enterpriseId: "ent-subsidiary-2" });

    // 1. Create Portfolio Objective (SUM of Revenue)
    const objSum = await platform.portfolioGovernanceService.createPortfolioObjective({
      id: "pobj-total-revenue",
      tenantId: TENANT_A,
      portfolioId: portfolio.id,
      title: "Consolidated Revenue 2026",
      type: "FINANCIAL",
      ownerPrincipalId: "exec-group-cfo",
      participatingEnterpriseIds: ["ent-subsidiary-1", "ent-subsidiary-2"],
      aggregationMethod: "SUM",
      targetMetric: {
        name: "REVENUE_USD",
        unit: "USD",
        targetValue: 50000000,
      },
    });
    await platform.portfolioGovernanceService.activatePortfolioObjective(objSum.id, TENANT_A);

    // Aggregate with explicit measured contributions
    const aggSum = await platform.portfolioGovernanceService.aggregatePortfolioMetrics(objSum.id, TENANT_A, [
      { enterpriseId: "ent-subsidiary-1", value: 30000000, status: "MEASURED" },
      { enterpriseId: "ent-subsidiary-2", value: 25000000, status: "MEASURED" },
    ]);
    assert.equal(aggSum.currentAggregatedValue, 55000000);
    assert.equal(aggSum.gap, -5000000); // Target exceeded by 5M

    // 2. Create Portfolio Objective (AVERAGE of CSAT)
    const objAvg = await platform.portfolioGovernanceService.createPortfolioObjective({
      id: "pobj-avg-csat",
      tenantId: TENANT_A,
      portfolioId: portfolio.id,
      title: "Group Customer Satisfaction",
      type: "OPERATIONAL",
      ownerPrincipalId: "exec-group-cfo",
      participatingEnterpriseIds: ["ent-subsidiary-1", "ent-subsidiary-2"],
      aggregationMethod: "AVERAGE",
      targetMetric: {
        name: "CSAT_SCORE",
        unit: "SCORE",
        targetValue: 90,
      },
    });
    await platform.portfolioGovernanceService.activatePortfolioObjective(objAvg.id, TENANT_A);

    const aggAvg = await platform.portfolioGovernanceService.aggregatePortfolioMetrics(objAvg.id, TENANT_A, [
      { enterpriseId: "ent-subsidiary-1", value: 92, status: "MEASURED" },
      { enterpriseId: "ent-subsidiary-2", value: 88, status: "MEASURED" },
    ]);
    assert.equal(aggAvg.currentAggregatedValue, 90);
    assert.equal(aggAvg.gap, 0); // Exact target
  });

  await t.test("14. Full Governed Execution Journey: Objective -> Initiative -> Workflow -> Execution -> Metric Aggregation", async () => {
    const platform = createPlatform();
    await registerTestAgent(platform, "agent-supply-coordinator", TENANT_A);

    // 1. Portfolio & Enterprise Setup
    const portfolio = await platform.portfolioGovernanceService.createPortfolio({
      id: "port-holding-e2e",
      tenantId: TENANT_A,
      name: "Omni Group Holding",
      description: "E2E Governed Journey",
      ownerPrincipalId: "exec-group-cfo",
    });

    const entRetail = await platform.enterpriseOperatingService.createEnterprise({
      id: "ent-e2e-retail",
      tenantId: TENANT_A,
      name: "Omni Retail Subsidiary",
      industry: "RETAIL",
      status: "ACTIVE",
    });

    const entLogistics = await platform.enterpriseOperatingService.createEnterprise({
      id: "ent-e2e-logistics",
      tenantId: TENANT_A,
      name: "Omni Logistics Subsidiary",
      industry: "LOGISTICS",
      status: "ACTIVE",
    });

    await platform.portfolioGovernanceService.addEnterpriseToPortfolio(portfolio.id, TENANT_A, { enterpriseId: entRetail.id });
    await platform.portfolioGovernanceService.addEnterpriseToPortfolio(portfolio.id, TENANT_A, { enterpriseId: entLogistics.id });

    // 2. Portfolio Objective & Enterprise Objective & Metric Setup
    const pObj = await platform.portfolioGovernanceService.createPortfolioObjective({
      id: "pobj-e2e-sla",
      tenantId: TENANT_A,
      portfolioId: portfolio.id,
      title: "Group Logistics SLA Compliance",
      type: "OPERATIONAL",
      ownerPrincipalId: "exec-group-cfo",
      participatingEnterpriseIds: [entRetail.id, entLogistics.id],
      aggregationMethod: "AVERAGE",
      targetMetric: {
        name: "SLA_COMPLIANCE_PCT",
        unit: "PERCENT",
        targetValue: 95,
      },
    });
    await platform.portfolioGovernanceService.activatePortfolioObjective(pObj.id, TENANT_A);

    const entObj = await platform.enterpriseOperatingService.createObjective({
      id: "obj-logistics-sla",
      enterpriseId: entLogistics.id,
      tenantId: TENANT_A,
      title: "On-Time Dispatch SLA",
      type: "OPERATIONAL",
      ownerPrincipalId: "exec-logistics-vp",
    });

    const metric = await platform.enterpriseOperatingService.createMetric({
      id: "metric-logistics-sla",
      enterpriseId: entLogistics.id,
      objectiveId: entObj.id,
      tenantId: TENANT_A,
      name: "SLA_COMPLIANCE_PCT",
      unit: "PERCENT",
      targetValue: 95,
      source: "SYSTEM",
    });

    // 3. Grant Cross-Enterprise Governance Mandate
    await platform.portfolioGovernanceService.grantMandate({
      id: "mandate-e2e-ops",
      tenantId: TENANT_A,
      portfolioId: portfolio.id,
      sourceEnterpriseId: entRetail.id,
      targetEnterpriseIds: [entLogistics.id],
      granteePrincipalId: "agent-supply-coordinator",
      authorityScope: "PORTFOLIO_COORDINATION",
      allowedOperations: ["workflow.step.step-optimize-routes"],
      maxAutonomyLevel: "LEVEL_3_GOVERNED_AUTONOMY",
    });

    // 4. Create Cross-Enterprise Governed Workflow Definition
    const workflowDef = await platform.workflowOrchestratorService.createDefinition({
      id: "wf-supply-chain-optimization",
      tenantId: TENANT_A,
      organizationId: "org-omni",
      name: "Supply Chain Cross Optimization",
      portfolioId: portfolio.id,
      enterpriseId: entRetail.id,
      objectiveId: pObj.id,
      steps: [
        {
          stepId: "step-optimize-routes",
          name: "Optimize Cross-Hub Routes",
          order: 1,
          purpose: "Re-route shipments to meet SLA target",
          assignedAgentId: "agent-supply-coordinator",
          sourceEnterpriseId: entRetail.id,
          targetEnterpriseId: entLogistics.id,
          portfolioId: portfolio.id,
          requestedAutonomy: "LEVEL_1_ASSISTED",
          verifierPrincipalId: "verifier-ops-director", // Distinct verifier (SoD compliant)
        },
      ],
    });
    await platform.workflowOrchestratorService.activateDefinition(workflowDef.id, TENANT_A);

    // 5. Execute Governed Workflow with metric output
    const { instance } = await platform.workflowOrchestratorService.startWorkflow({
      definitionId: workflowDef.id,
      tenantId: TENANT_A,
      input: {
        portfolioId: portfolio.id,
        portfolioObjectiveId: pObj.id,
        enterpriseMetricId: metric.id,
        sourceEnterpriseId: entRetail.id,
        targetEnterpriseId: entLogistics.id,
        metricValue: 98, // Measurement value to record
      },
      autoAdvance: true,
    });

    assert.equal(instance.status, "COMPLETED");
    const completedStep = instance.getStepState("step-optimize-routes");
    assert.equal(completedStep?.status, "COMPLETED");

    // 6. Verify Enterprise Metric Updated
    const updatedMetric = await platform.enterpriseOperatingService.getMetric(metric.id, TENANT_A);
    assert.equal(updatedMetric.currentValue, 98);
  });
});

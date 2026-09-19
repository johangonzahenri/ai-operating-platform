/**
 * Phase 67 Platform API Tests: AI Enterprise Operating System & Executive Governance
 * 
 * End-to-end HTTP REST & SDK Client verification for:
 * - POST /api/v1/business/enterprises
 * - GET /api/v1/business/enterprises/:id
 * - GET /api/v1/business/enterprises
 * - PATCH /api/v1/business/enterprises/:id
 * - POST /api/v1/business/objectives
 * - GET /api/v1/business/objectives/:id
 * - GET /api/v1/business/objectives
 * - PATCH /api/v1/business/objectives/:id/status
 * - POST /api/v1/business/initiatives
 * - GET /api/v1/business/initiatives/:id
 * - GET /api/v1/business/initiatives
 * - PATCH /api/v1/business/initiatives/:id/status
 * - POST /api/v1/business/metrics
 * - GET /api/v1/business/metrics/:id
 * - GET /api/v1/business/metrics
 * - POST /api/v1/business/metrics/:id/measurements
 * - POST /api/v1/business/decisions
 * - GET /api/v1/business/decisions/:id
 * - GET /api/v1/business/decisions
 * - GET /api/v1/business/context
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

test("Phase 67 — Platform HTTP REST API: AI Enterprise Operating System (/api/v1/business/*)", async (t) => {
  let server: http.Server;
  let client: ReturnType<typeof createPlatformClient>;
  let baseUrl: string;
  let platform: ReturnType<typeof createPlatform>;
  let service: PlatformService;

  const TEST_TENANT = "tenant-enterprise-api-test";
  const OTHER_TENANT = "tenant-other-enterprise";
  const TEST_KEY_SECRET = "secret-enterprise-admin-12345";
  let apiKeyString: string;

  await t.test("Setup: Bootstrap Platform HTTP Server with Auth & Enterprise Operating System", async () => {
    platform = createPlatform();

    // Register API Key for auth
    const keyHash = ApiKeyRecord.hashSecret(TEST_KEY_SECRET);
    const keyRecord = ApiKeyRecord.create({
      id: "key-ent-1",
      principalId: "executive-ceo",
      principalType: "SERVICE",
      keyHash,
      roles: ["system-admin"],
      tenantId: TEST_TENANT,
      status: "ACTIVE",
    });
    await platform.apiKeyRepository.save(keyRecord);
    apiKeyString = `key-ent-1.${TEST_KEY_SECRET}`;

    service = new PlatformService({
      tasks: platform.tasks,
      executions: platform.executions,
      audit: platform.audit,
      metrics: platform.metrics,
      tools: platform.tools,
      submitTask: platform.submitTask,
      executeOrchestration: platform.executeOrchestration,
      organizationService: platform.organizationService,
      teamResourceBudgetService: platform.teamResourceBudgetService,
      agentProfileService: platform.agentProfileService,
      agentLifecycleService: platform.agentLifecycleService,
      workflowOrchestratorService: platform.workflowOrchestratorService,
      workflowVerificationService: platform.workflowVerificationService,
      humanOversightService: platform.humanOversightService,
      solutionFactoryService: platform.solutionFactoryService,
      enterpriseOperatingService: platform.enterpriseOperatingService,
    });

    server = createHttpServer(service, {
      apiKeyRepository: platform.apiKeyRepository,
      roleRepository: platform.roleRepository,
      authService: platform.authenticationService,
      authzEvaluator: platform.rbacEvaluator,
      enforceSecurity: false,
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;

    client = createPlatformClient({
      baseUrl,
      apiKey: apiKeyString,
      defaultHeaders: {
        "x-tenant-id": TEST_TENANT,
      },
    });
  });

  await t.test("Enterprise Management: Create, Read, List, Update", async () => {
    const enterprise = await client.business.enterprises.create({
      id: "ent-api-01",
      name: "Tentaciones Autonomous Corp",
      description: "Autonomous Food & Beverage enterprise platform",
      industry: "Hospitality & Food Tech",
      vision: "Autonomous culinary retail globally by 2030",
      strategicMission: "Deliver reliable culinary experiences through governed AI agents",
    });

    assert.equal(enterprise.id, "ent-api-01");
    assert.equal(enterprise.name, "Tentaciones Autonomous Corp");
    assert.equal(enterprise.status, "ACTIVE");

    const retrieved = await client.business.enterprises.get("ent-api-01");
    assert.equal(retrieved.id, "ent-api-01");
    assert.equal(retrieved.vision, "Autonomous culinary retail globally by 2030");

    const list = await client.business.enterprises.list();
    assert.equal(list.length, 1);
    assert.equal(list[0]?.id, "ent-api-01");

    const updated = await client.business.enterprises.update("ent-api-01", {
      description: "Updated description for Tentaciones Autonomous Corp",
    });
    assert.equal(updated.description, "Updated description for Tentaciones Autonomous Corp");
    assert.equal(updated.concurrencyVersion, 2);
  });

  await t.test("Business Objectives: Create, List, Status Transition", async () => {
    const obj = await client.business.objectives.create({
      id: "obj-api-revenue",
      enterpriseId: "ent-api-01",
      title: "Reach $25M Gross Merchandising Value",
      description: "Achieve annual target across all autonomous branches",
      type: "STRATEGIC",
      ownerPrincipalId: "executive-ceo",
      linkedInitiativeIds: ["init-api-kiosks"],
      linkedSolutionIds: ["solution-api-commerce"],
      linkedWorkflowIds: ["wf-order-fulfillment"],
    });

    assert.equal(obj.id, "obj-api-revenue");
    assert.equal(obj.lifecycleState, "DRAFT");
    assert.equal(obj.type, "STRATEGIC");

    const list = await client.business.objectives.list("ent-api-01");
    assert.equal(list.length, 1);
    assert.equal(list[0]?.id, "obj-api-revenue");

    const activated = await client.business.objectives.transitionStatus("obj-api-revenue", {
      status: "ACTIVE",
      reason: "Board approved 2026 operating targets",
      expectedConcurrencyVersion: 1,
    });
    assert.equal(activated.lifecycleState, "ACTIVE");
    assert.equal(activated.concurrencyVersion, 2);
  });

  await t.test("Business Initiatives: Create, List, Status Transition", async () => {
    const init = await client.business.initiatives.create({
      id: "init-api-kiosks",
      enterpriseId: "ent-api-01",
      objectiveId: "obj-api-revenue",
      title: "Deploy 100 Smart Kiosks in Top Metros",
      description: "Rollout governed smart retail units",
      ownerPrincipalId: "executive-ceo",
      linkedSolutionIds: ["solution-api-commerce"],
      linkedWorkflowIds: ["wf-order-fulfillment"],
      expectedOutcome: "Over $15M GMV generated from kiosk footprint",
    });

    assert.equal(init.id, "init-api-kiosks");
    assert.equal(init.lifecycleState, "PLANNED");

    const list = await client.business.initiatives.list("obj-api-revenue");
    assert.equal(list.length, 1);
    assert.equal(list[0]?.id, "init-api-kiosks");

    const activated = await client.business.initiatives.transitionStatus("init-api-kiosks", {
      status: "ACTIVE",
      reason: "Commencing hardware rollout",
      expectedConcurrencyVersion: 1,
    });
    assert.equal(activated.lifecycleState, "ACTIVE");
    assert.equal(activated.concurrencyVersion, 2);
  });

  await t.test("Business Metrics: Create, Record Measurements & Status", async () => {
    const metric = await client.business.metrics.create({
      id: "metric-api-gmv",
      enterpriseId: "ent-api-01",
      objectiveId: "obj-api-revenue",
      name: "Gross Merchandising Value",
      unit: "USD",
      targetValue: 25000000,
      source: "BillingLedgerService:finance.gmv.total",
      period: "DAILY",
    });

    assert.equal(metric.id, "metric-api-gmv");
    assert.equal(metric.status, "MISSING");

    const measured = await client.business.metrics.recordMeasurement("metric-api-gmv", {
      value: 25000000,
      source: "BillingLedgerService:finance.gmv.total",
      expectedConcurrencyVersion: 1,
    });

    assert.equal(measured.currentValue, 25000000);
    assert.equal(measured.gap, 0);
    assert.equal(measured.status, "ON_TRACK");
  });

  await t.test("Executive Decisions: Record Governed Decision with Policy Provenance", async () => {
    const decision = await client.business.decisions.create({
      id: "dec-api-01",
      enterpriseId: "ent-api-01",
      decisionMakerPrincipalId: "executive-ceo",
      authorityScope: "BUDGET_ADJUSTMENT",
      decisionType: "APPROVE",
      targetType: "BUDGET",
      targetId: "budget-kiosk-maintenance",
      rationale: "Ensure 99.9% uptime across all operational metro locations",
      policyContext: "policy-capital-expenditure-threshold",
      resultingAction: "Dispatched regional maintenance support crew",
    });

    assert.equal(decision.id, "dec-api-01");
    assert.equal(decision.decisionType, "APPROVE");
    assert.equal(decision.authorityScope, "BUDGET_ADJUSTMENT");

    const retrieved = await client.business.decisions.get("dec-api-01");
    assert.equal(retrieved.id, "dec-api-01");

    const list = await client.business.decisions.list("ent-api-01");
    assert.equal(list.length, 1);
  });

  await t.test("Business Operating Context: Aggregated Strategic View", async () => {
    const context = await client.business.getContext();
    assert.equal(context.enterprise.id, "ent-api-01");
    assert.equal(context.objectives.length, 1);
    assert.equal(context.initiatives.length, 1);
    assert.equal(context.metrics.length, 1);
    assert.equal(context.recentDecisions.length, 1);
  });

  await t.test("Adversarial: Reject Metric Creation Missing Ground-Truth Source", async () => {
    await assert.rejects(
      () =>
        client.business.metrics.create({
          id: "metric-invalid",
          enterpriseId: "ent-api-01",
          objectiveId: "obj-api-revenue",
          name: "Unverifiable Metric",
          unit: "count",
          targetValue: 100,
          source: "",
        }),
      (err: any) => {
        assert.equal(err.status, 400);
        return true;
      }
    );
  });

  await t.test("Teardown: Close HTTP Server", async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
});

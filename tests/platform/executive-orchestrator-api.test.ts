/**
 * Phase 68 Platform API Tests: Executive Orchestrator & Closed-Loop Operations
 *
 * End-to-end HTTP REST & SDK Client verification for:
 * - POST /api/v1/executive/cycles
 * - GET  /api/v1/executive/cycles
 * - GET  /api/v1/executive/cycles/:id
 * - GET  /api/v1/executive/cycles/:id/context
 * - GET  /api/v1/executive/cycles/:id/analysis
 * - GET  /api/v1/executive/cycles/:id/plan
 * - POST /api/v1/executive/cycles/:id/approve
 * - POST /api/v1/executive/cycles/:id/execute-action
 * - POST /api/v1/executive/cycles/:id/reassess
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

test("Phase 68 — Platform HTTP REST API: Executive Orchestrator (/api/v1/executive/*)", async (t) => {
  let server: http.Server;
  let client: ReturnType<typeof createPlatformClient>;
  let baseUrl: string;
  let platform: ReturnType<typeof createPlatform>;
  let service: PlatformService;

  const TEST_TENANT = "tenant-exec-api-test";
  const TEST_KEY_SECRET = "secret-exec-admin-98765";
  let apiKeyString: string;

  let enterpriseId: string;
  let cycleId: string;

  await t.test("Setup: Bootstrap Platform Server with Executive Orchestrator", async () => {
    platform = createPlatform();

    const keyHash = ApiKeyRecord.hashSecret(TEST_KEY_SECRET);
    const keyRecord = ApiKeyRecord.create({
      id: "key-exec-1",
      principalId: "executive-ceo",
      principalType: "SERVICE",
      keyHash,
      roles: ["system-admin"],
      tenantId: TEST_TENANT,
      status: "ACTIVE",
    });
    await platform.apiKeyRepository.save(keyRecord);
    apiKeyString = `key-exec-1.${TEST_KEY_SECRET}`;

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
      executiveOrchestratorService: platform.executiveOrchestratorService,
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
      defaultHeaders: { "x-tenant-id": TEST_TENANT },
    });

    // Seed Enterprise & Baseline Objective & Metric via client
    const ent = await client.business.enterprises.create({
      id: "ent-api-01",
      name: "Acme Autonomous Enterprise",
      description: "Autonomous operations test enterprise",
      strategicMission: "Zero downtime operations",
      vision: "Autonomous closed loop",
    });
    enterpriseId = ent.id;

    await client.business.objectives.create({
      id: "obj-api-01",
      enterpriseId,
      title: "Maintain 99.99% Availability",
      description: "Core SLA",
      type: "STRATEGIC",
      targetMetric: { name: "Uptime", unit: "PERCENTAGE", targetValue: 99.99 },
      ownerPrincipalId: "exec-sla-lead",
    });

    await client.business.metrics.create({
      id: "metric-avail",
      enterpriseId,
      objectiveId: "obj-api-01",
      name: "Uptime Availability (%)",
      unit: "PERCENTAGE",
      targetValue: 99.99,
      currentValue: 99.50,
      period: "DAILY",
      source: "monitoring.uptime_stream",
    });
  });

  await t.test("POST /api/v1/executive/cycles - start an Executive Cycle", async () => {
    const startResult = await client.executive.cycles.start({
      id: "cycle-api-test-01",
      enterpriseId,
      autonomyLevel: "LEVEL_2_GOVERNED_AUTOMATION",
    });

    assert.ok(startResult.cycle.id);
    assert.equal(startResult.cycle.enterpriseId, enterpriseId);
    assert.ok(startResult.snapshot.id);
    assert.ok(startResult.plan.id);
    cycleId = startResult.cycle.id;
  });

  await t.test("GET /api/v1/executive/cycles - list and query cycles", async () => {
    const cycles = await client.executive.cycles.list(enterpriseId);
    assert.ok(Array.isArray(cycles));
    assert.ok(cycles.length >= 1);
    assert.equal(cycles[0]?.id, cycleId);

    const fetched = await client.executive.cycles.get(cycleId);
    assert.equal(fetched.id, cycleId);
  });

  await t.test("GET /api/v1/executive/cycles/:id/context - get captured snapshot", async () => {
    const context = await client.executive.cycles.getContext(cycleId);
    assert.ok(context.id);
    assert.equal(context.enterpriseId, enterpriseId);
    assert.ok(context.metrics.length >= 1);
  });

  await t.test("GET /api/v1/executive/cycles/:id/analysis - get executive analysis", async () => {
    const analysis = await client.executive.cycles.getAnalysis(cycleId);
    assert.ok(analysis.id);
    assert.equal(analysis.enterpriseId, enterpriseId);
    assert.ok(analysis.affectedObjectiveIds.length >= 1);
  });

  await t.test("GET /api/v1/executive/cycles/:id/plan - get executive plan", async () => {
    const plan = await client.executive.cycles.getPlan(cycleId);
    assert.ok(plan.id);
    assert.equal(plan.status, "VALIDATED");
  });

  await t.test("POST /api/v1/executive/cycles/:id/approve - approve executive plan", async () => {
    const approvedResult = await client.executive.cycles.approve(cycleId, {
      approverPrincipalId: "human-governor-sarah",
    });

    assert.ok(approvedResult);
    assert.equal(approvedResult.plan.status, "APPROVED");

    const runningCycle = await client.executive.cycles.get(cycleId);
    assert.equal(runningCycle.status, "EXECUTING");
  });

  await t.test("POST /api/v1/executive/cycles/:id/execute-action - execute a plan action", async () => {
    const result = await client.executive.cycles.executeAction(cycleId, {
      actionIndex: 0,
    });

    assert.ok(result.outcome);
  });

  await t.test("Teardown: Close HTTP server", async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });
});

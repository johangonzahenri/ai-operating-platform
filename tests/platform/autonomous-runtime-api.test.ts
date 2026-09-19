/**
 * AI Operating Platform - Autonomous Operations Runtime HTTP REST API Platform Tests
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { AddressInfo } from "node:net";
import { createPlatform } from "../../src/interfaces/composition.js";
import { createHttpServer } from "../../src/platform/api/http-router.js";
import { PlatformService } from "../../src/platform/api/platform-service.js";
import { createPlatformClient, PlatformClient } from "../../src/platform-client/index.js";
import { ApiKeyRecord } from "../../src/domain/security/authentication.js";

describe("Platform API: /api/v1/autonomous/* Endpoints", async () => {
  let server: http.Server;
  let client: PlatformClient;
  let baseUrl: string;
  let enterpriseId: string;

  const TEST_TENANT = "tenant-auto-api-test";
  const TEST_KEY_SECRET = "secret-auto-admin-12345";
  let apiKeyString: string;

  before(async () => {
    const container = createPlatform();

    const keyHash = ApiKeyRecord.hashSecret(TEST_KEY_SECRET);
    const keyRecord = ApiKeyRecord.create({
      id: "key-auto-test",
      principalId: "admin-auto-user",
      principalType: "SERVICE",
      keyHash,
      roles: ["system-admin"],
      tenantId: TEST_TENANT,
      status: "ACTIVE",
    });
    await container.apiKeyRepository.save(keyRecord);
    apiKeyString = `key-auto-test.${TEST_KEY_SECRET}`;

    const service = new PlatformService({
      tasks: container.tasks,
      executions: container.executions,
      audit: container.audit,
      metrics: container.metrics,
      tools: container.tools,
      submitTask: container.submitTask,
      executeOrchestration: container.executeOrchestration,
      operations: container.operations,
      eventStore: container.eventStore,
      organizationService: container.organizationService,
      teamResourceBudgetService: container.teamResourceBudgetService,
      agentProfileService: container.agentProfileService,
      workflowOrchestratorService: container.workflowOrchestratorService,
      workflowVerificationService: container.workflowVerificationService,
      humanOversightService: container.humanOversightService,
      agentLifecycleService: container.agentLifecycleService,
      solutionFactoryService: container.solutionFactoryService,
      enterpriseOperatingService: container.enterpriseOperatingService,
      executiveOrchestratorService: container.executiveOrchestratorService,
      autonomousOperationsRuntime: container.autonomousOperationsRuntime,
    });

    server = createHttpServer(service, {
      apiKeyRepository: container.apiKeyRepository,
      roleRepository: container.roleRepository,
      authService: container.authenticationService,
      authzEvaluator: container.rbacEvaluator,
      enforceSecurity: false,
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;

    client = createPlatformClient({
      baseUrl,
      apiKey: apiKeyString,
      defaultHeaders: { "x-tenant-id": TEST_TENANT },
    });

    // Seed Enterprise & Baseline Objective
    const ent = await client.business.enterprises.create({
      id: "ent-auto-api-01",
      name: "Autonomous Enterprise API Test",
      description: "Testing autonomous triggers",
      industry: "Cloud Infrastructure",
      strategicMission: "Autonomous execution",
      vision: "Continuous operations",
    });
    enterpriseId = ent.id;

    await client.business.objectives.create({
      id: "obj-auto-api-01",
      enterpriseId,
      title: "Core Service Stability",
      description: "Stability KPI",
      type: "OPERATIONAL",
      targetMetric: { name: "Error Rate", unit: "PERCENTAGE", targetValue: 0.1 },
      ownerPrincipalId: "exec-stability-lead",
    });
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("POST /api/v1/autonomous/runtime/start & GET /api/v1/autonomous/runtime", async () => {
    const started = await client.autonomous.runtime.start();
    assert.equal(started.status, "RUNNING");
    assert.equal(started.tenantId, TEST_TENANT);

    const fetched = await client.autonomous.runtime.getState();
    assert.equal(fetched.status, "RUNNING");
  });

  it("POST /api/v1/autonomous/triggers - create, list, enable, disable, and fire trigger", async () => {
    const trigger = await client.autonomous.triggers.create({
      id: "trig-api-01",
      enterpriseId,
      name: "API Error Spike Watchdog",
      triggerType: "EVENT_DRIVEN",
      eventConfig: { sourceEventType: "workflow.failed" },
      autonomyLevel: "LEVEL_2_GOVERNED_AUTOMATION",
    });

    assert.equal(trigger.id, "trig-api-01");
    assert.equal(trigger.status, "ENABLED");

    const list = await client.autonomous.triggers.list(enterpriseId);
    assert.ok(Array.isArray(list));
    assert.ok(list.length >= 1);
    assert.equal(list[0]?.id, "trig-api-01");

    const disabled = await client.autonomous.triggers.disable("trig-api-01");
    assert.equal(disabled.status, "DISABLED");

    const enabled = await client.autonomous.triggers.enable("trig-api-01");
    assert.equal(enabled.status, "ENABLED");

    const fireResult = await client.autonomous.triggers.fire("trig-api-01");
    assert.ok(fireResult.cycle.id);
    assert.ok(fireResult.leaseId);
  });

  it("POST /api/v1/autonomous/runtime/pause, resume, and stop", async () => {
    const paused = await client.autonomous.runtime.pause();
    assert.equal(paused.status, "PAUSED");

    const resumed = await client.autonomous.runtime.resume();
    assert.equal(resumed.status, "RUNNING");

    const stopped = await client.autonomous.runtime.stop();
    assert.equal(stopped.status, "STOPPED");
  });
});

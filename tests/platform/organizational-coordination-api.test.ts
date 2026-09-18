import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { AddressInfo } from "node:net";
import { createPlatform } from "../../src/interfaces/composition.js";
import { PlatformService } from "../../src/platform/api/platform-service.js";
import { createHttpServer } from "../../src/platform/api/http-router.js";
import { createPlatformClient } from "../../src/platform-client/index.js";
import { Organization } from "../../src/domain/organization/organization.js";
import { Area } from "../../src/domain/organization/area.js";
import { Team } from "../../src/domain/organization/team.js";
import { AgentMembership } from "../../src/domain/organization/agent-membership.js";
import { Agent } from "../../src/domain/agent/agent.js";
import { ApiKeyRecord } from "../../src/domain/security/authentication.js";

test("Prompt 109 — Platform HTTP REST API: Organizational Agent Coordination (/api/v1)", async (t) => {
  let server: http.Server;
  let client: ReturnType<typeof createPlatformClient>;
  let baseUrl: string;
  let platform: ReturnType<typeof createPlatform>;
  let service: PlatformService;

  const TEST_TENANT = "tenant-test-coord";
  const OTHER_TENANT = "tenant-other-coord";
  const TEST_KEY_SECRET = "secret-coord-admin-12345";
  let apiKeyString: string;

  let testOrg: Organization;
  let testArea: Area;
  let testTeam: Team;

  await t.test("Setup: Bootstrap Platform HTTP Server with Auth & Organization Hierarchy", async () => {
    platform = createPlatform();

    // Register API Key for auth
    const keyHash = ApiKeyRecord.hashSecret(TEST_KEY_SECRET);
    const keyRecord = ApiKeyRecord.create({
      id: "key-coord-1",
      principalId: "service-admin",
      principalType: "SERVICE",
      keyHash,
      roles: ["system-admin"],
      tenantId: TEST_TENANT,
      status: "ACTIVE",
    });
    await platform.apiKeyRepository.save(keyRecord);
    apiKeyString = `key-coord-1.${TEST_KEY_SECRET}`;

    // Register 2 agents in tenant
    const agentSource = Agent.create({
      id: "agent-coord-source",
      name: "Coordinator Source",
      model: "stub-model",
      instructions: "Source instructions",
      tools: [],
      memoryScope: "source",
    });
    const agentTarget = Agent.create({
      id: "agent-coord-target",
      name: "Coordinator Target",
      model: "stub-model",
      instructions: "Target instructions",
      tools: [],
      memoryScope: "target",
    });

    platform.agents.register(agentSource);
    platform.agents.register(agentTarget);

    // Create Org -> Area -> Team -> Memberships -> Budget
    testOrg = await platform.organizationService.createOrganization({
      id: "org-coord-test",
      tenantId: TEST_TENANT,
      name: "Coordination Testing Org",
    });

    testArea = await platform.organizationService.createArea({
      id: "area-coord-test",
      organizationId: testOrg.id,
      tenantId: TEST_TENANT,
      name: "Coordination Testing Area",
    });

    testTeam = await platform.organizationService.createTeam({
      id: "team-coord-test",
      areaId: testArea.id,
      organizationId: testOrg.id,
      tenantId: TEST_TENANT,
      name: "Coordination Testing Team",
    });

    await platform.organizationService.assignAgent({
      teamId: testTeam.id,
      agentId: agentSource.id,
      tenantId: TEST_TENANT,
      organizationId: testOrg.id,
    });

    await platform.organizationService.assignAgent({
      teamId: testTeam.id,
      agentId: agentTarget.id,
      tenantId: TEST_TENANT,
      organizationId: testOrg.id,
    });

    await platform.teamResourceBudgetService.createBudget({
      teamId: testTeam.id,
      tenantId: TEST_TENANT,
      limits: {
        maxExecutions: 20,
        maxModelCalls: 200,
        maxToolCalls: 200,
        maxAutonomousSteps: 100,
        maxDurationMs: 120000,
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
      organizationService: platform.organizationService,
      teamResourceBudgetService: platform.teamResourceBudgetService,
      organizationalCoordinationService: platform.organizationalCoordinationService,
    });

    server = createHttpServer(service, {
      authService: platform.authenticationService,
      authzEvaluator: platform.rbacEvaluator,
      roleRepository: platform.roleRepository,
      apiKeyRepository: platform.apiKeyRepository,
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        client = createPlatformClient({
          baseUrl,
          apiKey: apiKeyString,
          defaultHeaders: {
            "X-Tenant-Id": TEST_TENANT,
          },
        });
        resolve();
      });
    });
  });

  await t.test("1. POST /api/v1/teams/:id/coordinations successfully coordinates work between agents", async () => {
    const res = await client.coordinations.requestTeamCoordination(testTeam.id, {
      organizationId: testOrg.id,
      sourceAgentId: "agent-coord-source",
      targetAgentId: "agent-coord-target",
      purpose: "Run diagnostic inspection",
      inputPayload: { targetService: "auth-gateway" },
    });

    assert.equal(res.success, true);
    assert.ok(res.coordination);
    assert.equal(res.coordination.teamId, testTeam.id);
    assert.equal(res.coordination.sourceAgentId, "agent-coord-source");
    assert.equal(res.coordination.targetAgentId, "agent-coord-target");
    assert.equal(res.coordination.status, "COMPLETED");
    assert.ok(res.coordination.id.startsWith("coord_"));
  });

  await t.test("2. POST /api/v1/teams/:id/coordinations returns 400 when cycle is detected in history", async () => {
    await assert.rejects(
      async () => {
        await client.coordinations.requestTeamCoordination(testTeam.id, {
          organizationId: testOrg.id,
          sourceAgentId: "agent-coord-source",
          targetAgentId: "agent-coord-target",
          purpose: "Loop test",
          inputPayload: {},
          history: ["agent-coord-target", "agent-coord-source"],
        });
      },
      (err: any) => {
        assert.equal(err.status, 400);
        assert.equal(err.code, "COORDINATION_CYCLE");
        return true;
      }
    );
  });

  await t.test("3. POST /api/v1/teams/:id/coordinations returns 400 when depth limit is reached", async () => {
    await assert.rejects(
      async () => {
        await client.coordinations.requestTeamCoordination(testTeam.id, {
          organizationId: testOrg.id,
          sourceAgentId: "agent-coord-source",
          targetAgentId: "agent-coord-target",
          purpose: "Depth test",
          inputPayload: {},
          depth: 3,
          maxDepth: 3,
        });
      },
      (err: any) => {
        assert.equal(err.status, 400);
        assert.equal(err.code, "COORDINATION_DEPTH_EXCEEDED");
        return true;
      }
    );
  });

  await t.test("4. POST /api/v1/teams/:id/coordinations returns 404 for unknown team", async () => {
    await assert.rejects(
      async () => {
        await client.coordinations.requestTeamCoordination("team-non-existent", {
          organizationId: testOrg.id,
          sourceAgentId: "agent-coord-source",
          targetAgentId: "agent-coord-target",
          purpose: "Non-existent team",
          inputPayload: {},
        });
      },
      (err: any) => {
        assert.equal(err.status, 404);
        assert.equal(err.code, "TEAM_NOT_FOUND");
        return true;
      }
    );
  });

  await t.test("5. GET /api/v1/teams/:id/coordinations lists team coordinations", async () => {
    const list = await client.coordinations.listTeamCoordinations(testTeam.id);
    assert.ok(Array.isArray(list));
    assert.ok(list.length >= 1);
    assert.equal(list[0]!.teamId, testTeam.id);
  });

  await t.test("6. GET /api/v1/coordinations/:id retrieves single coordination record", async () => {
    const list = await client.coordinations.listTeamCoordinations(testTeam.id);
    const coordId = list[0]!.id;

    const single = await client.coordinations.getCoordination(coordId);
    assert.equal(single.id, coordId);
    assert.equal(single.teamId, testTeam.id);
    assert.equal(single.status, "COMPLETED");
  });

  await t.test("Teardown: Close HTTP server cleanly", async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });
});

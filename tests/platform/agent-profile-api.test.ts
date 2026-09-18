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
import { Organization } from "../../src/domain/organization/organization.js";
import { Area } from "../../src/domain/organization/area.js";
import { Team } from "../../src/domain/organization/team.js";
import { AgentMembership } from "../../src/domain/organization/agent-membership.js";

test("Prompt 110 — Platform HTTP REST API: Agent Role, Responsibility & Capability Governance (/api/v1)", async (t) => {
  let server: http.Server;
  let client: ReturnType<typeof createPlatformClient>;
  let baseUrl: string;
  let platform: ReturnType<typeof createPlatform>;
  let service: PlatformService;

  const TEST_TENANT = "tenant-test-profile";
  const OTHER_TENANT = "tenant-other-profile";
  const TEST_KEY_SECRET = "secret-profile-admin-12345";
  let apiKeyString: string;

  await t.test("Setup: Bootstrap Platform HTTP Server with Auth & Agents", async () => {
    platform = createPlatform();

    // Register API Key for auth
    const keyHash = ApiKeyRecord.hashSecret(TEST_KEY_SECRET);
    const keyRecord = ApiKeyRecord.create({
      id: "key-profile-1",
      principalId: "service-admin",
      principalType: "SERVICE",
      keyHash,
      roles: ["system-admin"],
      tenantId: TEST_TENANT,
      status: "ACTIVE",
    });
    await platform.apiKeyRepository.save(keyRecord);
    apiKeyString = `key-profile-1.${TEST_KEY_SECRET}`;

    const otherKeyRecord = ApiKeyRecord.create({
      id: "key-profile-other",
      principalId: "other-admin",
      principalType: "SERVICE",
      keyHash: ApiKeyRecord.hashSecret("other-secret"),
      roles: ["system-admin"],
      tenantId: OTHER_TENANT,
      status: "ACTIVE",
    });
    await platform.apiKeyRepository.save(otherKeyRecord);

    // Register test agent
    const agent = Agent.create({
      id: "agent-prof-1",
      name: "Security Lead Agent",
      model: "stub-model",
      instructions: "Perform security audits",
      tools: [],
    });
    platform.agents.register(agent);

    // Register org hierarchy
    const org = await platform.organizationService.createOrganization({ id: "org-alpha", tenantId: TEST_TENANT, name: "Org Alpha" });
    const area = await platform.organizationService.createArea({ id: "area-sec", organizationId: org.id, tenantId: TEST_TENANT, name: "Area Sec" });
    const team = await platform.organizationService.createTeam({ id: "team-sec-ops", organizationId: org.id, areaId: area.id, tenantId: TEST_TENANT, name: "Sec Ops Team" });
    await platform.organizationService.assignAgent({ teamId: team.id, agentId: "agent-prof-1", role: "LEAD", tenantId: TEST_TENANT, organizationId: org.id });

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
      agentProfileService: platform.agentProfileService,
    });

    server = createHttpServer(service, {
      authService: platform.authenticationService,
      authzEvaluator: platform.rbacEvaluator,
      apiKeyRepository: platform.apiKeyRepository,
      roleRepository: platform.roleRepository,
      enforceSecurity: false,
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;

    client = createPlatformClient({
      baseUrl,
      apiPrefix: "/api/v1",
      apiKey: apiKeyString,
      defaultHeaders: {
        "X-Tenant-Id": TEST_TENANT,
      },
    });
  });

  await t.test("1. POST /api/v1/agents/:id/profile creates profile", async () => {
    const created = await client.agentProfiles.create("agent-prof-1", {
      organizationId: "org-alpha",
      teamId: "team-sec-ops",
      role: "LEAD",
      responsibilities: ["SECURITY_AUDIT", "VULNERABILITY_ASSESSMENT"],
    });

    assert.equal(created.agentId, "agent-prof-1");
    assert.equal(created.role, "LEAD");
    assert.equal(created.status, "ACTIVE");
    assert.equal(created.version, 1);
    assert.deepEqual(created.responsibilities, ["SECURITY_AUDIT", "VULNERABILITY_ASSESSMENT"]);
  });

  await t.test("2. GET /api/v1/agents/:id/profile retrieves profile", async () => {
    const profile = await client.agentProfiles.get("agent-prof-1");
    assert.equal(profile.agentId, "agent-prof-1");
    assert.equal(profile.role, "LEAD");
    assert.equal(profile.teamId, "team-sec-ops");
  });

  await t.test("3. PATCH /api/v1/agents/:id/profile updates role and responsibilities", async () => {
    const updated = await client.agentProfiles.update("agent-prof-1", {
      role: "SPECIALIST",
      responsibilities: ["SECURITY_AUDIT", "INCIDENT_RESPONSE"],
    });

    assert.equal(updated.role, "SPECIALIST");
    assert.deepEqual(updated.responsibilities, ["SECURITY_AUDIT", "INCIDENT_RESPONSE"]);
    assert.equal(updated.version, 3);
  });

  await t.test("4. POST /api/v1/agents/:id/capabilities adds capability", async () => {
    const updated = await client.agentProfiles.addCapability("agent-prof-1", {
      id: "cap-sast",
      name: "Static Analysis",
      category: "SECURITY",
      description: "Perform SAST scans on code",
    });

    assert.equal(updated.capabilities.length, 1);
    const cap = updated.capabilities[0];
    assert.ok(cap);
    assert.equal(cap.id, "cap-sast");
    assert.equal(cap.status, "DECLARED");
  });

  await t.test("5. POST /api/v1/agents/:id/capabilities/:capId/verify verifies capability", async () => {
    const verified = await client.agentProfiles.verifyCapability("agent-prof-1", "cap-sast", {
      verifiedBy: "ciso-admin",
    });

    const cap = verified.capabilities.find((c) => c.id === "cap-sast");
    assert.ok(cap);
    assert.equal(cap.status, "VERIFIED");
    assert.equal(cap.verifiedBy, "ciso-admin");
    assert.ok(cap.verifiedAt);
  });

  await t.test("6. POST /api/v1/agents/:id/capabilities/:capId/disable disables capability", async () => {
    const disabled = await client.agentProfiles.disableCapability("agent-prof-1", "cap-sast");
    const cap = disabled.capabilities.find((c) => c.id === "cap-sast");
    assert.ok(cap);
    assert.equal(cap.status, "DISABLED");
  });

  await t.test("7. POST & GET /api/v1/agents/discover performs multi-criteria discovery", async () => {
    // Discovery via POST
    const discoveredPost = await client.agentProfiles.discover({
      role: "SPECIALIST",
      responsibility: "SECURITY_AUDIT",
    });
    assert.equal(discoveredPost.length, 1);
    assert.equal(discoveredPost[0]?.agentId, "agent-prof-1");

    // Discovery via GET
    const res = await fetch(`${baseUrl}/api/v1/agents/discover?role=SPECIALIST&responsibility=SECURITY_AUDIT`, {
      headers: {
        "X-API-Key": apiKeyString,
        "X-Tenant-Id": TEST_TENANT,
        "Accept": "application/json",
      },
    });
    assert.equal(res.status, 200);
    const discoveredGet = (await res.json()) as any[];
    assert.equal(discoveredGet.length, 1);
    assert.equal(discoveredGet[0]?.agentId, "agent-prof-1");
  });

  await t.test("8. DELETE /api/v1/agents/:id/capabilities/:capId removes capability", async () => {
    const removed = await client.agentProfiles.removeCapability("agent-prof-1", "cap-sast");
    assert.equal(removed.capabilities.length, 0);
  });

  await t.test("9. Multi-Tenant isolation: request from other tenant returns 403/forbidden", async () => {
    // Attempt GET profile from other tenant
    const res = await fetch(`${baseUrl}/api/v1/agents/agent-prof-1/profile`, {
      headers: {
        "X-API-Key": "key-profile-other.other-secret",
        "X-Tenant-Id": OTHER_TENANT,
        "Accept": "application/json",
      },
    });
    assert.equal(res.status, 403);

    // Attempt discover from other tenant
    const discRes = await fetch(`${baseUrl}/api/v1/agents/discover?role=SPECIALIST`, {
      headers: {
        "X-API-Key": "key-profile-other.other-secret",
        "X-Tenant-Id": OTHER_TENANT,
        "Accept": "application/json",
      },
    });
    assert.equal(discRes.status, 200);
    const discData = (await discRes.json()) as any[];
    assert.equal(discData.length, 0);
  });

  await t.test("Teardown: Close HTTP server", async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });
});

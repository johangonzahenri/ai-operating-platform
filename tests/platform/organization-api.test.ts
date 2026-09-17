import assert from "node:assert/strict";
import test from "node:test";
import { createPlatform } from "../../src/interfaces/composition.js";
import { PlatformService } from "../../src/platform/api/platform-service.js";
import { createHttpServer } from "../../src/platform/api/http-router.js";

const PORT = 3188;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function createTestServer() {
  const platform = createPlatform();
  const service = new PlatformService({
    tasks: platform.tasks,
    executions: platform.executions,
    audit: platform.audit,
    metrics: platform.metrics,
    tools: platform.tools,
    models: platform.modelRegistry,
    agents: platform.agents,
    agentService: platform.agentService,
    submitTask: platform.submitTask,
    executeOrchestration: platform.executeOrchestration,
    organizationService: platform.organizationService,
  });
  const server = createHttpServer(service);
  return { platform, service, server };
}

test("Platform Organization HTTP API Suite (Prompt 102)", async (t) => {
  const { server } = createTestServer();

  await new Promise<void>((resolve) => {
    server.listen(PORT, "127.0.0.1", () => resolve());
  });

  t.after(() => {
    server.close();
  });

  const headersTenant1 = {
    "Content-Type": "application/json",
    "X-Tenant-Id": "tenant-enterprise-1",
  };

  const headersTenant2 = {
    "Content-Type": "application/json",
    "X-Tenant-Id": "tenant-enterprise-2",
  };

  await t.test("GET /api/v1/organizations returns empty list initially for tenant", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/organizations`, {
      headers: headersTenant1,
    });
    assert.equal(res.status, 200);
    const data = (await res.json()) as any[];
    assert.ok(Array.isArray(data));
    assert.equal(data.length, 0);
  });

  await t.test("POST /api/v1/organizations creates organization successfully (201)", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/organizations`, {
      method: "POST",
      headers: headersTenant1,
      body: JSON.stringify({
        id: "org-globex",
        name: "Globex Corporation",
        description: "Global operations",
      }),
    });
    assert.equal(res.status, 201);
    const org = (await res.json()) as any;
    assert.equal(org.id, "org-globex");
    assert.equal(org.name, "Globex Corporation");
    assert.equal(org.tenantId, "tenant-enterprise-1");
    assert.equal(org.status, "ACTIVE");
    assert.equal(org.version, 1);
  });

  await t.test("GET /api/v1/organizations/:id returns organization details with counts", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/organizations/org-globex`, {
      headers: headersTenant1,
    });
    assert.equal(res.status, 200);
    const org = (await res.json()) as any;
    assert.equal(org.id, "org-globex");
    assert.equal(org.areasCount, 0);
    assert.equal(org.teamsCount, 0);
  });

  await t.test("PATCH /api/v1/organizations/:id updates organization details and status", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/organizations/org-globex`, {
      method: "PATCH",
      headers: headersTenant1,
      body: JSON.stringify({
        name: "Globex Advanced Systems",
        description: "Updated tech group",
      }),
    });
    assert.equal(res.status, 200);
    const updated = (await res.json()) as any;
    assert.equal(updated.name, "Globex Advanced Systems");
    assert.equal(updated.version, 2);
  });

  await t.test("POST /api/v1/organizations/:id/areas creates an Area under Organization (201)", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/organizations/org-globex/areas`, {
      method: "POST",
      headers: headersTenant1,
      body: JSON.stringify({
        id: "area-robotics",
        name: "Autonomous Robotics",
        description: "Robotics hardware and software",
      }),
    });
    assert.equal(res.status, 201);
    const area = (await res.json()) as any;
    assert.equal(area.id, "area-robotics");
    assert.equal(area.organizationId, "org-globex");
    assert.equal(area.tenantId, "tenant-enterprise-1");
    assert.equal(area.status, "ACTIVE");
  });

  await t.test("GET /api/v1/organizations/:id/areas lists areas for Organization", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/organizations/org-globex/areas`, {
      headers: headersTenant1,
    });
    assert.equal(res.status, 200);
    const areas = (await res.json()) as any[];
    assert.equal(areas.length, 1);
    assert.equal(areas[0].id, "area-robotics");
    assert.equal(areas[0].teamsCount, 0);
  });

  await t.test("GET /api/v1/areas/:id returns Area details", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/areas/area-robotics`, {
      headers: headersTenant1,
    });
    assert.equal(res.status, 200);
    const area = (await res.json()) as any;
    assert.equal(area.id, "area-robotics");
    assert.equal(area.name, "Autonomous Robotics");
  });

  await t.test("POST /api/v1/areas/:id/teams creates a Team in Area (201)", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/areas/area-robotics/teams`, {
      method: "POST",
      headers: headersTenant1,
      body: JSON.stringify({
        id: "team-navigation",
        name: "Spatial Navigation Team",
        description: "SLAM and path planning",
      }),
    });
    assert.equal(res.status, 201);
    const team = (await res.json()) as any;
    assert.equal(team.id, "team-navigation");
    assert.equal(team.areaId, "area-robotics");
    assert.equal(team.organizationId, "org-globex");
    assert.equal(team.membersCount, 0);
  });

  await t.test("GET /api/v1/areas/:id/teams lists teams in Area", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/areas/area-robotics/teams`, {
      headers: headersTenant1,
    });
    assert.equal(res.status, 200);
    const teams = (await res.json()) as any[];
    assert.equal(teams.length, 1);
    assert.equal(teams[0].id, "team-navigation");
  });

  await t.test("GET /api/v1/teams/:id returns Team details", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/teams/team-navigation`, {
      headers: headersTenant1,
    });
    assert.equal(res.status, 200);
    const team = (await res.json()) as any;
    assert.equal(team.id, "team-navigation");
    assert.equal(team.name, "Spatial Navigation Team");
  });

  await t.test("POST /api/v1/teams/:id/agents assigns registered agent to Team (201)", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/teams/team-navigation/agents`, {
      method: "POST",
      headers: headersTenant1,
      body: JSON.stringify({
        agentId: "foundation-agent",
        role: "LEAD",
      }),
    });
    assert.equal(res.status, 201);
    const membership = (await res.json()) as any;
    assert.equal(membership.teamId, "team-navigation");
    assert.equal(membership.agentId, "foundation-agent");
    assert.equal(membership.role, "LEAD");
    assert.equal(membership.status, "ACTIVE");
  });

  await t.test("GET /api/v1/teams/:id/agents lists memberships of Team", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/teams/team-navigation/agents`, {
      headers: headersTenant1,
    });
    assert.equal(res.status, 200);
    const members = (await res.json()) as any[];
    assert.equal(members.length, 1);
    assert.equal(members[0].agentId, "foundation-agent");
    assert.equal(members[0].role, "LEAD");
  });

  await t.test("GET /api/v1/organizations/:id/hierarchy returns full hierarchy tree", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/organizations/org-globex/hierarchy`, {
      headers: headersTenant1,
    });
    assert.equal(res.status, 200);
    const tree = (await res.json()) as any;
    assert.equal(tree.organization.id, "org-globex");
    assert.equal(tree.areas.length, 1);
    assert.equal(tree.areas[0].area.id, "area-robotics");
    assert.equal(tree.areas[0].teams.length, 1);
    assert.equal(tree.areas[0].teams[0].team.id, "team-navigation");
    assert.equal(tree.areas[0].teams[0].members.length, 1);
    assert.equal(tree.areas[0].teams[0].members[0].agentId, "foundation-agent");
  });

  await t.test("DELETE /api/v1/teams/:id/agents/:agentId removes agent from team (200)", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/teams/team-navigation/agents/foundation-agent`, {
      method: "DELETE",
      headers: headersTenant1,
    });
    assert.equal(res.status, 200);
    const data = (await res.json()) as any;
    assert.equal(data.success, true);

    // Verify list is now empty
    const listRes = await fetch(`${BASE_URL}/api/v1/teams/team-navigation/agents`, {
      headers: headersTenant1,
    });
    assert.equal(listRes.status, 200);
    const members = (await listRes.json()) as any[];
    assert.equal(members.length, 0);
  });

  await t.test("Cross-tenant isolation: tenant-2 cannot access or modify tenant-1 organization", async () => {
    // Attempting to read tenant-1 org from tenant-2 fails closed
    const getRes = await fetch(`${BASE_URL}/api/v1/organizations/org-globex`, {
      headers: headersTenant2,
    });
    assert.equal(getRes.status, 403);

    // Attempting to add area from tenant-2 fails closed
    const postRes = await fetch(`${BASE_URL}/api/v1/organizations/org-globex/areas`, {
      method: "POST",
      headers: headersTenant2,
      body: JSON.stringify({
        id: "area-hack",
        name: "Hacked Area",
      }),
    });
    assert.equal(postRes.status, 403);
  });

  await t.test("Strict URL routing: /api/platform/v1/organizations returns 404 (no legacy alias)", async () => {
    const res = await fetch(`${BASE_URL}/api/platform/v1/organizations`, {
      headers: headersTenant1,
    });
    assert.equal(res.status, 404);
  });
});

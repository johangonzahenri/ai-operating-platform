import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SqliteDatabase } from "../../src/infrastructure/persistence/sqlite/sqlite-database.js";
import { SqliteOrganizationRepository } from "../../src/infrastructure/persistence/sqlite/sqlite-organization-repository.js";
import { Organization } from "../../src/domain/organization/organization.js";
import { Area } from "../../src/domain/organization/area.js";
import { Team } from "../../src/domain/organization/team.js";
import { AgentMembership } from "../../src/domain/organization/agent-membership.js";

test("SqliteOrganizationRepository: Organization CRUD and queries by tenant", async () => {
  const db = new SqliteDatabase({ dbPath: ":memory:" });
  const repo = new SqliteOrganizationRepository(db);

  const org1 = Organization.create({
    id: "org-alpha",
    tenantId: "tenant-acme",
    name: "Alpha Division",
    description: "First division",
  });
  const org2 = Organization.create({
    id: "org-beta",
    tenantId: "tenant-acme",
    name: "Beta Division",
  });
  const orgOther = Organization.create({
    id: "org-other",
    tenantId: "tenant-other",
    name: "Other Tenant Org",
  });

  await repo.saveOrganization(org1);
  await repo.saveOrganization(org2);
  await repo.saveOrganization(orgOther);

  const found = await repo.findOrganizationById("org-alpha");
  assert.ok(found);
  assert.equal(found.id, "org-alpha");
  assert.equal(found.name, "Alpha Division");
  assert.equal(found.status, "ACTIVE");

  const acmeOrgs = await repo.findOrganizationsByTenantId("tenant-acme");
  assert.equal(acmeOrgs.length, 2);
  assert.ok(acmeOrgs.some((o) => o.id === "org-alpha"));
  assert.ok(acmeOrgs.some((o) => o.id === "org-beta"));

  // OCC update
  const updated = found.update({ name: "Alpha Division Enhanced" });
  await repo.saveOrganization(updated);

  const afterUpdate = await repo.findOrganizationById("org-alpha");
  assert.ok(afterUpdate);
  assert.equal(afterUpdate.name, "Alpha Division Enhanced");
  assert.equal(afterUpdate.version, 2);

  // Archive
  const archived = org2.archive();
  await repo.saveOrganization(archived);
  const reloadedBeta = await repo.findOrganizationById("org-beta");
  assert.ok(reloadedBeta);
  assert.equal(reloadedBeta.status, "ARCHIVED");
});

test("SqliteOrganizationRepository: Area and Team hierarchy CRUD and relations", async () => {
  const db = new SqliteDatabase({ dbPath: ":memory:" });
  const repo = new SqliteOrganizationRepository(db);

  // Setup Org
  const org = Organization.create({ id: "org-corp", tenantId: "tenant-1", name: "Corp" });
  await repo.saveOrganization(org);

  // Setup Areas
  const area1 = Area.create({ id: "area-rd", organizationId: "org-corp", tenantId: "tenant-1", name: "R&D" });
  const area2 = Area.create({ id: "area-qa", organizationId: "org-corp", tenantId: "tenant-1", name: "QA" });
  await repo.saveArea(area1);
  await repo.saveArea(area2);

  const orgAreas = await repo.findAreasByOrganizationId("org-corp");
  assert.equal(orgAreas.length, 2);

  const tenantAreas = await repo.findAreasByTenantId("tenant-1");
  assert.equal(tenantAreas.length, 2);

  // Setup Teams
  const team1 = Team.create({ id: "team-ai", areaId: "area-rd", organizationId: "org-corp", tenantId: "tenant-1", name: "AI Core" });
  const team2 = Team.create({ id: "team-ml", areaId: "area-rd", organizationId: "org-corp", tenantId: "tenant-1", name: "ML Ops" });
  await repo.saveTeam(team1);
  await repo.saveTeam(team2);

  const rdTeams = await repo.findTeamsByAreaId("area-rd");
  assert.equal(rdTeams.length, 2);

  const corpTeams = await repo.findTeamsByOrganizationId("org-corp");
  assert.equal(corpTeams.length, 2);

  // Deactivate team
  const deactivatedTeam = team2.deactivate();
  await repo.saveTeam(deactivatedTeam);
  const reloadedTeam = await repo.findTeamById("team-ml");
  assert.ok(reloadedTeam);
  assert.equal(reloadedTeam.status, "INACTIVE");
});

test("SqliteOrganizationRepository: AgentMembership tracking and deduplication", async () => {
  const db = new SqliteDatabase({ dbPath: ":memory:" });
  const repo = new SqliteOrganizationRepository(db);

  const org = Organization.create({ id: "org-fin", tenantId: "tenant-fin", name: "FinTech" });
  await repo.saveOrganization(org);
  const area = Area.create({ id: "area-risk", organizationId: "org-fin", tenantId: "tenant-fin", name: "Risk" });
  await repo.saveArea(area);
  const team = Team.create({ id: "team-fraud", areaId: "area-risk", organizationId: "org-fin", tenantId: "tenant-fin", name: "Fraud" });
  await repo.saveTeam(team);

  const mem1 = AgentMembership.create({
    teamId: "team-fraud",
    agentId: "agent-sentinel",
    organizationId: "org-fin",
    tenantId: "tenant-fin",
    role: "LEAD",
  });
  const mem2 = AgentMembership.create({
    teamId: "team-fraud",
    agentId: "agent-detector",
    organizationId: "org-fin",
    tenantId: "tenant-fin",
    role: "SPECIALIST",
  });

  await repo.saveMembership(mem1);
  await repo.saveMembership(mem2);

  const fraudMembers = await repo.findMembershipsByTeamId("team-fraud");
  assert.equal(fraudMembers.length, 2);

  const byTeamAndAgent = await repo.findMembershipByTeamAndAgent("team-fraud", "agent-sentinel");
  assert.ok(byTeamAndAgent);
  assert.equal(byTeamAndAgent.agentId, "agent-sentinel");
  assert.equal(byTeamAndAgent.role, "LEAD");

  const agentMemberships = await repo.findMembershipsByAgentId("agent-detector");
  assert.equal(agentMemberships.length, 1);
  assert.equal(agentMemberships[0]?.teamId, "team-fraud");

  // Remove membership
  const deleted = await repo.deleteMembership("team-fraud", "agent-sentinel");
  assert.equal(deleted, true);
  assert.equal(await repo.findMembershipByTeamAndAgent("team-fraud", "agent-sentinel"), undefined);
});

test("SqliteOrganizationRepository: Durable file persistence across database restart", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aop-org-test-"));
  const dbPath = path.join(tempDir, "org-durable.db");

  try {
    // 1. Initial write
    const db1 = new SqliteDatabase({ dbPath });
    const repo1 = new SqliteOrganizationRepository(db1);

    const org = Organization.create({ id: "org-durable", tenantId: "t-durable", name: "Durable Corp" });
    await repo1.saveOrganization(org);
    const area = Area.create({ id: "area-core", organizationId: "org-durable", tenantId: "t-durable", name: "Core" });
    await repo1.saveArea(area);
    const team = Team.create({ id: "team-core", areaId: "area-core", organizationId: "org-durable", tenantId: "t-durable", name: "Team" });
    await repo1.saveTeam(team);
    const mem = AgentMembership.create({
      teamId: "team-core",
      agentId: "agent-core",
      organizationId: "org-durable",
      tenantId: "t-durable",
      role: "OPERATOR",
    });
    await repo1.saveMembership(mem);

    db1.close();

    // 2. Re-open and verify rehydration from disk
    const db2 = new SqliteDatabase({ dbPath });
    const repo2 = new SqliteOrganizationRepository(db2);

    const rehydratedOrg = await repo2.findOrganizationById("org-durable");
    assert.ok(rehydratedOrg);
    assert.equal(rehydratedOrg.name, "Durable Corp");

    const rehydratedArea = await repo2.findAreaById("area-core");
    assert.ok(rehydratedArea);
    assert.equal(rehydratedArea.name, "Core");

    const rehydratedTeam = await repo2.findTeamById("team-core");
    assert.ok(rehydratedTeam);
    assert.equal(rehydratedTeam.name, "Team");

    const rehydratedMem = await repo2.findMembershipByTeamAndAgent("team-core", "agent-core");
    assert.ok(rehydratedMem);
    assert.equal(rehydratedMem.role, "OPERATOR");

    db2.close();
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

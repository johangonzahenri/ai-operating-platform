import assert from "node:assert/strict";
import test from "node:test";
import {
  Organization,
  Area,
  Team,
  AgentMembership,
  OrganizationValidationError,
} from "../../src/domain/organization/index.js";

test("Organization aggregate: creation and initial active state", () => {
  const org = Organization.create({
    id: "org-engineering",
    tenantId: "tenant-core",
    name: "Core Engineering",
    description: "Engineering and R&D organization",
  });

  assert.equal(org.id, "org-engineering");
  assert.equal(org.organizationId, "org-engineering");
  assert.equal(org.tenantId, "tenant-core");
  assert.equal(org.name, "Core Engineering");
  assert.equal(org.description, "Engineering and R&D organization");
  assert.equal(org.status, "ACTIVE");
  assert.equal(org.version, 1);
  assert.ok(org.createdAt instanceof Date);
  assert.ok(org.updatedAt instanceof Date);
  assert.ok(Object.isFrozen(org));
});

test("Organization aggregate: validation rejects empty or malformed fields", () => {
  assert.throws(
    () => Organization.create({ id: "", tenantId: "tenant-core", name: "Org" }),
    OrganizationValidationError
  );
  assert.throws(
    () => Organization.create({ id: "invalid spaces!", tenantId: "tenant-core", name: "Org" }),
    OrganizationValidationError
  );
  assert.throws(
    () => Organization.create({ id: "org-1", tenantId: "", name: "Org" }),
    OrganizationValidationError
  );
  assert.throws(
    () => Organization.create({ id: "org-1", tenantId: "tenant-core", name: "   " }),
    OrganizationValidationError
  );
});

test("Organization aggregate: lifecycle state transitions and immutability", () => {
  const org = Organization.create({
    id: "org-sales",
    tenantId: "tenant-core",
    name: "Global Sales",
  });

  // Deactivate
  const deactivated = org.deactivate();
  assert.equal(deactivated.status, "INACTIVE");
  assert.equal(deactivated.version, 2);
  assert.equal(org.status, "ACTIVE"); // Original is immutable

  // Reactivate
  const reactivated = deactivated.activate();
  assert.equal(reactivated.status, "ACTIVE");
  assert.equal(reactivated.version, 3);

  // Archive
  const archived = reactivated.archive();
  assert.equal(archived.status, "ARCHIVED");
  assert.equal(archived.version, 4);

  // Invariant: Once ARCHIVED, cannot reactivate, deactivate, or update
  assert.throws(() => archived.activate(), OrganizationValidationError);
  assert.throws(() => archived.deactivate(), OrganizationValidationError);
  assert.throws(() => archived.update({ name: "New Name" }), OrganizationValidationError);
});

test("Organization aggregate: update modifies fields and increments version", () => {
  const org = Organization.create({
    id: "org-ops",
    tenantId: "tenant-core",
    name: "Ops",
    description: "Initial",
  });

  const updated = org.update({ name: "Operations & Logistics", description: "Updated description" });
  assert.equal(updated.name, "Operations & Logistics");
  assert.equal(updated.description, "Updated description");
  assert.equal(updated.version, 2);
  assert.equal(org.name, "Ops"); // Original unchanged
});

test("Organization aggregate: rehydration restores exact persisted snapshot", () => {
  const now = new Date();
  const org = Organization.rehydrate({
    id: "org-rehydrate",
    tenantId: "tenant-core",
    name: "Rehydrated Org",
    description: "Persisted in SQLite",
    status: "INACTIVE",
    version: 7,
    createdAt: now,
    updatedAt: now,
  });

  assert.equal(org.id, "org-rehydrate");
  assert.equal(org.status, "INACTIVE");
  assert.equal(org.version, 7);
  assert.equal(org.createdAt.toISOString(), now.toISOString());
});

test("Area entity: creation, validation, and lifecycle", () => {
  const area = Area.create({
    id: "area-backend",
    organizationId: "org-engineering",
    tenantId: "tenant-core",
    name: "Backend Platforms",
    description: "Distributed systems and API platform",
  });

  assert.equal(area.id, "area-backend");
  assert.equal(area.areaId, "area-backend");
  assert.equal(area.organizationId, "org-engineering");
  assert.equal(area.tenantId, "tenant-core");
  assert.equal(area.name, "Backend Platforms");
  assert.equal(area.status, "ACTIVE");
  assert.equal(area.version, 1);
  assert.ok(Object.isFrozen(area));

  // Validation
  assert.throws(
    () => Area.create({ id: "", organizationId: "org-1", tenantId: "t-1", name: "A" }),
    OrganizationValidationError
  );
  assert.throws(
    () => Area.create({ id: "a-1", organizationId: "", tenantId: "t-1", name: "A" }),
    OrganizationValidationError
  );

  // Transitions
  const deactivated = area.deactivate();
  assert.equal(deactivated.status, "INACTIVE");
  assert.equal(deactivated.version, 2);

  const reactivated = deactivated.activate();
  assert.equal(reactivated.status, "ACTIVE");
  assert.equal(reactivated.version, 3);
});

test("Team entity: creation, validation, and lifecycle", () => {
  const team = Team.create({
    id: "team-data-pipelines",
    areaId: "area-backend",
    organizationId: "org-engineering",
    tenantId: "tenant-core",
    name: "Data Pipelines",
    description: "ETL and ingestion team",
  });

  assert.equal(team.id, "team-data-pipelines");
  assert.equal(team.teamId, "team-data-pipelines");
  assert.equal(team.areaId, "area-backend");
  assert.equal(team.organizationId, "org-engineering");
  assert.equal(team.tenantId, "tenant-core");
  assert.equal(team.status, "ACTIVE");
  assert.equal(team.version, 1);
  assert.ok(Object.isFrozen(team));

  // Validation
  assert.throws(
    () => Team.create({ id: "", areaId: "a-1", organizationId: "o-1", tenantId: "t-1", name: "T" }),
    OrganizationValidationError
  );
  assert.throws(
    () => Team.create({ id: "t-1", areaId: "", organizationId: "o-1", tenantId: "t-1", name: "T" }),
    OrganizationValidationError
  );

  // Update & transitions
  const updated = team.update({ name: "Data Streaming", description: "Real-time streaming team" });
  assert.equal(updated.name, "Data Streaming");
  assert.equal(updated.version, 2);

  const deactivated = updated.deactivate();
  assert.equal(deactivated.status, "INACTIVE");
  assert.equal(deactivated.version, 3);
});

test("AgentMembership entity: creation, validation, roles, and status", () => {
  const membership = AgentMembership.create({
    teamId: "team-data-pipelines",
    agentId: "foundation-agent",
    organizationId: "org-engineering",
    tenantId: "tenant-core",
    role: "LEAD",
  });

  assert.ok(membership.id.startsWith("mship_"));
  assert.equal(membership.membershipId, membership.id);
  assert.equal(membership.teamId, "team-data-pipelines");
  assert.equal(membership.agentId, "foundation-agent");
  assert.equal(membership.role, "LEAD");
  assert.equal(membership.status, "ACTIVE");
  assert.ok(Object.isFrozen(membership));

  // Role update
  const updatedRole = membership.updateRole("SPECIALIST");
  assert.equal(updatedRole.role, "SPECIALIST");

  // Deactivation
  const deactivated = updatedRole.deactivate();
  assert.equal(deactivated.status, "INACTIVE");

  // Re-activation
  const reactivated = deactivated.activate();
  assert.equal(reactivated.status, "ACTIVE");

  // Validation
  assert.throws(
    () => AgentMembership.create({ teamId: "", agentId: "a-1", organizationId: "o-1", tenantId: "t-1" }),
    OrganizationValidationError
  );
  assert.throws(
    () => AgentMembership.create({ teamId: "t-1", agentId: "", organizationId: "o-1", tenantId: "t-1" }),
    OrganizationValidationError
  );
  assert.throws(
    () => AgentMembership.create({ teamId: "t-1", agentId: "a-1", organizationId: "o-1", tenantId: "t-1", role: "SUPERUSER" as any }),
    OrganizationValidationError
  );
});

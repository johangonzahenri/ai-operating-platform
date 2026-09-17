import assert from "node:assert/strict";
import test from "node:test";
import { OrganizationService } from "../../src/application/organization/organization-service.js";
import { InMemoryOrganizationRepository } from "../../src/infrastructure/organization/in-memory-organization-repository.js";
import {
  OrganizationConflictError,
  OrganizationNotFoundError,
  AreaNotFoundError,
  TeamNotFoundError,
  CrossTenantOrganizationError,
  MembershipConflictError,
} from "../../src/domain/organization/organization-errors.js";
import { DomainEvent } from "../../src/domain/events/events.js";

function setupService(knownAgentIds: string[] = ["agent-1", "agent-2"]) {
  const publishedEvents: DomainEvent[] = [];
  const repo = new InMemoryOrganizationRepository();
  const service = new OrganizationService({
    repository: repo,
    agentQuery: {
      findById: (id: string) =>
        knownAgentIds.includes(id)
          ? ({ id, name: `Agent ${id}`, status: "ONLINE", version: 1 } as any)
          : undefined,
      list: () => knownAgentIds.map((id) => ({ id, name: `Agent ${id}`, status: "ONLINE", version: 1 } as any)),
    },
    events: {
      publish: (e: DomainEvent) => publishedEvents.push(e),
    },
  });

  return { service, repo, publishedEvents };
}

test("OrganizationService: creates organization and emits domain event", async () => {
  const { service, publishedEvents } = setupService();

  const org = await service.createOrganization({
    id: "org-tech",
    tenantId: "tenant-acme",
    name: "Tech Org",
    description: "Technology Department",
  });

  assert.equal(org.id, "org-tech");
  assert.equal(org.name, "Tech Org");
  assert.equal(publishedEvents.length, 1);
  assert.equal(publishedEvents[0]?.type, "organization.created");
  assert.equal(publishedEvents[0]?.aggregateId, "org-tech");

  // Duplicate fails
  await assert.rejects(
    () => service.createOrganization({ id: "org-tech", tenantId: "tenant-acme", name: "Dupe" }),
    OrganizationConflictError
  );
});

test("OrganizationService: cross-tenant isolation prevents accessing or modifying foreign orgs", async () => {
  const { service } = setupService();

  await service.createOrganization({
    id: "org-tenant-a",
    tenantId: "tenant-a",
    name: "Tenant A Org",
  });

  // Accessing with correct tenant succeeds
  const org = await service.getOrganization("org-tenant-a", "tenant-a");
  assert.ok(org);

  // Accessing with wrong tenant fails closed
  await assert.rejects(
    () => service.getOrganization("org-tenant-a", "tenant-b"),
    CrossTenantOrganizationError
  );

  // Creating Area in tenant-b for tenant-a's organization fails
  await assert.rejects(
    () =>
      service.createArea({
        id: "area-infiltrate",
        organizationId: "org-tenant-a",
        tenantId: "tenant-b",
        name: "Malicious Area",
      }),
    CrossTenantOrganizationError
  );
});

test("OrganizationService: area and team hierarchy enforcement", async () => {
  const { service } = setupService();

  const org = await service.createOrganization({
    id: "org-retail",
    tenantId: "tenant-shop",
    name: "Retail Division",
  });

  // Area requires valid org
  await assert.rejects(
    () => service.createArea({ id: "area-1", organizationId: "org-nonexistent", tenantId: "tenant-shop", name: "Area" }),
    OrganizationNotFoundError
  );

  const area = await service.createArea({
    id: "area-ecommerce",
    organizationId: org.id,
    tenantId: "tenant-shop",
    name: "Ecommerce",
  });
  assert.equal(area.organizationId, org.id);

  // Team requires valid area
  await assert.rejects(
    () => service.createTeam({ id: "team-1", areaId: "area-nonexistent", organizationId: org.id, tenantId: "tenant-shop", name: "Team" }),
    AreaNotFoundError
  );

  const team = await service.createTeam({
    id: "team-checkout",
    areaId: area.id,
    organizationId: org.id,
    tenantId: "tenant-shop",
    name: "Checkout Team",
  });
  assert.equal(team.areaId, area.id);
});

test("OrganizationService: assigns agent to team with existence verification and role", async () => {
  const { service, publishedEvents } = setupService(["agent-alpha"]);

  const org = await service.createOrganization({ id: "org-main", tenantId: "t-1", name: "Main Org" });
  const area = await service.createArea({ id: "area-main", organizationId: org.id, tenantId: "t-1", name: "Main Area" });
  const team = await service.createTeam({ id: "team-main", areaId: area.id, organizationId: org.id, tenantId: "t-1", name: "Main Team" });

  // Unknown agent fails closed
  await assert.rejects(
    () => service.assignAgentToTeam({ teamId: team.id, agentId: "unknown-agent", tenantId: "t-1", role: "LEAD" }),
    OrganizationNotFoundError
  );

  // Known agent assignment succeeds
  const membership = await service.assignAgentToTeam({
    teamId: team.id,
    agentId: "agent-alpha",
    tenantId: "t-1",
    role: "LEAD",
  });
  assert.equal(membership.agentId, "agent-alpha");
  assert.equal(membership.role, "LEAD");

  // Verify event emitted
  const assignedEvent = publishedEvents.find((e) => e.type === "agent.assigned_to_team");
  assert.ok(assignedEvent);

  // Duplicate assignment fails
  await assert.rejects(
    () => service.assignAgentToTeam({ teamId: team.id, agentId: "agent-alpha", tenantId: "t-1" }),
    MembershipConflictError
  );

  // Remove agent
  const removed = await service.removeAgentFromTeam(team.id, "agent-alpha", "t-1");
  assert.equal(removed, true);

  const removedEvent = publishedEvents.find((e) => e.type === "agent.removed_from_team");
  assert.ok(removedEvent);
});

test("OrganizationService: generates complete organization hierarchy tree", async () => {
  const { service } = setupService(["bot-1", "bot-2"]);

  const org = await service.createOrganization({ id: "org-tree", tenantId: "t-tree", name: "Tree Org" });
  const area = await service.createArea({ id: "area-tree", organizationId: org.id, tenantId: "t-tree", name: "Tree Area" });
  const team1 = await service.createTeam({ id: "team-t1", areaId: area.id, organizationId: org.id, tenantId: "t-tree", name: "Tree Team 1" });
  const team2 = await service.createTeam({ id: "team-t2", areaId: area.id, organizationId: org.id, tenantId: "t-tree", name: "Tree Team 2" });

  await service.assignAgentToTeam({ teamId: team1.id, agentId: "bot-1", tenantId: "t-tree", role: "LEAD" });
  await service.assignAgentToTeam({ teamId: team2.id, agentId: "bot-2", tenantId: "t-tree", role: "SPECIALIST" });

  const hierarchy = await service.getOrganizationHierarchy("org-tree", "t-tree");
  assert.equal(hierarchy.organization.id, "org-tree");
  assert.equal(hierarchy.areas.length, 1);
  assert.equal(hierarchy.areas[0]?.area.id, "area-tree");
  assert.equal(hierarchy.areas[0]?.teams.length, 2);
  assert.equal(hierarchy.areas[0]?.teams[0]?.members.length, 1);
  assert.equal(hierarchy.areas[0]?.teams[0]?.members[0]?.agentId, "bot-1");
});

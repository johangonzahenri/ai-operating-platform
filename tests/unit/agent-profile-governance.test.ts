import test from "node:test";
import assert from "node:assert/strict";
import {
  AgentProfile,
  AgentCapability,
  ProfileValidationError,
  ProfileNotFoundError,
  CapabilityNotFoundError,
  CapabilityAlreadyExistsError,
  STANDARD_RESPONSIBILITIES,
} from "../../src/domain/organization/agent-profile.js";
import { InMemoryAgentProfileRepository } from "../../src/infrastructure/persistence/in-memory/in-memory-agent-profile-repository.js";
import { InMemoryOrganizationRepository } from "../../src/infrastructure/organization/in-memory-organization-repository.js";
import { InMemoryAgentRegistry } from "../../src/infrastructure/agent/in-memory-agent-registry.js";
import { AgentProfileService } from "../../src/application/organization/agent-profile-service.js";
import { InMemoryEventPublisher } from "../../src/infrastructure/events/in-memory-event-publisher.js";
import { DomainEvent } from "../../src/domain/events/events.js";
import { Organization } from "../../src/domain/organization/organization.js";
import { Area } from "../../src/domain/organization/area.js";
import { Team } from "../../src/domain/organization/team.js";
import { AgentMembership } from "../../src/domain/organization/agent-membership.js";
import { Agent } from "../../src/domain/agent/agent.js";
import { CrossTenantOrganizationError } from "../../src/domain/organization/organization-errors.js";

test("Prompt 110 - Domain Aggregate: AgentProfile & Capabilities Lifecycle", async (t) => {
  await t.test("1. Creates agent profile with valid attributes and default state", () => {
    const profile = AgentProfile.create({
      agentId: "agent-001",
      tenantId: "tenant-alpha",
      organizationId: "org-alpha",
      teamId: "team-backend",
      role: "SPECIALIST",
      responsibilities: ["BACKEND_DEVELOPMENT", "API_DESIGN"],
    });

    assert.equal(profile.agentId, "agent-001");
    assert.equal(profile.tenantId, "tenant-alpha");
    assert.equal(profile.organizationId, "org-alpha");
    assert.equal(profile.teamId, "team-backend");
    assert.equal(profile.role, "SPECIALIST");
    assert.equal(profile.status, "ACTIVE");
    assert.equal(profile.version, 1);
    assert.deepEqual(profile.responsibilities, ["BACKEND_DEVELOPMENT", "API_DESIGN"]);
    assert.equal(profile.capabilities.length, 0);
    assert.ok(profile.createdAt instanceof Date);
    assert.ok(profile.updatedAt instanceof Date);
  });

  await t.test("2. Rejects invalid agentId, tenantId, organizationId, teamId, and role fail-closed", () => {
    assert.throws(
      () => AgentProfile.create({ agentId: "", tenantId: "tenant-a", organizationId: "org-1", teamId: "team-1" }),
      ProfileValidationError
    );
    assert.throws(
      () => AgentProfile.create({ agentId: "ag-1", tenantId: "", organizationId: "org-1", teamId: "team-1" }),
      ProfileValidationError
    );
    assert.throws(
      () => AgentProfile.create({ agentId: "ag-1", tenantId: "tenant-a", organizationId: "", teamId: "team-1" }),
      ProfileValidationError
    );
    assert.throws(
      () => AgentProfile.create({ agentId: "ag-1", tenantId: "tenant-a", organizationId: "org-1", teamId: "" }),
      ProfileValidationError
    );
    assert.throws(
      () => AgentProfile.create({ agentId: "ag-1", tenantId: "tenant-a", organizationId: "org-1", teamId: "team-1", role: "SUPERUSER" as any }),
      ProfileValidationError
    );
  });

  await t.test("3. Adds capability and manages lifecycle (DECLARED -> VERIFIED -> DISABLED)", () => {
    let profile = AgentProfile.create({
      agentId: "agent-002",
      tenantId: "tenant-alpha",
      organizationId: "org-alpha",
      teamId: "team-alpha",
      role: "OPERATOR",
    });

    // Add capability
    profile = profile.addCapability({
      id: "cap-ts",
      name: "TypeScript Compilation",
      category: "CODE_ENGINEERING",
      description: "Compile and typecheck TypeScript codebases",
    });

    assert.equal(profile.capabilities.length, 1);
    assert.equal(profile.version, 2);
    const cap = profile.capabilities.find((c) => c.id === "cap-ts");
    assert.ok(cap);
    assert.equal(cap.name, "TypeScript Compilation");
    assert.equal(cap.status, "DECLARED");
    assert.equal(cap.verifiedAt, undefined);

    // Verify capability
    profile = profile.verifyCapability("cap-ts", "security-lead");
    assert.equal(profile.version, 3);
    const verifiedCap = profile.capabilities.find((c) => c.id === "cap-ts");
    assert.ok(verifiedCap);
    assert.equal(verifiedCap.status, "VERIFIED");
    assert.equal(verifiedCap.verifiedBy, "security-lead");
    assert.ok(verifiedCap.verifiedAt instanceof Date);
    assert.equal(profile.hasCapability("cap-ts", true), true);

    // Disable capability
    profile = profile.disableCapability("cap-ts");
    assert.equal(profile.version, 4);
    const disabledCap = profile.capabilities.find((c) => c.id === "cap-ts");
    assert.ok(disabledCap);
    assert.equal(disabledCap.status, "DISABLED");
    assert.equal(profile.hasCapability("cap-ts", true), false);

    // Remove capability
    profile = profile.removeCapability("cap-ts");
    assert.equal(profile.version, 5);
    assert.equal(profile.capabilities.length, 0);
  });

  await t.test("4. Capability invariant checks (duplicate IDs, non-existent)", () => {
    let profile = AgentProfile.create({
      agentId: "agent-003",
      tenantId: "tenant-alpha",
      organizationId: "org-alpha",
      teamId: "team-alpha",
    });

    profile = profile.addCapability({
      id: "cap-audit",
      name: "Security Audit",
    });

    // Duplicate capability
    assert.throws(
      () => profile.addCapability({ id: "cap-audit", name: "Another Audit" }),
      CapabilityAlreadyExistsError
    );

    // Non-existent capability operations
    assert.throws(
      () => profile.verifyCapability("cap-nonexistent", "verifier"),
      CapabilityNotFoundError
    );
    assert.throws(
      () => profile.removeCapability("cap-nonexistent"),
      CapabilityNotFoundError
    );
    assert.throws(
      () => profile.disableCapability("cap-nonexistent"),
      CapabilityNotFoundError
    );
  });

  await t.test("5. Responsibilities and Role updates", () => {
    let profile = AgentProfile.create({
      agentId: "agent-resp",
      tenantId: "tenant-alpha",
      organizationId: "org-alpha",
      teamId: "team-alpha",
      role: "OPERATOR",
    });

    profile = profile.setResponsibilities([
      "CODE_REVIEW",
      "SECURITY_AUDIT",
    ]);

    assert.equal(profile.hasResponsibility("CODE_REVIEW"), true);
    assert.equal(profile.hasResponsibility("NON_EXISTENT"), false);

    profile = profile.updateRole("LEAD");
    assert.equal(profile.role, "LEAD");
  });
});

test("Prompt 110 - Application Service: AgentProfileService & Multi-Criteria Discovery", async (t) => {
  const publishedEvents: DomainEvent[] = [];
  const eventPublisher = new InMemoryEventPublisher();
  eventPublisher.subscribe((e) => { publishedEvents.push(e); });

  const profileRepository = new InMemoryAgentProfileRepository();
  const organizationRepository = new InMemoryOrganizationRepository();
  const agentRepository = new InMemoryAgentRegistry();

  const service = new AgentProfileService({
    profileRepository,
    organizationRepository,
    agentQuery: agentRepository,
    events: eventPublisher,
  });

  // Setup org hierarchy
  const org1 = Organization.create({ id: "org-1", tenantId: "tenant-a", name: "Org 1" });
  await organizationRepository.saveOrganization(org1);
  const area1 = Area.create({ id: "area-1", organizationId: "org-1", tenantId: "tenant-a", name: "Area 1" });
  await organizationRepository.saveArea(area1);
  const team1 = Team.create({ id: "team-1", organizationId: "org-1", areaId: "area-1", tenantId: "tenant-a", name: "Team 1" });
  await organizationRepository.saveTeam(team1);
  const teamSec = Team.create({ id: "team-sec", organizationId: "org-1", areaId: "area-1", tenantId: "tenant-a", name: "Team Sec" });
  await organizationRepository.saveTeam(teamSec);
  const teamQA = Team.create({ id: "team-qa", organizationId: "org-1", areaId: "area-1", tenantId: "tenant-a", name: "Team QA" });
  await organizationRepository.saveTeam(teamQA);

  // Setup tenant-b org
  const orgB = Organization.create({ id: "org-b", tenantId: "tenant-b", name: "Org B" });
  await organizationRepository.saveOrganization(orgB);
  const areaB = Area.create({ id: "area-b", organizationId: "org-b", tenantId: "tenant-b", name: "Area B" });
  await organizationRepository.saveArea(areaB);
  const teamB = Team.create({ id: "team-b", organizationId: "org-b", areaId: "area-b", tenantId: "tenant-b", name: "Team B" });
  await organizationRepository.saveTeam(teamB);

  // Setup agents and memberships
  const agent1 = Agent.create({ id: "agent-service-1", name: "Agent 1", model: "stub", instructions: "inst", tools: [] });
  agentRepository.register(agent1);
  await organizationRepository.saveMembership(AgentMembership.create({ teamId: "team-1", agentId: "agent-service-1", organizationId: "org-1", role: "LEAD", tenantId: "tenant-a" }));

  const agentSecLead = Agent.create({ id: "agent-sec-lead", name: "Sec Lead", model: "stub", instructions: "inst", tools: [] });
  agentRepository.register(agentSecLead);
  await organizationRepository.saveMembership(AgentMembership.create({ teamId: "team-sec", agentId: "agent-sec-lead", organizationId: "org-1", role: "LEAD", tenantId: "tenant-a" }));

  const agentSecOp = Agent.create({ id: "agent-sec-op", name: "Sec Op", model: "stub", instructions: "inst", tools: [] });
  agentRepository.register(agentSecOp);
  await organizationRepository.saveMembership(AgentMembership.create({ teamId: "team-sec", agentId: "agent-sec-op", organizationId: "org-1", role: "OPERATOR", tenantId: "tenant-a" }));

  const agentQASpec = Agent.create({ id: "agent-qa-spec", name: "QA Spec", model: "stub", instructions: "inst", tools: [] });
  agentRepository.register(agentQASpec);
  await organizationRepository.saveMembership(AgentMembership.create({ teamId: "team-qa", agentId: "agent-qa-spec", organizationId: "org-1", role: "SPECIALIST", tenantId: "tenant-a" }));

  const agentTenantB = Agent.create({ id: "agent-tenant-b", name: "Agent B", model: "stub", instructions: "inst", tools: [] });
  agentRepository.register(agentTenantB);
  await organizationRepository.saveMembership(AgentMembership.create({ teamId: "team-b", agentId: "agent-tenant-b", organizationId: "org-b", role: "LEAD", tenantId: "tenant-b" }));

  await t.test("1. Creates profile and emits domain event", async () => {
    const profile = await service.createProfile({
      agentId: "agent-service-1",
      tenantId: "tenant-a",
      organizationId: "org-1",
      teamId: "team-1",
      role: "LEAD",
      responsibilities: ["ARCHITECTURE_DESIGN", "CODE_REVIEW"],
    });

    assert.equal(profile.agentId, "agent-service-1");
    assert.equal(profile.role, "LEAD");
    const retrieved = await service.getProfile("agent-service-1", "tenant-a");
    assert.equal(retrieved.agentId, "agent-service-1");

    assert.ok(publishedEvents.some((e) => e.type === "agent.profile.created"));
  });

  await t.test("2. Adds and verifies capability through service", async () => {
    const updated = await service.addCapability("agent-service-1", {
      id: "cap-arch",
      name: "Enterprise Architecture",
      category: "DESIGN",
    }, "tenant-a");

    assert.equal(updated.capabilities.length, 1);
    assert.ok(publishedEvents.some((e) => e.type === "agent.capability.added"));

    const verified = await service.verifyCapability(
      "agent-service-1",
      "cap-arch",
      "chief-architect",
      "tenant-a"
    );

    assert.equal(verified.capabilities[0]?.status, "VERIFIED");
    assert.equal(verified.capabilities[0]?.verifiedBy, "chief-architect");
    assert.ok(publishedEvents.some((e) => e.type === "agent.capability.verified"));
  });

  await t.test("3. Multi-criteria Agent Discovery across tenant", async () => {
    // Seed diverse agent profiles in tenant-a
    await service.createProfile({
      agentId: "agent-sec-lead",
      tenantId: "tenant-a",
      organizationId: "org-1",
      teamId: "team-sec",
      role: "LEAD",
      responsibilities: ["SECURITY_AUDIT", "VULNERABILITY_ASSESSMENT"],
      capabilities: [
        { id: "cap-sast", name: "SAST Scanning", category: "SECURITY", status: "VERIFIED", verifiedBy: "ciso" },
      ],
    });

    await service.createProfile({
      agentId: "agent-sec-op",
      tenantId: "tenant-a",
      organizationId: "org-1",
      teamId: "team-sec",
      role: "OPERATOR",
      responsibilities: ["SECURITY_AUDIT"],
      capabilities: [
        { id: "cap-sast", name: "SAST Scanning", category: "SECURITY", status: "VERIFIED", verifiedBy: "lead" },
      ],
    });

    await service.createProfile({
      agentId: "agent-qa-spec",
      tenantId: "tenant-a",
      organizationId: "org-1",
      teamId: "team-qa",
      role: "SPECIALIST",
      responsibilities: ["TEST_AUTOMATION"],
      capabilities: [
        { id: "cap-e2e", name: "E2E Testing", category: "QA", status: "DECLARED" },
      ],
    });

    // Seed agent profile in isolated tenant-b (MUST NOT BE RETURNED)
    await service.createProfile({
      agentId: "agent-tenant-b",
      tenantId: "tenant-b",
      organizationId: "org-b",
      teamId: "team-b",
      role: "LEAD",
      responsibilities: ["SECURITY_AUDIT"],
      capabilities: [
        { id: "cap-sast", name: "SAST Scanning", category: "SECURITY", status: "VERIFIED" },
      ],
    });

    // Discovery 1: By Role = LEAD
    const leads = await service.discoverAgents({ tenantId: "tenant-a", role: "LEAD" });
    assert.ok(leads.some((a) => a.agentId === "agent-service-1"));
    assert.ok(leads.some((a) => a.agentId === "agent-sec-lead"));
    assert.ok(!leads.some((a) => a.agentId === "agent-tenant-b")); // Strict multi-tenant isolation

    // Discovery 2: By Responsibility = SECURITY_AUDIT
    const auditors = await service.discoverAgents({ tenantId: "tenant-a", responsibility: "SECURITY_AUDIT" });
    assert.equal(auditors.length, 2);
    assert.ok(auditors.some((a) => a.agentId === "agent-sec-lead"));
    assert.ok(auditors.some((a) => a.agentId === "agent-sec-op"));

    // Discovery 3: By Capability = cap-sast with VERIFIED status
    const verifiedScanners = await service.discoverAgents({
      tenantId: "tenant-a",
      capabilityId: "cap-sast",
      capabilityStatus: "VERIFIED",
    });
    assert.equal(verifiedScanners.length, 2);

    // Discovery 4: Non-matching criteria returns empty array
    const nonMatching = await service.discoverAgents({
      tenantId: "tenant-a",
      role: "REVIEWER",
      capabilityId: "cap-sast",
    });
    assert.equal(nonMatching.length, 0);
  });

  await t.test("4. Coordination Candidate Matching", async () => {
    const candidate = await service.matchAgentForCoordination({
      tenantId: "tenant-a",
      teamId: "team-sec",
      requiredResponsibility: "SECURITY_AUDIT",
      requiredCapability: "cap-sast",
      requireVerifiedCapability: true,
    });

    assert.ok(candidate);
    assert.ok(candidate.agentId === "agent-sec-lead" || candidate.agentId === "agent-sec-op");
  });
});

test("Prompt 110 - Invariant & Adversarial Proofs: Role != Permission, Capability != Grant, Cross-Tenant Isolation", async (t) => {
  const profileRepository = new InMemoryAgentProfileRepository();
  const organizationRepository = new InMemoryOrganizationRepository();
  const agentRepository = new InMemoryAgentRegistry();

  const service = new AgentProfileService({
    profileRepository,
    organizationRepository,
    agentQuery: agentRepository,
  });

  const orgCorp = Organization.create({ id: "org-corp", tenantId: "tenant-corp", name: "Corp" });
  await organizationRepository.saveOrganization(orgCorp);
  const areaCorp = Area.create({ id: "area-corp", organizationId: "org-corp", tenantId: "tenant-corp", name: "Area Corp" });
  await organizationRepository.saveArea(areaCorp);
  const teamCorp = Team.create({ id: "team-corp", organizationId: "org-corp", areaId: "area-corp", tenantId: "tenant-corp", name: "Team Corp" });
  await organizationRepository.saveTeam(teamCorp);

  const orgX = Organization.create({ id: "org-x", tenantId: "tenant-x", name: "Org X" });
  await organizationRepository.saveOrganization(orgX);
  const areaX = Area.create({ id: "area-x", organizationId: "org-x", tenantId: "tenant-x", name: "Area X" });
  await organizationRepository.saveArea(areaX);
  const teamX = Team.create({ id: "team-x", organizationId: "org-x", areaId: "area-x", tenantId: "tenant-x", name: "Team X" });
  await organizationRepository.saveTeam(teamX);

  const agentLead = Agent.create({ id: "agent-lead-invariant", name: "Lead", model: "stub", instructions: "inst", tools: [] });
  agentRepository.register(agentLead);
  await organizationRepository.saveMembership(AgentMembership.create({ teamId: "team-corp", agentId: "agent-lead-invariant", organizationId: "org-corp", role: "LEAD", tenantId: "tenant-corp" }));

  const agentCap = Agent.create({ id: "agent-cap-invariant", name: "Cap", model: "stub", instructions: "inst", tools: [] });
  agentRepository.register(agentCap);
  await organizationRepository.saveMembership(AgentMembership.create({ teamId: "team-corp", agentId: "agent-cap-invariant", organizationId: "org-corp", role: "SPECIALIST", tenantId: "tenant-corp" }));

  const agentX = Agent.create({ id: "agent-tenant-x", name: "Agent X", model: "stub", instructions: "inst", tools: [] });
  agentRepository.register(agentX);
  await organizationRepository.saveMembership(AgentMembership.create({ teamId: "team-x", agentId: "agent-tenant-x", organizationId: "org-x", role: "LEAD", tenantId: "tenant-x" }));

  await t.test("Invariant 1: Role != Permission (LEAD role does not bypass domain rules)", async () => {
    const lead = await service.createProfile({
      agentId: "agent-lead-invariant",
      tenantId: "tenant-corp",
      organizationId: "org-corp",
      teamId: "team-corp",
      role: "LEAD",
    });

    // Having role LEAD does NOT grant invalid mutations
    assert.throws(
      () => lead.addCapability({ id: "", name: "" }),
      ProfileValidationError
    );
  });

  await t.test("Invariant 2: Capability != Tool / Model Grant (Capability is functional suitability, not security allowlist)", async () => {
    await service.createProfile({
      agentId: "agent-cap-invariant",
      tenantId: "tenant-corp",
      organizationId: "org-corp",
      teamId: "team-corp",
      role: "SPECIALIST",
    });

    const updated = await service.addCapability("agent-cap-invariant", {
      id: "cap-exec-command",
      name: "Shell Execution",
      category: "SYSTEM",
      status: "VERIFIED",
    }, "tenant-corp");

    const cap = updated.capabilities.find((c) => c.id === "cap-exec-command");
    assert.ok(cap);
    assert.equal(cap.status, "VERIFIED");
  });

  await t.test("Invariant 3: Strict Multi-Tenant Isolation (0 Cross-tenant discovery or access)", async () => {
    await service.createProfile({
      agentId: "agent-tenant-x",
      tenantId: "tenant-x",
      organizationId: "org-x",
      teamId: "team-x",
      role: "LEAD",
      responsibilities: ["SECRET_PROJECT"],
    });

    // Attempt to access tenant-x profile from tenant-y
    await assert.rejects(
      () => service.getProfile("agent-tenant-x", "tenant-y"),
      CrossTenantOrganizationError
    );

    // Attempt to discover tenant-x profiles from tenant-y
    const discoveryTenantY = await service.discoverAgents({
      tenantId: "tenant-y",
      responsibility: "SECRET_PROJECT",
    });
    assert.equal(discoveryTenantY.length, 0);

    // Attempt to mutate tenant-x profile from tenant-y
    await assert.rejects(
      () => service.updateRole("agent-tenant-x", "OPERATOR", "tenant-y"),
      CrossTenantOrganizationError
    );
  });
});

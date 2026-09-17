import assert from "node:assert/strict";
import test from "node:test";
import {
  TeamResourceBudget,
  BudgetValidationError,
  BudgetExhaustedError,
  BudgetSuspendedError,
  BudgetNotFoundError,
  OrganizationConflictError,
  CrossTenantOrganizationError,
  Organization,
  Area,
  Team,
} from "../../src/domain/organization/index.js";
import { SqliteDatabase } from "../../src/infrastructure/persistence/sqlite/sqlite-database.js";
import { SqliteTeamResourceBudgetRepository } from "../../src/infrastructure/persistence/sqlite/sqlite-team-resource-budget-repository.js";
import { SqliteOrganizationRepository } from "../../src/infrastructure/persistence/sqlite/sqlite-organization-repository.js";
import { InMemoryTeamResourceBudgetRepository } from "../../src/infrastructure/organization/in-memory-team-resource-budget-repository.js";
import { InMemoryOrganizationRepository } from "../../src/infrastructure/organization/in-memory-organization-repository.js";
import { TeamResourceBudgetService } from "../../src/application/organization/team-resource-budget-service.js";
import { createPlatform } from "../../src/interfaces/composition.js";
import { PlatformService } from "../../src/platform/api/platform-service.js";
import { createHttpServer } from "../../src/platform/api/http-router.js";
import { unlinkSync, existsSync } from "node:fs";

test("Prompt 103 — Team Resource Budget: Domain Aggregate Suite", async (t) => {
  await t.test("creates valid TeamResourceBudget with default zero consumption and ACTIVE status", () => {
    const budget = TeamResourceBudget.create({
      id: "trb_team-dev",
      teamId: "team-dev",
      organizationId: "org-eng",
      tenantId: "tenant-1",
      limits: {
        maxExecutions: 10,
        maxModelCalls: 50,
        maxToolCalls: 100,
        maxAutonomousSteps: 200,
        maxDurationMs: 300000,
        maxTokens: 50000,
      },
      window: "LIFETIME",
    });

    assert.equal(budget.id, "trb_team-dev");
    assert.equal(budget.budgetId, "trb_team-dev");
    assert.equal(budget.teamId, "team-dev");
    assert.equal(budget.organizationId, "org-eng");
    assert.equal(budget.tenantId, "tenant-1");
    assert.equal(budget.status, "ACTIVE");
    assert.equal(budget.window, "LIFETIME");
    assert.equal(budget.version, 1);
    assert.equal(budget.consumed.executions, 0);
    assert.equal(budget.consumed.modelCalls, 0);
    assert.equal(budget.consumed.toolCalls, 0);
    assert.equal(budget.consumed.autonomousSteps, 0);
    assert.equal(budget.consumed.durationMs, 0);
    assert.equal(budget.consumed.tokens, 0);

    const rem = budget.getRemaining();
    assert.equal(rem.executions, 10);
    assert.equal(rem.modelCalls, 50);
    assert.equal(rem.toolCalls, 100);
    assert.equal(rem.autonomousSteps, 200);
    assert.equal(rem.durationMs, 300000);
    assert.equal(rem.tokens, 50000);
  });

  await t.test("validation rejects negative or non-integer limits", () => {
    assert.throws(
      () =>
        TeamResourceBudget.create({
          teamId: "team-1",
          organizationId: "org-1",
          tenantId: "tenant-1",
          limits: {
            maxExecutions: -5,
            maxModelCalls: 10,
            maxToolCalls: 10,
            maxAutonomousSteps: 10,
            maxDurationMs: 1000,
          },
        }),
      BudgetValidationError
    );

    assert.throws(
      () =>
        TeamResourceBudget.create({
          teamId: "team-1",
          organizationId: "org-1",
          tenantId: "tenant-1",
          limits: {
            maxExecutions: 5.5,
            maxModelCalls: 10,
            maxToolCalls: 10,
            maxAutonomousSteps: 10,
            maxDurationMs: 1000,
          },
        }),
      BudgetValidationError
    );
  });

  await t.test("canConsume checks limits and rejects over-quota requests", () => {
    const budget = TeamResourceBudget.create({
      teamId: "team-1",
      organizationId: "org-1",
      tenantId: "tenant-1",
      limits: {
        maxExecutions: 2,
        maxModelCalls: 5,
        maxToolCalls: 10,
        maxAutonomousSteps: 20,
        maxDurationMs: 5000,
      },
    });

    const allowed = budget.canConsume({ executions: 1, modelCalls: 2 });
    assert.equal(allowed.allowed, true);

    const denied = budget.canConsume({ executions: 5 });
    assert.equal(denied.allowed, false);
    assert.match(denied.reason!, /Insufficient execution quota/);
  });

  await t.test("consume increments counters, increments version (OCC), and transitions to EXHAUSTED", () => {
    const budget = TeamResourceBudget.create({
      teamId: "team-1",
      organizationId: "org-1",
      tenantId: "tenant-1",
      limits: {
        maxExecutions: 2,
        maxModelCalls: 5,
        maxToolCalls: 10,
        maxAutonomousSteps: 20,
        maxDurationMs: 5000,
      },
    });

    const step1 = budget.consume({ executions: 1, modelCalls: 2 });
    assert.equal(step1.version, 2);
    assert.equal(step1.consumed.executions, 1);
    assert.equal(step1.consumed.modelCalls, 2);
    assert.equal(step1.status, "ACTIVE");

    const step2 = step1.consume({ executions: 1 });
    assert.equal(step2.version, 3);
    assert.equal(step2.consumed.executions, 2);
    assert.equal(step2.status, "EXHAUSTED");
    assert.equal(step2.isExhausted(), true);

    assert.throws(() => step2.consume({ executions: 1 }), BudgetExhaustedError);
  });

  await t.test("suspend and reactivate transitions", () => {
    const budget = TeamResourceBudget.create({
      teamId: "team-1",
      organizationId: "org-1",
      tenantId: "tenant-1",
      limits: {
        maxExecutions: 5,
        maxModelCalls: 10,
        maxToolCalls: 10,
        maxAutonomousSteps: 10,
        maxDurationMs: 1000,
      },
    });

    const suspended = budget.suspend();
    assert.equal(suspended.status, "SUSPENDED");
    assert.throws(() => suspended.consume({ executions: 1 }), BudgetSuspendedError);

    const reactivated = suspended.reactivate();
    assert.equal(reactivated.status, "ACTIVE");
    const consumed = reactivated.consume({ executions: 1 });
    assert.equal(consumed.consumed.executions, 1);
  });

  await t.test("updateLimits recalculates status if new limits are lower than consumed", () => {
    const budget = TeamResourceBudget.create({
      teamId: "team-1",
      organizationId: "org-1",
      tenantId: "tenant-1",
      limits: {
        maxExecutions: 10,
        maxModelCalls: 10,
        maxToolCalls: 10,
        maxAutonomousSteps: 10,
        maxDurationMs: 1000,
      },
    });

    const consumed = budget.consume({ executions: 5 });
    assert.equal(consumed.status, "ACTIVE");

    // Reduce maxExecutions to 5
    const updated = consumed.updateLimits({ maxExecutions: 5 });
    assert.equal(updated.limits.maxExecutions, 5);
    assert.equal(updated.status, "EXHAUSTED");
  });
});

test("Prompt 103 — SqliteTeamResourceBudgetRepository: Durability, Isolation & Concurrency", async (t) => {
  const dbPath = "data/test-team-budget.db";
  if (existsSync(dbPath)) unlinkSync(dbPath);

  const dbManager = new SqliteDatabase({ dbPath });
  const repo = new SqliteTeamResourceBudgetRepository(dbManager);

  t.after(() => {
    dbManager.close();
    if (existsSync(dbPath)) unlinkSync(dbPath);
  });

  await t.test("save and findById / findByTeamId across tenants", async () => {
    const budgetTenant1 = TeamResourceBudget.create({
      teamId: "team-alpha",
      organizationId: "org-1",
      tenantId: "tenant-1",
      limits: {
        maxExecutions: 100,
        maxModelCalls: 200,
        maxToolCalls: 300,
        maxAutonomousSteps: 400,
        maxDurationMs: 500000,
      },
    });

    await repo.save(budgetTenant1);

    const found = await repo.findByTeamId("team-alpha", "tenant-1");
    assert.ok(found);
    assert.equal(found.teamId, "team-alpha");
    assert.equal(found.limits.maxExecutions, 100);

    // Cross-tenant isolation
    const crossTenantFound = await repo.findByTeamId("team-alpha", "tenant-2");
    assert.equal(crossTenantFound, undefined);
  });

  await t.test("durability across repository restart on same SQLite file", async () => {
    const repoRestarted = new SqliteTeamResourceBudgetRepository(dbManager);
    const found = await repoRestarted.findByTeamId("team-alpha", "tenant-1");
    assert.ok(found);
    assert.equal(found.teamId, "team-alpha");
    assert.equal(found.version, 1);
  });

  await t.test("atomic check-and-consume updates consumed and version atomically", async () => {
    const result = await repo.consumeAtomic("team-alpha", "tenant-1", { executions: 2, modelCalls: 5 });
    assert.equal(result.success, true);
    assert.ok(result.budget);
    assert.equal(result.budget.consumed.executions, 2);
    assert.equal(result.budget.consumed.modelCalls, 5);
    assert.equal(result.budget.version, 2);

    const reloaded = await repo.findByTeamId("team-alpha", "tenant-1");
    assert.equal(reloaded?.consumed.executions, 2);
    assert.equal(reloaded?.version, 2);
  });

  await t.test("Last-Unit Race Condition: 2 parallel requests competing for 1 unit resolve in 1 ALLOW and 1 DENY", async () => {
    // Create a dedicated team budget with exactly 1 execution unit available
    const raceBudget = TeamResourceBudget.create({
      id: "trb_race-team",
      teamId: "race-team",
      organizationId: "org-1",
      tenantId: "tenant-1",
      limits: {
        maxExecutions: 1,
        maxModelCalls: 10,
        maxToolCalls: 10,
        maxAutonomousSteps: 10,
        maxDurationMs: 10000,
      },
    });
    await repo.save(raceBudget);

    // Concurrently execute 2 consumption requests for 1 execution each
    const [res1, res2] = await Promise.all([
      repo.consumeAtomic("race-team", "tenant-1", { executions: 1 }),
      repo.consumeAtomic("race-team", "tenant-1", { executions: 1 }),
    ]);

    const successes = [res1, res2].filter((r) => r.success);
    const failures = [res1, res2].filter((r) => !r.success);

    assert.equal(successes.length, 1, "Exactly one request must succeed (ALLOW)");
    assert.equal(failures.length, 1, "Exactly one request must fail (DENY)");
    assert.match(failures[0]?.reason ?? "", /Insufficient execution quota|EXHAUSTED/);

    const finalBudget = await repo.findByTeamId("race-team", "tenant-1");


    assert.equal(finalBudget?.consumed.executions, 1);
    assert.equal(finalBudget?.status, "EXHAUSTED");
    assert.equal(finalBudget?.version, 2);
  });
});

test("Prompt 103 — TeamResourceBudgetService: Governance & Event Flow", async (t) => {
  const orgRepo = new InMemoryOrganizationRepository();
  const budgetRepo = new InMemoryTeamResourceBudgetRepository();
  const eventsPublished: any[] = [];
  const events = {
    publish: (e: any) => {
      eventsPublished.push(e);
    },
  };

  const service = new TeamResourceBudgetService({
    budgetRepository: budgetRepo,
    organizationRepository: orgRepo,
    events,
  });

  // Seed Hierarchy
  const org = Organization.create({ id: "org-corp", tenantId: "tenant-corp", name: "Corp Org" });
  await orgRepo.saveOrganization(org);
  const area = Area.create({ id: "area-eng", organizationId: "org-corp", tenantId: "tenant-corp", name: "Engineering" });
  await orgRepo.saveArea(area);
  const team = Team.create({ id: "team-platform", areaId: "area-eng", organizationId: "org-corp", tenantId: "tenant-corp", name: "Platform Team" });
  await orgRepo.saveTeam(team);

  await t.test("creates budget and publishes team.budget.created event", async () => {
    const budget = await service.createBudget({
      teamId: "team-platform",
      tenantId: "tenant-corp",
      limits: {
        maxExecutions: 20,
        maxModelCalls: 50,
        maxToolCalls: 100,
        maxAutonomousSteps: 200,
        maxDurationMs: 60000,
      },
    });

    assert.equal(budget.teamId, "team-platform");
    assert.ok(eventsPublished.some((e) => e.type === "team.budget.created"));
  });

  await t.test("rejects creating duplicate budget for same team with OrganizationConflictError", async () => {
    await assert.rejects(
      () =>
        service.createBudget({
          teamId: "team-platform",
          tenantId: "tenant-corp",
          limits: {
            maxExecutions: 10,
            maxModelCalls: 10,
            maxToolCalls: 10,
            maxAutonomousSteps: 10,
            maxDurationMs: 1000,
          },
        }),
      OrganizationConflictError
    );
  });

  await t.test("evaluateAndConsume publishes authorization or denial events", async () => {
    const authResult = await service.evaluateAndConsume("team-platform", "tenant-corp", {
      executions: 1,
      modelCalls: 2,
    });
    assert.equal(authResult.allowed, true);
    assert.ok(eventsPublished.some((e) => e.type === "team.resource.consumption.authorized"));

    // Over-quota request
    const denyResult = await service.evaluateAndConsume("team-platform", "tenant-corp", {
      executions: 50,
    });
    assert.equal(denyResult.allowed, false);
    assert.ok(eventsPublished.some((e) => e.type === "team.resource.consumption.denied"));
  });

  await t.test("cross-tenant access is rejected fail-closed", async () => {
    const result = await service.evaluateAndConsume("team-platform", "tenant-attacker", {
      executions: 1,
    });
    assert.equal(result.allowed, false);
    assert.match(result.reason!, /forbidden/i);
  });
});

test("Prompt 103 — Platform HTTP REST API: Team Budget & Quotas", async (t) => {
  const PORT = 3189;
  const BASE_URL = `http://127.0.0.1:${PORT}`;

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
    teamResourceBudgetService: platform.teamResourceBudgetService,
  });
  const server = createHttpServer(service);

  await new Promise<void>((resolve) => {
    server.listen(PORT, "127.0.0.1", () => resolve());
  });

  t.after(() => {
    server.close();
  });

  const tenantHeaders = {
    "Content-Type": "application/json",
    "X-Tenant-Id": "tenant-api-test",
  };

  // 1. Create org -> area -> team
  await fetch(`${BASE_URL}/api/v1/organizations`, {
    method: "POST",
    headers: tenantHeaders,
    body: JSON.stringify({ id: "org-api", name: "API Org" }),
  });
  await fetch(`${BASE_URL}/api/v1/organizations/org-api/areas`, {
    method: "POST",
    headers: tenantHeaders,
    body: JSON.stringify({ id: "area-api", name: "API Area" }),
  });
  await fetch(`${BASE_URL}/api/v1/areas/area-api/teams`, {
    method: "POST",
    headers: tenantHeaders,
    body: JSON.stringify({ id: "team-api", organizationId: "org-api", name: "API Team" }),
  });

  await t.test("GET /api/v1/teams/:id/budget returns 404 when no budget exists", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/teams/team-api/budget`, {
      headers: tenantHeaders,
    });
    assert.equal(res.status, 404);
  });

  await t.test("POST /api/v1/teams/:id/budget creates budget (201)", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/teams/team-api/budget`, {
      method: "POST",
      headers: tenantHeaders,
      body: JSON.stringify({
        limits: {
          maxExecutions: 25,
          maxModelCalls: 50,
          maxToolCalls: 100,
          maxAutonomousSteps: 250,
          maxDurationMs: 120000,
        },
        window: "MONTHLY",
      }),
    });
    assert.equal(res.status, 201);
    const data = await res.json() as any;
    assert.equal(data.teamId, "team-api");
    assert.equal(data.limits.maxExecutions, 25);
    assert.equal(data.status, "ACTIVE");
    assert.equal(data.window, "MONTHLY");
  });

  await t.test("GET /api/v1/teams/:id/budget returns budget and remaining calculations (200)", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/teams/team-api/budget`, {
      headers: tenantHeaders,
    });
    assert.equal(res.status, 200);
    const data = await res.json() as any;
    assert.equal(data.teamId, "team-api");
    assert.equal(data.remaining.maxExecutions ?? data.remaining.executions, 25);
  });

  await t.test("POST /api/v1/teams/:id/budget/consume allows within quota (200) and rejects over quota (429)", async () => {
    const allowRes = await fetch(`${BASE_URL}/api/v1/teams/team-api/budget/consume`, {
      method: "POST",
      headers: tenantHeaders,
      body: JSON.stringify({ executions: 5, modelCalls: 10 }),
    });
    assert.equal(allowRes.status, 200);
    const allowData = await allowRes.json() as any;
    assert.equal(allowData.allowed, true);
    assert.equal(allowData.budget.consumed.executions, 5);

    const denyRes = await fetch(`${BASE_URL}/api/v1/teams/team-api/budget/consume`, {
      method: "POST",
      headers: tenantHeaders,
      body: JSON.stringify({ executions: 50 }),
    });
    assert.equal(denyRes.status, 429);
    const denyData = await denyRes.json() as any;
    assert.equal(denyData.allowed, false);
  });

  await t.test("PATCH /api/v1/teams/:id/budget suspends budget (200)", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/teams/team-api/budget`, {
      method: "PATCH",
      headers: tenantHeaders,
      body: JSON.stringify({ status: "SUSPENDED" }),
    });
    assert.equal(res.status, 200);
    const data = await res.json() as any;
    assert.equal(data.status, "SUSPENDED");

    // Any consumption while suspended must return 403 or 429
    const consumeRes = await fetch(`${BASE_URL}/api/v1/teams/team-api/budget/consume`, {
      method: "POST",
      headers: tenantHeaders,
      body: JSON.stringify({ executions: 1 }),
    });
    assert.equal(consumeRes.status, 429);
  });

  await t.test("Strict 404 for /api/platform/v1/teams/:id/budget", async () => {
    const res = await fetch(`${BASE_URL}/api/platform/v1/teams/team-api/budget`, {
      headers: tenantHeaders,
    });
    assert.equal(res.status, 404);
  });
});

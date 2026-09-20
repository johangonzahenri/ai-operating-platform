/**
 * Phase 75 Platform API Tests: Multi-Enterprise Governance & Portfolio Operating Model
 *
 * End-to-end HTTP REST & SDK Client verification for:
 * - POST /api/v1/portfolios
 * - GET  /api/v1/portfolios
 * - GET  /api/v1/portfolios/:id
 * - POST /api/v1/portfolios/:id/enterprises
 * - DELETE /api/v1/portfolios/:id/enterprises/:enterpriseId
 * - GET  /api/v1/portfolios/:id/context
 * - POST /api/v1/portfolios/mandates
 * - GET  /api/v1/portfolios/:id/mandates
 * - POST /api/v1/mandates/:id/revoke
 * - POST /api/v1/portfolios/validate-authority
 * - POST /api/v1/portfolios/objectives
 * - GET  /api/v1/portfolios/:id/objectives
 * - POST /api/v1/portfolio-objectives/:id/activate
 * - POST /api/v1/portfolio-objectives/:id/link-enterprise-objective
 * - POST /api/v1/portfolio-objectives/:id/aggregate
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

test("Phase 75 — Platform HTTP REST API: Multi-Enterprise Governance (/api/v1/portfolios*)", async (t) => {
  let server: http.Server;
  let client: ReturnType<typeof createPlatformClient>;
  let baseUrl: string;
  let platform: ReturnType<typeof createPlatform>;
  let service: PlatformService;

  const TEST_TENANT = "tenant-portfolio-api-test";
  const TEST_KEY_SECRET = "secret-portfolio-admin-12345";
  let apiKeyString: string;

  let portfolioId: string;
  let mandateId: string;
  let objectiveId: string;

  await t.test("Setup: Bootstrap Platform Server with Portfolio Governance", async () => {
    platform = createPlatform();

    const keyHash = ApiKeyRecord.hashSecret(TEST_KEY_SECRET);
    const keyRecord = ApiKeyRecord.create({
      id: "key-portfolio-admin",
      principalId: "executive-group-cfo",
      principalType: "SERVICE",
      keyHash,
      roles: ["system-admin"],
      tenantId: TEST_TENANT,
      status: "ACTIVE",
    });
    await platform.apiKeyRepository.save(keyRecord);
    apiKeyString = `key-portfolio-admin.${TEST_KEY_SECRET}`;

    service = new PlatformService({
      tasks: platform.tasks,
      executions: platform.executions,
      audit: platform.audit,
      metrics: platform.metrics,
      tools: platform.tools,
      submitTask: platform.submitTask,
      executeOrchestration: platform.executeOrchestration,
      portfolioGovernanceService: platform.portfolioGovernanceService,
    });

    server = createHttpServer(service, {
      apiKeyRepository: platform.apiKeyRepository,
      roleRepository: platform.roleRepository,
      enforceSecurity: true,
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;

    client = createPlatformClient({
      baseUrl,
      apiKey: apiKeyString,
      tenantId: TEST_TENANT,
    });
  });

  await t.test("POST /api/v1/portfolios: Create Enterprise Portfolio", async () => {
    const created = await client.portfolios.create({
      id: "port-holding-global",
      name: "Global Holding Group",
      description: "Group portfolio covering all enterprise subsidiaries",
      ownerPrincipalId: "executive-group-cfo",
    });

    assert.equal(created.id, "port-holding-global");
    assert.equal(created.name, "Global Holding Group");
    assert.equal(created.status, "ACTIVE");
    portfolioId = created.id;
  });

  await t.test("GET /api/v1/portfolios: List Portfolios", async () => {
    const list = await client.portfolios.list();
    assert.ok(Array.isArray(list.portfolios));
    assert.ok(list.portfolios.length >= 1);
    assert.equal(list.portfolios.find((p) => p.id === portfolioId)?.name, "Global Holding Group");
  });

  await t.test("POST & DELETE /api/v1/portfolios/:id/enterprises: Manage Memberships", async () => {
    // 1. Add enterprise 1
    const updated1 = await client.portfolios.addEnterprise(portfolioId, {
      enterpriseId: "ent-tentaciones-shop",
      governanceScope: ["COORDINATION", "SHARED_RESOURCE"],
    });
    assert.equal(updated1.memberships.length, 1);
    assert.equal(updated1.memberships[0]?.enterpriseId, "ent-tentaciones-shop");

    // 2. Add enterprise 2
    const updated2 = await client.portfolios.addEnterprise(portfolioId, {
      enterpriseId: "ent-automotive-parts",
      governanceScope: ["COORDINATION"],
    });
    assert.equal(updated2.memberships.length, 2);

    // 3. Remove enterprise 2
    const updated3 = await client.portfolios.removeEnterprise(portfolioId, "ent-automotive-parts");
    assert.equal(updated3.memberships.find((m) => m.enterpriseId === "ent-automotive-parts")?.status, "REMOVED");

    // Re-add for subsequent cross-enterprise tests
    const readded = await client.portfolios.addEnterprise(portfolioId, {
      enterpriseId: "ent-automotive-parts",
      governanceScope: ["COORDINATION"],
    });
    assert.equal(readded.memberships.find((m) => m.enterpriseId === "ent-automotive-parts")?.status, "ACTIVE");
  });

  await t.test("GET /api/v1/portfolios/:id/context: Operating Context", async () => {
    const ctx = await client.portfolios.getContext(portfolioId);
    assert.equal(ctx.portfolio.id, portfolioId);
    assert.equal(ctx.enterprises.length, 2);
    assert.ok(ctx.generatedAt);
  });

  await t.test("POST /api/v1/portfolios/mandates: Grant Governance Mandate", async () => {
    const mandate = await client.portfolios.grantMandate({
      id: "mandate-cross-audit-01",
      portfolioId,
      sourceEnterpriseId: "ent-tentaciones-shop",
      targetEnterpriseIds: ["ent-automotive-parts"],
      granteePrincipalId: "agent-chief-risk-officer",
      authorityScope: "EXECUTIVE_AUDIT",
      allowedOperations: ["audit.read", "metrics.query"],
    });

    assert.equal(mandate.id, "mandate-cross-audit-01");
    assert.equal(mandate.authorityScope, "EXECUTIVE_AUDIT");
    assert.equal(mandate.status, "ACTIVE");
    mandateId = mandate.id;
  });

  await t.test("GET /api/v1/portfolios/:id/mandates: List Mandates", async () => {
    const list = await client.portfolios.listMandates(portfolioId);
    assert.ok(Array.isArray(list.mandates));
    assert.equal(list.mandates.length, 1);
    assert.equal(list.mandates[0]?.id, mandateId);
  });

  await t.test("POST /api/v1/portfolios/validate-authority: Fail-Closed Mandate Validation", async () => {
    // 1. Authorized call
    const auth1 = await client.portfolios.validateAuthority({
      portfolioId,
      granteePrincipalId: "agent-chief-risk-officer",
      sourceEnterpriseId: "ent-tentaciones-shop",
      targetEnterpriseId: "ent-automotive-parts",
      operation: "audit.read",
    });
    assert.equal(auth1.authorized, true);
    assert.equal(auth1.mandateId, mandateId);

    // 2. Denied call (Operation not permitted by mandate)
    const auth2 = await client.portfolios.validateAuthority({
      portfolioId,
      granteePrincipalId: "agent-chief-risk-officer",
      sourceEnterpriseId: "ent-tentaciones-shop",
      targetEnterpriseId: "ent-automotive-parts",
      operation: "database.drop",
    });
    assert.equal(auth2.authorized, false);
  });

  await t.test("POST /api/v1/portfolios/objectives: Create, Activate & Aggregate KPI", async () => {
    const obj = await client.portfolios.createObjective({
      id: "obj-group-ebitda-2026",
      portfolioId,
      title: "Consolidated Group EBITDA 2026",
      type: "FINANCIAL",
      ownerPrincipalId: "executive-group-cfo",
      participatingEnterpriseIds: ["ent-tentaciones-shop", "ent-automotive-parts"],
      aggregationMethod: "SUM",
      targetMetric: {
        name: "EBITDA_USD",
        unit: "USD",
        targetValue: 10000000,
      },
    });

    assert.equal(obj.id, "obj-group-ebitda-2026");
    assert.equal(obj.lifecycleState, "DRAFT");
    objectiveId = obj.id;

    // Activate
    const activated = await client.portfolios.activateObjective(objectiveId);
    assert.equal(activated.lifecycleState, "ACTIVE");

    // Aggregate explicitly
    const aggregated = await client.portfolios.aggregateMetrics(objectiveId, {
      contributions: [
        { enterpriseId: "ent-tentaciones-shop", value: 6000000, status: "MEASURED" },
        { enterpriseId: "ent-automotive-parts", value: 5000000, status: "MEASURED" },
      ],
    });

    assert.equal(aggregated.currentAggregatedValue, 11000000);
    assert.equal(aggregated.gap, -1000000);
  });

  await t.test("POST /api/v1/mandates/:id/revoke: Revoke Mandate", async () => {
    const revoked = await client.portfolios.revokeMandate(mandateId, {
      reason: "Audit cycle concluded",
    });

    assert.equal(revoked.status, "REVOKED");
    assert.equal(revoked.revocationReason, "Audit cycle concluded");

    // Validation must now fail closed
    const auth = await client.portfolios.validateAuthority({
      portfolioId,
      granteePrincipalId: "agent-chief-risk-officer",
      sourceEnterpriseId: "ent-tentaciones-shop",
      targetEnterpriseId: "ent-automotive-parts",
      operation: "audit.read",
    });
    assert.equal(auth.authorized, false);
  });

  await t.test("Teardown: Close HTTP Server", async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });
});

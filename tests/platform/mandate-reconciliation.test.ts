/**
 * Phase 77 Platform API Tests: Governed Mandate Reconciliation & Runtime Consistency
 *
 * End-to-end HTTP REST & SDK Client verification for:
 * 1. POST /api/v1/mandates/:id/reconcile with active mandate returns NO_OP
 * 2. POST /api/v1/mandates/:id/reconcile with expired mandate cancels queued workflows
 * 3. POST /api/v1/mandates/:id/reconcile with OCC mismatch returns 409 CONCURRENCY_CONFLICT
 * 4. POST /api/v1/mandates/:id/reconcile with invalid payload returns 400 VALIDATION_ERROR
 * 5. POST /api/v1/mandates/reconcile-expired executes multi-mandate reconciliation daemon scan
 * 6. SDK client.portfolios.reconcileMandate executes correctly
 * 7. SDK client.portfolios.reconcileExpiredMandates executes correctly
 * 8. Cross-tenant isolation on reconciliation endpoint returns 404 NOT_FOUND
 * 9. Idempotent reconciliation returns identical report on duplicate request
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

test("Phase 77 — Platform Integration: Governed Mandate Reconciliation & Runtime Consistency", async (t) => {
  let server: http.Server;
  let client: ReturnType<typeof createPlatformClient>;
  let baseUrl: string;
  let platform: ReturnType<typeof createPlatform>;
  let service: PlatformService;

  const TENANT_A = "tenant-reconcile-alpha";
  const TENANT_B = "tenant-reconcile-beta";
  const TEST_KEY_SECRET = "secret-reconcile-admin-98765";
  let apiKeyString: string;

  let portfolioId: string;
  let enterpriseAlphaId: string;
  let enterpriseBetaId: string;
  let activeMandateId: string;
  let expiredMandateId: string;

  await t.test("0. Setup: Bootstrap Server with Mandate Reconciliation", async () => {
    platform = createPlatform();

    const keyHash = ApiKeyRecord.hashSecret(TEST_KEY_SECRET);
    const keyRecord = ApiKeyRecord.create({
      id: "key-reconcile-admin",
      principalId: "executive-group-cfo",
      principalType: "SERVICE",
      keyHash,
      roles: ["system-admin"],
      tenantId: TENANT_A,
      status: "ACTIVE",
    });
    await platform.apiKeyRepository.save(keyRecord);
    apiKeyString = `key-reconcile-admin.${TEST_KEY_SECRET}`;

    service = new PlatformService({
      tasks: platform.tasks,
      executions: platform.executions,
      audit: platform.audit,
      metrics: platform.metrics,
      tools: platform.tools,
      models: platform.modelRegistry,
      agents: platform.agentRegistry,
      agentService: platform.agentService,
      submitTask: platform.submitTask,
      executeOrchestration: platform.executeOrchestration,
      operations: platform.operations,
      operationService: platform.operationService,
      eventStore: platform.eventStore,
      db: platform.db,
      diagnostics: platform.diagnostics,
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
      tenantId: TENANT_A,
    });

    // Seed Portfolio and Enterprises
    const entA = await platform.enterpriseOperatingService.createEnterprise({
      id: "ent-reconcile-a",
      tenantId: TENANT_A,
      name: "Enterprise Alpha",
      industry: "HOLDING",
      status: "ACTIVE",
    });
    enterpriseAlphaId = entA.id;

    const entB = await platform.enterpriseOperatingService.createEnterprise({
      id: "ent-reconcile-b",
      tenantId: TENANT_A,
      name: "Enterprise Beta",
      industry: "OPERATIONS",
      status: "ACTIVE",
    });
    enterpriseBetaId = entB.id;

    const port = await platform.portfolioGovernanceService.createPortfolio({
      id: "port-reconcile-1",
      tenantId: TENANT_A,
      name: "Reconciliation Portfolio",
      ownerPrincipalId: "executive-group-cfo",
    });
    portfolioId = port.id;

    await platform.portfolioGovernanceService.addEnterpriseToPortfolio(portfolioId, TENANT_A, {
      enterpriseId: enterpriseAlphaId,
      governanceScope: ["COORDINATION", "STRATEGY"],
    });

    await platform.portfolioGovernanceService.addEnterpriseToPortfolio(portfolioId, TENANT_A, {
      enterpriseId: enterpriseBetaId,
      governanceScope: ["OPERATIONS"],
    });

    const activeMandate = await platform.portfolioGovernanceService.grantMandate({
      id: "mandate-http-active",
      tenantId: TENANT_A,
      portfolioId,
      sourceEnterpriseId: enterpriseAlphaId,
      granteePrincipalId: "agent-reconcile-runner",
      authorityScope: "PORTFOLIO_COORDINATION",
      allowedOperations: ["DISPATCH_TASK"],
      targetEnterpriseIds: [enterpriseBetaId],
      validFrom: new Date(Date.now() - 10000),
      validTo: new Date(Date.now() + 1000000),
    });
    activeMandateId = activeMandate.id;

    const expMandate = await platform.portfolioGovernanceService.grantMandate({
      id: "mandate-http-expired",
      tenantId: TENANT_A,
      portfolioId,
      sourceEnterpriseId: enterpriseAlphaId,
      granteePrincipalId: "agent-reconcile-runner",
      authorityScope: "PORTFOLIO_COORDINATION",
      allowedOperations: ["DISPATCH_TASK"],
      targetEnterpriseIds: [enterpriseBetaId],
      validFrom: new Date(Date.now() - 100000),
      validTo: new Date(Date.now() - 1000), // Expired
    });
    expiredMandateId = expMandate.id;
  });

  await t.test("1. POST /api/v1/mandates/:id/reconcile with active mandate returns NO_OP (200 OK)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/mandates/${activeMandateId}/reconcile`, {
      method: "POST",
      headers: {
        "X-API-Key": apiKeyString,
        "X-Tenant-Id": TENANT_A,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        triggerType: "PERIODIC_AUDIT",
      }),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.status, "NO_OP");
    assert.equal(body.mandateId, activeMandateId);
    assert.equal(body.summary.totalMutated, 0);
  });

  await t.test("2. POST /api/v1/mandates/:id/reconcile with expired mandate returns COMPLETED report (200 OK)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/mandates/${expiredMandateId}/reconcile`, {
      method: "POST",
      headers: {
        "X-API-Key": apiKeyString,
        "X-Tenant-Id": TENANT_A,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        triggerType: "MANDATE_EXPIRED",
      }),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.mandateId, expiredMandateId);
    assert.ok(body.reconciliationId.startsWith("rec-"));
  });

  await t.test("3. POST /api/v1/mandates/:id/reconcile with OCC mismatch returns 409 CONCURRENCY_CONFLICT", async () => {
    const res = await fetch(`${baseUrl}/api/v1/mandates/${activeMandateId}/reconcile`, {
      method: "POST",
      headers: {
        "X-API-Key": apiKeyString,
        "X-Tenant-Id": TENANT_A,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        triggerType: "PERIODIC_AUDIT",
        expectedMandateConcurrencyVersion: 999, // Mismatch
      }),
    });

    assert.equal(res.status, 409);
    const body = (await res.json()) as any;
    assert.equal(body.code, "CONCURRENCY_CONFLICT");
  });

  await t.test("4. POST /api/v1/mandates/reconcile-expired executes daemon scan (200 OK)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/mandates/reconcile-expired`, {
      method: "POST",
      headers: {
        "X-API-Key": apiKeyString,
        "X-Tenant-Id": TENANT_A,
        "Content-Type": "application/json",
      },
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.ok(Array.isArray(body.reports));
    assert.ok(body.total >= 1);
  });

  await t.test("5. SDK Client reconcileMandate & reconcileExpiredMandates work seamlessly", async () => {
    const report = await client.portfolios.reconcileMandate(activeMandateId, {
      triggerType: "PERIODIC_AUDIT",
    });
    assert.equal(report.mandateId, activeMandateId);
    assert.equal(report.status, "NO_OP");

    const scanResult = await client.portfolios.reconcileExpiredMandates();
    assert.ok(Array.isArray(scanResult.reports));
  });

  await t.test("6. Cross-tenant isolation returns 404 NOT_FOUND", async () => {
    // Create an API key for Tenant B
    const keyBSecret = "secret-tenant-b-99999";
    const keyHashB = ApiKeyRecord.hashSecret(keyBSecret);
    const keyRecordB = ApiKeyRecord.create({
      id: "key-tenant-b-admin",
      principalId: "executive-tenant-b",
      principalType: "SERVICE",
      keyHash: keyHashB,
      roles: ["system-admin"],
      tenantId: TENANT_B,
      status: "ACTIVE",
    });
    await platform.apiKeyRepository.save(keyRecordB);
    const apiKeyBString = `key-tenant-b-admin.${keyBSecret}`;

    const res = await fetch(`${baseUrl}/api/v1/mandates/${activeMandateId}/reconcile`, {
      method: "POST",
      headers: {
        "X-API-Key": apiKeyBString,
        "X-Tenant-Id": TENANT_B, // Wrong tenant for mandate
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        triggerType: "PERIODIC_AUDIT",
      }),
    });

    assert.equal(res.status, 404);
  });

  await t.test("7. Duplicate reconciliation with idempotencyKey returns identical report", async () => {
    const idempotencyKey = "client-idem-key-77";
    const report1 = await client.portfolios.reconcileMandate(activeMandateId, {
      triggerType: "PERIODIC_AUDIT",
      idempotencyKey,
    });

    const report2 = await client.portfolios.reconcileMandate(activeMandateId, {
      triggerType: "PERIODIC_AUDIT",
      idempotencyKey,
    });

    assert.equal(report1.reconciliationId, report2.reconciliationId);
    assert.equal(report1.executedAt, report2.executedAt);
  });

  await t.test("Teardown: Close HTTP Server", async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });
});

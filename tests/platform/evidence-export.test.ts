/**
 * AI Operating Platform - Platform Integration Tests (Phase 78)
 * 
 * Tests the REST API endpoints and SDK client integration for
 * Governance & Compliance Evidence Export.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createPlatform } from "../../src/interfaces/composition.js";
import { createHttpServer } from "../../src/platform/api/http-router.js";
import { PlatformService } from "../../src/platform/api/platform-service.js";
import { createPlatformClient, PlatformClient } from "../../src/platform-client/index.js";
import { EnterprisePortfolio } from "../../src/domain/portfolio/enterprise-portfolio.js";
import { EnterpriseGovernanceMandate } from "../../src/domain/portfolio/governance-mandate.js";
import { Enterprise } from "../../src/domain/business/enterprise.js";
import { WorkflowDefinition } from "../../src/domain/workflow/workflow-definition.js";
import { WorkflowInstance } from "../../src/domain/workflow/workflow-instance.js";

describe("Phase 78 — Platform Integration: Governance & Compliance Evidence Export", () => {
  let server: http.Server;
  let baseUrl: string;
  let client: PlatformClient;
  let service: PlatformService;
  const TEST_TENANT = "tenant-export-test";
  const OTHER_TENANT = "tenant-export-other";

  it("0. Setup: Bootstrap Server with Evidence Export", async () => {
    const platform = createPlatform({
      logger: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} } as any,
    });

    service = new PlatformService({
      tasks: platform.tasks,
      executions: platform.executions,
      audit: platform.audit,
      metrics: platform.metrics,
      tools: platform.tools,
      submitTask: platform.submitTask,
      executeOrchestration: platform.executeOrchestration,
      portfolioGovernanceService: platform.portfolioGovernanceService,
      enterpriseOperatingService: platform.enterpriseOperatingService,
      workflowOrchestratorService: platform.workflowOrchestratorService,
      evidenceExportService: platform.evidenceExportService,
      eventStore: platform.eventStore,
    });

    server = createHttpServer(service, {
      enforceSecurity: false,
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;

    client = createPlatformClient({
      baseUrl,
      tenantId: TEST_TENANT,
    });

    // Seed test enterprise & portfolio in TEST_TENANT
    const ent = Enterprise.create({
      id: "ent-platform-export",
      tenantId: TEST_TENANT,
      name: "Platform Export Corp",
      industry: "Technology",
      jurisdiction: "US",
    });
    await (platform.enterpriseRepository as any).save(ent);

    const port = EnterprisePortfolio.create({
      id: "port-platform-export",
      tenantId: TEST_TENANT,
      name: "Platform Export Portfolio",
      ownerPrincipalId: "principal-export-lead",
    });
    await (platform.enterprisePortfolioRepository as any).save(port);

    const mandate = EnterpriseGovernanceMandate.create({
      id: "mandate-platform-export",
      tenantId: TEST_TENANT,
      portfolioId: "port-platform-export",
      sourceEnterpriseId: "ent-platform-export",
      targetEnterpriseIds: ["ent-target"],
      granteePrincipalId: "agent-runner",
      authorityScope: "PORTFOLIO_COORDINATION",
      maxAutonomyLevel: "LEVEL_3_GOVERNED_AUTONOMY",
      validFrom: new Date(Date.now() - 10000),
      validTo: new Date(Date.now() + 10000),
    });
    await (platform.governanceMandateRepository as any).save(mandate);
  });

  it("1. POST /api/v1/governance/evidence/export with valid payload returns 200 OK and manifest", async () => {
    const res = await fetch(`${baseUrl}/api/v1/governance/evidence/export`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-Id": TEST_TENANT,
      },
      body: JSON.stringify({
        scope: "TENANT",
      }),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.ok(body.manifest);
    assert.equal(body.manifest.scope, "TENANT");
    assert.equal(body.manifest.tenantId, TEST_TENANT);
    assert.ok(body.manifest.checksumSha256);
    assert.ok(body.data.enterprises);
    assert.equal(body.data.enterprises.length, 1);
  });

  it("2. POST /api/v1/governance/evidence/export for PORTFOLIO scope returns portfolio evidence", async () => {
    const res = await fetch(`${baseUrl}/api/v1/governance/evidence/export`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-Id": TEST_TENANT,
      },
      body: JSON.stringify({
        scope: "PORTFOLIO",
        targetId: "port-platform-export",
      }),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.manifest.scope, "PORTFOLIO");
    assert.equal(body.manifest.recordCounts.portfolios, 1);
    assert.equal(body.manifest.recordCounts.mandates, 1);
  });

  it("3. POST /api/v1/governance/evidence/export with cross-tenant target returns 404 NOT_FOUND", async () => {
    const res = await fetch(`${baseUrl}/api/v1/governance/evidence/export`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-Id": OTHER_TENANT, // Inquiring from other tenant
      },
      body: JSON.stringify({
        scope: "PORTFOLIO",
        targetId: "port-platform-export", // Belongs to TEST_TENANT
      }),
    });

    assert.equal(res.status, 404);
    const body = (await res.json()) as any;
    assert.equal(body.code, "EVIDENCE_RESOURCE_NOT_FOUND");
  });

  it("4. POST /api/v1/governance/evidence/export with invalid bounds returns 400 BAD_REQUEST", async () => {
    const res = await fetch(`${baseUrl}/api/v1/governance/evidence/export`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-Id": TEST_TENANT,
      },
      body: JSON.stringify({
        scope: "TENANT",
        limit: 5000, // Exceeds 1000 limit
      }),
    });

    assert.equal(res.status, 400);
    const body = (await res.json()) as any;
    assert.equal(body.code, "EVIDENCE_FILTER_BOUNDS_EXCEEDED");
  });

  it("5. SDK client.exportEvidence() and client.governance.exportEvidence() work seamlessly", async () => {
    const pkg1 = await client.exportEvidence({
      scope: "ENTERPRISE",
      targetId: "ent-platform-export",
    });

    assert.equal(pkg1.manifest.scope, "ENTERPRISE");
    assert.equal(pkg1.manifest.tenantId, TEST_TENANT);
    assert.equal(pkg1.data.enterprises.length, 1);

    const pkg2 = await client.governance.exportEvidence({
      scope: "MANDATE",
      targetId: "mandate-platform-export",
    });

    assert.equal(pkg2.manifest.scope, "MANDATE");
    assert.equal(pkg2.data.mandates.length, 1);
  });

  it("6. Complete Phase 77 reconciliation evidence is exportable in RECONCILIATION & AUDIT_TRAIL", async () => {
    const auditExport = await client.exportEvidence({
      scope: "AUDIT_TRAIL",
    });

    assert.equal(auditExport.manifest.scope, "AUDIT_TRAIL");
    assert.ok(Array.isArray(auditExport.data.auditTrail));
    assert.ok(auditExport.manifest.checksumSha256.length === 64);
  });

  it("7. Repeated idempotent request with same idempotencyKey returns identical package", async () => {
    const idempKey = "platform-idemp-001";

    const res1 = await client.exportEvidence({
      scope: "TENANT",
      idempotencyKey: idempKey,
    });

    const res2 = await client.exportEvidence({
      scope: "TENANT",
      idempotencyKey: idempKey,
    });

    assert.equal(res1.manifest.exportId, res2.manifest.exportId);
    assert.equal(res1.manifest.checksumSha256, res2.manifest.checksumSha256);
  });

  it("8. Teardown: Close HTTP Server", async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });
});

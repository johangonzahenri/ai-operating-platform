/**
 * AI Operating Platform - End-to-End Integration Scenario (Phase 79)
 * 
 * Demonstrates the canonical pipeline consumed by the Enterprise Control Plane:
 * Portfolio -> Mandate -> Reconciliation -> Compliance Evidence Export (SHA-256)
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

describe("Phase 79 — E2E Governance & Control Plane Integration Scenario", () => {
  let server: http.Server;
  let baseUrl: string;
  let client: PlatformClient;
  let service: PlatformService;
  const TEST_TENANT = "tenant-e2e-control-plane";

  it("0. Setup: Bootstrap Platform Server and Client", async () => {
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
  });

  it("1. Scenario: Full Lifecycle — Create Portfolio -> Grant Mandate -> Reconcile -> Export Evidence", async () => {
    // 1. Create Portfolio
    const portfolio = await client.portfolios.create({
      id: "port-holding-global",
      name: "Global Holding Portfolio",
      description: "E2E Holding Governance Portfolio",
    });
    assert.ok(portfolio.id);
    assert.equal(portfolio.status, "ACTIVE");

    // 1.1 Add participating enterprises to portfolio
    await client.portfolios.addEnterprise(portfolio.id, {
      enterpriseId: "ent-holding-alpha",
      relationshipType: "PARENT",
    });
    await client.portfolios.addEnterprise(portfolio.id, {
      enterpriseId: "ent-subsidiary-beta",
      relationshipType: "SUBSIDIARY",
    });

    // 2. Grant Governance Mandate
    const mandate = await client.portfolios.grantMandate({
      id: "mandate-global-01",
      portfolioId: portfolio.id,
      sourceEnterpriseId: "ent-holding-alpha",
      targetEnterpriseIds: ["ent-subsidiary-beta"],
      granteePrincipalId: "agent-coordinator-01",
      authorityScope: "PORTFOLIO_COORDINATION",
      allowedOperations: ["workflow.execute", "budget.allocate"],
      autonomyLimit: "LEVEL_3_GOVERNED_AUTONOMY",
    });
    assert.ok(mandate.id);
    assert.equal(mandate.status, "ACTIVE");

    // 3. Inspect Portfolio Operating Context (Read-Only)
    const context = await client.portfolios.getContext(portfolio.id);
    assert.ok(context.portfolio);
    assert.equal(context.portfolio.id, portfolio.id);

    // 4. Trigger Mandate Reconciliation on Scope Modification (Fase 77)
    const reconciliationReport = await client.portfolios.reconcileMandate(mandate.id, {
      triggerType: "MANDATE_SCOPE_REDUCED",
      reason: "E2E Control Plane Compliance Audit",
    });
    assert.ok(reconciliationReport);
    assert.equal(reconciliationReport.mandateId, mandate.id);
    assert.equal(reconciliationReport.triggerType, "MANDATE_SCOPE_REDUCED");

    // 5. Generate Cryptographically Sealed Evidence Package (Fase 78)
    const evidencePkg = await client.governance.exportEvidence({
      scope: "PORTFOLIO",
      targetId: portfolio.id,
      limit: 50,
    });

    assert.ok(evidencePkg.manifest);
    assert.equal(evidencePkg.manifest.scope, "PORTFOLIO");
    assert.equal(typeof evidencePkg.manifest.checksumSha256, "string");
    assert.equal(evidencePkg.manifest.checksumSha256.length, 64, "Seal must be valid 64-char SHA-256 hex");
    assert.ok(evidencePkg.data);
  });

  it("99. Teardown: Stop Server", async () => {
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });
});

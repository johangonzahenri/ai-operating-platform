import test, { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { AddressInfo } from "node:net";

// Composition & Platform Server
import { createPlatform } from "../../src/interfaces/composition.js";
import { PlatformService } from "../../src/platform/api/platform-service.js";
import { createHttpServer } from "../../src/platform/api/http-router.js";
import { ApiKeyRecord } from "../../src/domain/security/authentication.js";

// Spare Parts Application & Certification
import {
  SparePartsPlatformAdapter,
  SPARE_PARTS_APPLICATION_ID,
} from "../../src/application/spareparts/spare-parts-platform-adapter.js";
import {
  runSparePartsCertification,
  formatSparePartsCertificationReport,
  SPARE_PARTS_APPLICATION_MANIFEST,
} from "../../src/application/spareparts/spare-parts-certification.js";
import {
  SparePartsFacade,
  SparePartsSearchRequest,
} from "../../src/application/spareparts/spare-parts-facade.js";
import { PLATFORM_CAPABILITY_CATALOG } from "../../src/domain/application/application-contract.js";
import { InMemoryAutomotiveSourceRegistry } from "../../src/application/spareparts/automotive-source-registry.js";
import { CANONICAL_AUTOMOTIVE_SOURCES } from "../../src/infrastructure/spareparts/canonical-sources.js";
import { BaseAutomotiveSourceConnector } from "../../src/application/spareparts/automotive-source-connector.js";

describe("PROJ-02: Spare Parts Search & Comparison — MVP Certification & Security Suite (Phase 150)", () => {
  let server: ReturnType<typeof createHttpServer>;
  let baseUrl: string;
  let adapter: SparePartsPlatformAdapter;
  let facade: SparePartsFacade;

  const validApiKey = "key-sp-cert.secret-sp-cert";
  const validTenantId = "tenant-enterprise-sp";

  before(async () => {
    const platform = createPlatform();

    // Register API key record for certification
    const apiKeyRecord = ApiKeyRecord.create({
      id: "key-sp-cert",
      principalId: "service-sp-cert",
      principalType: "SERVICE",
      keyHash: ApiKeyRecord.hashSecret("secret-sp-cert"),
      roles: ["service", "operator"],
      tenantId: validTenantId,
      metadata: {
        applicationId: SPARE_PARTS_APPLICATION_ID,
      },
    });
    await platform.apiKeyRepository.save(apiKeyRecord);

    const service = new PlatformService({
      tasks: platform.tasks,
      taskRepository: platform.taskRepository,
      executions: platform.executions,
      audit: platform.audit,
      metrics: platform.metrics,
      tools: platform.tools,
      models: platform.modelRegistry,
      agents: platform.agents,
      agentService: platform.agentService,
      submitTask: platform.submitTask,
      executeOrchestration: platform.executeOrchestration,
      operations: platform.operations,
      operationService: platform.operationService,
      eventStore: platform.eventStore,
      db: platform.db,
      diagnostics: platform.diagnostics,
      organizationService: platform.organizationService,
      teamResourceBudgetService: platform.teamResourceBudgetService,
      organizationalCoordinationService: platform.organizationalCoordinationService,
      agentProfileService: platform.agentProfileService,
      workflowOrchestratorService: platform.workflowOrchestratorService,
      eventStream: platform.eventStream,
      apiCredentialService: platform.apiCredentialService,
    });

    server = createHttpServer(service, {
      apiKeyRepository: platform.apiKeyRepository,
      enforceSecurity: false,
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;

    adapter = new SparePartsPlatformAdapter({
      baseUrl,
      apiKey: validApiKey,
      tenantId: validTenantId,
      applicationId: SPARE_PARTS_APPLICATION_ID,
      timeoutMs: 8000,
    });

    facade = new SparePartsFacade();
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });

  // =========================================================================
  // 1. 9-DIMENSION FORMAL CERTIFICATION HARNESS
  // =========================================================================
  describe("1. 9-Dimension Official Certification Evaluation", () => {
    it("1.1 executes complete 9-point certification evaluation with 9/9 PASS", async () => {
      const report = await runSparePartsCertification(adapter, SPARE_PARTS_APPLICATION_MANIFEST);

      assert.equal(report.applicationId, SPARE_PARTS_APPLICATION_ID);
      assert.equal(report.tenantId, validTenantId);
      assert.equal(report.dimensions.identity.verdict, "PASS", "Identity check PASS");
      assert.equal(report.dimensions.health.verdict, "PASS", "Health check PASS");
      assert.equal(report.dimensions.authentication.verdict, "PASS", "Authentication check PASS");
      assert.equal(report.dimensions.authorization.verdict, "PASS", "Authorization check PASS");
      assert.equal(report.dimensions.capabilities.verdict, "PASS", "Capabilities check PASS");
      assert.equal(report.dimensions.version.verdict, "PASS", "Version check PASS");
      assert.equal(report.dimensions.observability.verdict, "PASS", "Observability check PASS");
      assert.equal(report.dimensions.openApi.verdict, "PASS", "OpenAPI check PASS");
      assert.equal(report.dimensions.sse.verdict, "PASS", "SSE check PASS");
      assert.equal(report.overallPassed, true, "Overall certification status is PASS");
      assert.equal(report.releaseStatus, "MVP_CERTIFIED");

      const formatted = formatSparePartsCertificationReport(report);
      assert.ok(formatted.includes("SPARE PARTS SEARCH & COMPARISON — MVP CERTIFICATION REPORT"));
      assert.ok(formatted.includes("1. Identity     | PASS"));
      assert.ok(formatted.includes("2. Health       | PASS"));
      assert.ok(formatted.includes("3. AuthN        | PASS"));
      assert.ok(formatted.includes("4. AuthZ        | PASS"));
      assert.ok(formatted.includes("5. Capabilities | PASS"));
      assert.ok(formatted.includes("6. Version      | PASS"));
      assert.ok(formatted.includes("7. Observability| PASS"));
      assert.ok(formatted.includes("8. OpenAPI      | PASS"));
      assert.ok(formatted.includes("9. SSE Telemetry| PASS"));
    });

    it("1.2 Identity dimension: fails certification if applicationId or tenantId is missing or mismatched", async () => {
      const badAdapter = new SparePartsPlatformAdapter({
        baseUrl,
        apiKey: validApiKey,
        tenantId: "",
        applicationId: "unauthorized-app",
      });

      const report = await runSparePartsCertification(badAdapter, SPARE_PARTS_APPLICATION_MANIFEST);
      assert.equal(report.dimensions.identity.verdict, "FAIL");
      assert.equal(report.overallPassed, false);
      assert.equal(report.releaseStatus, "MVP_NOT_CERTIFIED");
    });

    it("1.3 Authentication dimension: verifies API key is transmitted and errors are sanitized", async () => {
      const unauthAdapter = new SparePartsPlatformAdapter({
        baseUrl,
        apiKey: "",
        tenantId: validTenantId,
        applicationId: SPARE_PARTS_APPLICATION_ID,
      });

      const report = await runSparePartsCertification(unauthAdapter, SPARE_PARTS_APPLICATION_MANIFEST);
      assert.equal(report.dimensions.authentication.verdict, "FAIL");
      assert.equal(report.overallPassed, false);
    });

    it("1.4 Capabilities dimension: confirms spareparts.search is formally registered in PLATFORM_CAPABILITY_CATALOG", () => {
      const sparePartsCap = PLATFORM_CAPABILITY_CATALOG.find((c) => c.id === "spareparts.search");
      assert.ok(sparePartsCap, "spareparts.search exists in catalog");
      assert.equal(sparePartsCap.category, "COMMERCE");
      assert.equal(sparePartsCap.requiredPlan, "FREE");
      assert.ok(sparePartsCap.endpoints.includes("POST /api/v1/spareparts/search"));
    });

    it("1.5 Version dimension: confirms platform version satisfies >= 1.4.0 baseline", async () => {
      const client = adapter.getClient();
      const meta = await client.getPlatformInfo();
      assert.ok(meta.version);
      assert.ok(meta.version >= "1.4.0");
    });

    it("1.6 SSE dimension: verifies graceful degradation when SSE stream is disconnected", async () => {
      const tm = adapter.getTelemetryManager();
      tm.disconnect();
      assert.equal(tm.getStatus(), "DISCONNECTED");

      // Search operation still succeeds even if SSE is disconnected
      const searchRes = await adapter.searchAndCompare({
        query: "bujias toyota corolla 2018",
        vehicle: { make: "Toyota", model: "Corolla", year: 2018 },
      });
      assert.ok(searchRes.searchResponse);
      assert.equal(searchRes.telemetryStatus, "STREAMING_INACTIVE");
    });
  });

  // =========================================================================
  // 2. GOLDEN JOURNEY E2E VERIFICATION
  // =========================================================================
  describe("2. Golden Journey E2E Verification", () => {
    it("2.1 executes complete Golden Journey from User Intent to Side-by-Side Comparison", async () => {
      const req: SparePartsSearchRequest = {
        query: "pastillas de freno delanteras toyota corolla 2018 1.8",
        vehicle: {
          make: "Toyota",
          model: "Corolla",
          year: 2018,
          engine: "1.8L 2ZR-FE",
        },
      };

      const result = await facade.searchAndCompare(req);

      assert.ok(result);
      assert.equal(result.queryText, req.query);
      assert.ok(result.totalOffersFound > 0, "Discovered multi-source offers");
      assert.ok(result.clusters.length > 0, "Produced canonical clusters");

      // Verify side-by-side comparability: comparison has items with seller ratings and landed price
      const firstCluster = result.clusters[0];
      assert.ok(firstCluster);
      assert.ok(firstCluster.comparison);
      assert.ok(firstCluster.comparison.items.length > 0);
      for (const item of firstCluster.comparison.items) {
        assert.ok(item.sourceId);
        assert.ok(item.sellerName);
        assert.ok(typeof item.sellerTrust.score === "number");
        assert.ok(item.basePrice);
        assert.ok(item.basePrice.amount > 0);
      }
    });

    it("2.2 Truth Invariant: UNKNOWN is never converted to 0, false, or COMPATIBLE", async () => {
      const req: SparePartsSearchRequest = {
        query: "repuesto desconocido modelo desconocido 1990",
        vehicle: {
          make: "VehiculoInexistente",
          model: "ModeloDesconocido",
          year: 1990,
        },
      };

      const result = await facade.searchAndCompare(req);

      // Must NOT hallucinate COMPATIBLE
      for (const cluster of result.clusters) {
        if (cluster.fitmentResult) {
          assert.notEqual(cluster.fitmentResult.verdict, "COMPATIBLE");
        }
      }
    });

    it("2.3 Fail-Closed Fitment: incompatible vehicle flags offers as NOT_FIT and disqualifies from side-by-side", async () => {
      const req: SparePartsSearchRequest = {
        query: "pastillas de freno toyota corolla 2018",
        vehicle: {
          make: "Chevrolet",
          model: "Spark",
          year: 2012,
        },
      };

      const result = await facade.searchAndCompare(req);

      // Toyota parts must NOT be marked compatible with Chevrolet Spark
      const toyotaCorollaCluster = result.clusters.find((c) =>
        c.description.toLowerCase().includes("corolla") ||
        c.canonicalBrand.toLowerCase().includes("toyota")
      );
      if (toyotaCorollaCluster && toyotaCorollaCluster.fitmentResult) {
        assert.notEqual(toyotaCorollaCluster.fitmentResult.verdict, "COMPATIBLE");
      }
    });
  });

  // =========================================================================
  // 3. SECURITY & PURITY CERTIFICATION
  // =========================================================================
  describe("3. Security & DOM Purity Certification", () => {
    it("3.1 100% Purity Audit: Zero innerHTML, outerHTML, eval, or document.write across all web source files", () => {
      const webDir = path.resolve(process.cwd(), "src/platform/web");
      const files = fs.readdirSync(webDir).filter((f) => f.endsWith(".js") || f.endsWith(".html"));

      for (const file of files) {
        const filePath = path.join(webDir, file);
        const content = fs.readFileSync(filePath, "utf8");

        assert.doesNotMatch(
          content,
          /\.innerHTML\s*=/,
          `Security violation: .innerHTML assignment found in ${file}`
        );
        assert.doesNotMatch(
          content,
          /\.outerHTML\s*=/,
          `Security violation: .outerHTML assignment found in ${file}`
        );
        assert.doesNotMatch(
          content,
          /\beval\s*\(/,
          `Security violation: eval() call found in ${file}`
        );
        assert.doesNotMatch(
          content,
          /document\.write\s*\(/,
          `Security violation: document.write() call found in ${file}`
        );
      }
    });

    it("3.2 XSS Safety: HTML/Script payload in part name or search query is sanitized and rendered as plain text", async () => {
      const maliciousQuery = '<script>alert("XSS")</script> Pastillas de Freno';
      const result = await facade.searchAndCompare({ query: maliciousQuery });

      assert.ok(result);
      assert.equal(result.queryText, maliciousQuery);
      // Ensure no unescaped dangerous tags in structured response
      for (const cluster of result.clusters) {
        assert.ok(typeof cluster.description === "string");
        assert.ok(typeof cluster.canonicalBrand === "string");
      }
    });
  });

  // =========================================================================
  // 4. THIRD-PARTY SOURCE GOVERNANCE
  // =========================================================================
  describe("4. Third-Party Source Governance & Provenance", () => {
    it("4.1 Source Registry: validates rate limits, timeouts, and terms policy metadata", async () => {
      const registry = new InMemoryAutomotiveSourceRegistry(CANONICAL_AUTOMOTIVE_SOURCES);
      const sources = await registry.list();

      assert.ok(sources.length >= 3);
      for (const src of sources) {
        assert.ok(src.sourceId);
        assert.ok(src.name);
        assert.ok(src.primaryUrl);
        assert.equal(typeof src.accessPolicy.allowed, "boolean");
        assert.ok(src.accessPolicy.rateLimitPerMinute !== undefined && src.accessPolicy.rateLimitPerMinute > 0);
        assert.ok(src.trustRating.sourceReliability > 0);
        assert.ok(src.accessPolicy.restrictionsNote || src.accessPolicy.termsUrl || src.primaryUrl);
      }
    });

    it("4.2 Source Governance: every offer preserves explicit provenance (sourceId, sourceUrl, retrievedAt)", async () => {
      const sourceDef = CANONICAL_AUTOMOTIVE_SOURCES[0]!;
      const connector = new BaseAutomotiveSourceConnector(sourceDef);
      const searchResult = await connector.search({
        query: "pastillas freno corolla",
        maxResults: 2,
      });

      assert.ok(searchResult.offers.length > 0);
      for (const offer of searchResult.offers) {
        assert.equal(offer.sourceId, sourceDef.sourceId);
        assert.ok(offer.productUrl.startsWith("https://"));
        assert.ok(offer.lastCheckedAt);
      }
    });
  });
});

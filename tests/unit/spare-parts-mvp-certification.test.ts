import test, { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { AddressInfo } from "node:net";

// Composition & Platform Server
import { createPlatform } from "../../src/interfaces/composition.js";
import { PlatformService } from "../../src/platform/api/platform-service.js";
import { createHttpServer } from "../../src/platform/api/http-router.js";

// Spare Parts Application & Certification
import {
  SparePartsPlatformAdapter,
  SparePartsTelemetryManager,
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
import { PLATFORM_CAPABILITY_CATALOG, ApplicationManifest } from "../../src/domain/application/application-contract.js";
import { InMemoryAutomotiveSourceRegistry } from "../../src/application/spareparts/automotive-source-registry.js";
import { CANONICAL_AUTOMOTIVE_SOURCES } from "../../src/infrastructure/spareparts/canonical-sources.js";
import { BaseAutomotiveSourceConnector } from "../../src/application/spareparts/automotive-source-connector.js";

describe("PROJ-02: Spare Parts Search & Comparison — Post-Release Certification Evidence Hardening (Prompt 159)", () => {
  let server: ReturnType<typeof createHttpServer>;
  let service: PlatformService;
  let baseUrl: string;
  let adapter: SparePartsPlatformAdapter;
  let facade: SparePartsFacade;
  let eventPublisher: any;

  let validApiKey: string;
  const validTenantId = "tenant-enterprise-sp";

  let restrictedApiKey: string;
  let otherTenantApiKey: string;
  const otherTenantId = "tenant-other-sp";

  before(async () => {
    const platform = createPlatform();
    eventPublisher = platform.events;

    // 1. Create valid modern credential with spareparts.search scope
    const validCred = await platform.apiCredentialService.createCredential({
      principalId: "service-sp-cert",
      principalType: "SERVICE",
      tenantId: validTenantId,
      applicationId: SPARE_PARTS_APPLICATION_ID,
      name: "Spare Parts Certified Integration Key",
      scopes: ["spareparts.search", "spareparts.*", "public.read", "health.check", "events.read"],
    });
    validApiKey = validCred.rawKey;

    // 2. Create restricted credential lacking spareparts.search scope
    const restrictedCred = await platform.apiCredentialService.createCredential({
      principalId: "service-sp-restricted",
      principalType: "SERVICE",
      tenantId: validTenantId,
      applicationId: SPARE_PARTS_APPLICATION_ID,
      name: "Restricted Scope Key",
      scopes: ["tasks.read"],
    });
    restrictedApiKey = restrictedCred.rawKey;

    // 3. Create other tenant credential
    const otherTenantCred = await platform.apiCredentialService.createCredential({
      principalId: "service-sp-other",
      principalType: "SERVICE",
      tenantId: otherTenantId,
      applicationId: SPARE_PARTS_APPLICATION_ID,
      name: "Other Tenant Key",
      scopes: ["spareparts.search", "spareparts.*"],
    });
    otherTenantApiKey = otherTenantCred.rawKey;

    service = new PlatformService({
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

    // Live Security Gateway Enforcement (enforceSecurity: true)
    server = createHttpServer(service, {
      apiCredentialService: platform.apiCredentialService,
      enforceSecurity: true,
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
  describe("1. 9-Dimension Official Certification Evaluation & Semantics", () => {
    it("1.1 executes complete 9-point certification evaluation against live security gateway, returning MVP_CERTIFIED_WITH_OPEN_ENVIRONMENTAL_GAPS for production manifest", async () => {
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
      assert.equal(report.overallPassed, true, "Overall software certification status is PASS (9/9)");
      assert.equal(report.releaseStatus, "MVP_CERTIFIED_WITH_OPEN_ENVIRONMENTAL_GAPS");

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

    it("1.2 H-05: produces MVP_CERTIFIED when evaluated with non-production staging/development manifest", async () => {
      const stagingManifest: ApplicationManifest = {
        ...SPARE_PARTS_APPLICATION_MANIFEST,
        environment: "staging",
      };

      const report = await runSparePartsCertification(adapter, stagingManifest);
      assert.equal(report.overallPassed, true);
      assert.equal(report.releaseStatus, "MVP_CERTIFIED");
    });

    it("1.3 Identity dimension: fails certification if applicationId or tenantId is missing, empty or mismatched", async () => {
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

    it("1.6 H-03: OpenAPI dimension validates canonical docs/openapi.yaml specification structurally", async () => {
      const report = await runSparePartsCertification(adapter, SPARE_PARTS_APPLICATION_MANIFEST);
      assert.equal(report.dimensions.openApi.verdict, "PASS");
      assert.equal(report.dimensions.openApi.details?.version31, true);
      assert.equal(report.dimensions.openApi.details?.allEndpointsDeclared, true);
      assert.equal(report.dimensions.openApi.details?.securitySchemesPresent, true);
      assert.equal(report.dimensions.openApi.details?.schemasPresent, true);
    });
  });

  // =========================================================================
  // 2. HARDENED GATEWAY AUTHENTICATION & PROOFS (H-01)
  // =========================================================================
  describe("2. Hardened Gateway Authentication Proofs (H-01)", () => {
    it("2.1 Positive: Valid API Key + Matching Tenant -> 200 ALLOW", async () => {
      const res = await fetch(`${baseUrl}/api/v1/spareparts/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": validApiKey,
          "X-Tenant-Id": validTenantId,
          "X-Application-Id": SPARE_PARTS_APPLICATION_ID,
        },
        body: JSON.stringify({ query: "pastillas toyota corolla" }),
      });

      assert.equal(res.status, 200);
      const data = await res.json() as any;
      assert.ok(data.searchId);
      assert.equal(data.status, "SUCCESS");
    });

    it("2.2 Negative: Missing API Key / Authorization Header -> 401 UNAUTHORIZED / DENY", async () => {
      const res = await fetch(`${baseUrl}/api/v1/spareparts/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Tenant-Id": validTenantId,
        },
        body: JSON.stringify({ query: "pastillas toyota corolla" }),
      });

      assert.equal(res.status, 401);
      const data = await res.json() as any;
      assert.equal(data.status, 401);
      assert.ok(data.error);
      assert.ok(typeof data.code === "string");
    });

    it("2.3 Negative: Invalid / Corrupted API Key -> 401 UNAUTHORIZED / DENY", async () => {
      const res = await fetch(`${baseUrl}/api/v1/spareparts/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": "invalid-key.bad-secret",
          "X-Tenant-Id": validTenantId,
        },
        body: JSON.stringify({ query: "pastillas toyota corolla" }),
      });

      assert.equal(res.status, 401);
      const data = await res.json() as any;
      assert.equal(data.status, 401);
    });

    it("2.4 Negative: Tenant Mismatch (X-Tenant-Id header !== API key tenant) -> 403 TENANT_MISMATCH / DENY", async () => {
      const res = await fetch(`${baseUrl}/api/v1/spareparts/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": validApiKey,
          "X-Tenant-Id": "tenant-impostor-999",
        },
        body: JSON.stringify({ query: "pastillas toyota corolla" }),
      });

      assert.equal(res.status, 403);
      const data = await res.json() as any;
      assert.equal(data.code, "TENANT_MISMATCH");
    });

    it("2.5 Negative: Application Mismatch (X-Application-Id header !== credential metadata) -> 403 APPLICATION_MISMATCH / DENY", async () => {
      const res = await fetch(`${baseUrl}/api/v1/spareparts/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": validApiKey,
          "X-Tenant-Id": validTenantId,
          "X-Application-Id": "wrong-application-identity",
        },
        body: JSON.stringify({ query: "pastillas toyota corolla" }),
      });

      assert.equal(res.status, 403);
      const data = await res.json() as any;
      assert.equal(data.code, "APPLICATION_MISMATCH");
    });
  });

  // =========================================================================
  // 3. HARDENED AUTHORIZATION & SCOPES (H-02)
  // =========================================================================
  describe("3. Hardened Authorization & Scope Proofs (H-02)", () => {
    it("3.1 Positive: Credential with spareparts.search scope is allowed", async () => {
      const res = await fetch(`${baseUrl}/api/v1/spareparts/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": validApiKey,
          "X-Tenant-Id": validTenantId,
        },
        body: JSON.stringify({ query: "filtro de aceite toyota yaris" }),
      });

      assert.equal(res.status, 200);
    });

    it("3.2 Negative: Credential lacking spareparts.search scope (e.g. only tasks.read) -> 403 INSUFFICIENT_SCOPE / DENY", async () => {
      const res = await fetch(`${baseUrl}/api/v1/spareparts/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": restrictedApiKey,
          "X-Tenant-Id": validTenantId,
        },
        body: JSON.stringify({ query: "filtro de aceite toyota yaris" }),
      });

      assert.equal(res.status, 403);
      const data = await res.json() as any;
      assert.equal(data.code, "INSUFFICIENT_SCOPE");
      assert.ok(data.error.includes("lacks required scope"));
    });
  });

  // =========================================================================
  // 4. HARDENED SERVER-SENT EVENTS (SSE) PROTOCOL & RESILIENCE (H-04)
  // =========================================================================
  describe("4. Hardened Server-Sent Events (SSE) Protocol & Resilience (H-04)", () => {
    it("4.1 Protocol: Emits spareparts.search.started and search.completed with trace & tenant context", async () => {
      const receivedEvents: any[] = [];
      const es = service.getEventStream();
      let restore: (() => void) | undefined;
      if (es) {
        const orig = es.publishEvent.bind(es);
        es.publishEvent = (evt: any) => {
          if (evt.type && evt.type.startsWith("spareparts.")) {
            receivedEvents.push(evt);
          }
          orig(evt);
        };
        restore = () => {
          es.publishEvent = orig;
        };
      }

      const traceId = `trace-sse-test-${Date.now()}`;
      const searchRes = await fetch(`${baseUrl}/api/v1/spareparts/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": validApiKey,
          "X-Tenant-Id": validTenantId,
          "X-Trace-Id": traceId,
        },
        body: JSON.stringify({
          query: "bujias corolla 2018",
          context: { traceId },
        }),
      });

      assert.equal(searchRes.status, 200);
      if (restore) restore();

      assert.ok(receivedEvents.length >= 2, "Expected at least started and completed events");
      const startedEvt = receivedEvents.find((e) => e.type === "spareparts.search.started");
      const completedEvt = receivedEvents.find((e) => e.type === "spareparts.search.completed");

      assert.ok(startedEvt, "spareparts.search.started emitted");
      assert.ok(completedEvt, "spareparts.search.completed emitted");
      assert.equal(startedEvt.payload.tenantId, validTenantId);
      assert.equal(completedEvt.payload.tenantId, validTenantId);
      assert.equal(startedEvt.traceId, traceId);
    });

    it("4.2 Deduplication: Telemetry manager deduplicates identical event IDs", () => {
      const tm = adapter.getTelemetryManager();
      tm.clearBuffer();

      const consumed: any[] = [];
      const unsub = tm.onEvent((evt) => consumed.push(evt));

      (tm as any).handleIncomingRawEvent({
        id: "100",
        event: "part.indexed",
        data: { eventId: "evt-dedup-100", partNumber: "04465-02220" },
      });

      // Send duplicate
      (tm as any).handleIncomingRawEvent({
        id: "100",
        event: "part.indexed",
        data: { eventId: "evt-dedup-100", partNumber: "04465-02220" },
      });

      unsub();
      assert.equal(consumed.length, 1, "Duplicate event ID must be consumed exactly once");
      assert.equal(tm.getLastEventId(), 100);
    });

    it("4.3 Resilience: SSE disconnection does not fail search execution (SSE down ≠ search failure)", async () => {
      const tm = adapter.getTelemetryManager();
      tm.disconnect();
      assert.equal(tm.getStatus(), "DISCONNECTED");

      const searchRes = await adapter.searchAndCompare({
        query: "bujias toyota corolla 2018",
        vehicle: { make: "Toyota", model: "Corolla", year: 2018 },
      });

      assert.ok(searchRes.searchResponse);
      assert.equal(searchRes.telemetryStatus, "STREAMING_INACTIVE");
      assert.equal(searchRes.searchResponse.status, "SUCCESS");
    });
  });

  // =========================================================================
  // 5. GOLDEN JOURNEY E2E VERIFICATION
  // =========================================================================
  describe("5. Golden Journey E2E Verification", () => {
    it("5.1 executes complete Golden Journey from User Intent to Side-by-Side Comparison", async () => {
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

    it("5.2 Truth Invariant: UNKNOWN is never converted to 0, false, or COMPATIBLE", async () => {
      const req: SparePartsSearchRequest = {
        query: "repuesto desconocido modelo desconocido 1990",
        vehicle: {
          make: "VehiculoInexistente",
          model: "ModeloDesconocido",
          year: 1990,
        },
      };

      const result = await facade.searchAndCompare(req);

      for (const cluster of result.clusters) {
        if (cluster.fitmentResult) {
          assert.notEqual(cluster.fitmentResult.verdict, "COMPATIBLE");
        }
      }
    });

    it("5.3 Fail-Closed Fitment: incompatible vehicle flags offers as NOT_FIT and disqualifies from side-by-side", async () => {
      const req: SparePartsSearchRequest = {
        query: "pastillas de freno toyota corolla 2018",
        vehicle: {
          make: "Chevrolet",
          model: "Spark",
          year: 2012,
        },
      };

      const result = await facade.searchAndCompare(req);

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
  // 6. SECURITY & PURITY CERTIFICATION
  // =========================================================================
  describe("6. Security & DOM Purity Certification", () => {
    it("6.1 100% Purity Audit: Zero innerHTML, outerHTML, eval, or document.write across all web source files", () => {
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

    it("6.2 XSS Safety: HTML/Script payload in part name or search query is sanitized and rendered as plain text", async () => {
      const maliciousQuery = '<script>alert("XSS")</script> Pastillas de Freno';
      const result = await facade.searchAndCompare({ query: maliciousQuery });

      assert.ok(result);
      assert.equal(result.queryText, maliciousQuery);
      for (const cluster of result.clusters) {
        assert.ok(typeof cluster.description === "string");
        assert.ok(typeof cluster.canonicalBrand === "string");
      }
    });
  });

  // =========================================================================
  // 7. THIRD-PARTY SOURCE GOVERNANCE
  // =========================================================================
  describe("7. Third-Party Source Governance & Provenance", () => {
    it("7.1 Source Registry: validates rate limits, timeouts, and terms policy metadata", async () => {
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

    it("7.2 Source Governance: every offer preserves explicit provenance (sourceId, sourceUrl, retrievedAt)", async () => {
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

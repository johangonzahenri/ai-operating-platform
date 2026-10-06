/**
 * AI Operating Platform — Transversal Quality Governance & Audit Suite
 * 
 * AUD-FASE-003: Stabilization Audit for Phases 163–165
 * 
 * Scope:
 * - Fase 163: PROJ-01 Tentaciones AI Commerce MVP Certification & Release Boundaries
 * - Fase 164: Platform Integration Gateway, Security Enforcement & SSE Telemetry
 * - Fase 165: PROJ-03 Fleet Management Product Charter, IoT Telemetry Spec & Core Engine Boundary Purity
 * 
 * Invariants Formally Verified:
 * 1. AUD-03.1: MVP Certification Invariant & Honest Environmental Boundaries (Fase 163)
 * 2. AUD-03.2: Platform Integration Gateway Fail-Closed Security Enforcement (Fase 164)
 * 3. AUD-03.3: Multi-Tenant & Application Isolation Gating (Fase 164)
 * 4. AUD-03.4: Scope and Capability Reconciliation & Privilege Containment
 * 5. AUD-03.5: Core Engine Purity & Zero Contamination from PROJ-03 Fleet Management (Fase 165)
 * 6. AUD-03.6: PROJ-03 Fleet Management Formalization Integrity & Scope Boundaries (Fase 165)
 * 7. AUD-03.7: OpenAPI 3.1 Specification Parity & Schema Integrity
 * 8. AUD-03.8: SSE Telemetry Event Publication, Trace Correlation & Privacy Isolation (Fase 164)
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { AddressInfo } from "node:net";

import { createPlatform } from "../../src/interfaces/composition.js";
import { PlatformService } from "../../src/platform/api/platform-service.js";
import { createHttpServer } from "../../src/platform/api/http-router.js";
import {
  TENTACIONES_APPLICATION_ID,
  CANONICAL_TEST_GARMENT,
  CANONICAL_TEST_BODY_PROFILE,
  VirtualTryOnService,
  runTentacionesVtoCertification,
} from "../../src/application/vto/index.js";
import { PLATFORM_CAPABILITY_CATALOG } from "../../src/domain/application/application-contract.js";

const rootDir = process.cwd();

describe("AUD-FASE-003 — Transversal Stabilization Audit (Phases 163–165)", () => {
  let server: ReturnType<typeof createHttpServer>;
  let service: PlatformService;
  let baseUrl: string;
  let platformInstance: ReturnType<typeof createPlatform>;

  const validTenantId = "tenant-tentaciones";
  const validAppId = TENTACIONES_APPLICATION_ID;

  let validApiKey: string;
  let restrictedApiKey: string;
  let mismatchedTenantApiKey: string;
  let mismatchedAppApiKey: string;
  let vtoOnlyApiKey: string;

  before(async () => {
    platformInstance = createPlatform();
    const vtoService = new VirtualTryOnService();

    // 1. Valid API key for Tentaciones VTO
    const validCred = await platformInstance.apiCredentialService.createCredential({
      principalId: "service-tentaciones-vto",
      principalType: "SERVICE",
      tenantId: validTenantId,
      applicationId: validAppId,
      name: "AUD-03 Certified VTO Key",
      scopes: ["vto.tryon", "vto.*", "ar.fitting_room", "events.read"],
    });
    validApiKey = validCred.rawKey;

    // 2. Restricted key without VTO scopes
    const restrictedCred = await platformInstance.apiCredentialService.createCredential({
      principalId: "service-restricted",
      principalType: "SERVICE",
      tenantId: validTenantId,
      applicationId: validAppId,
      name: "AUD-03 Restricted Key",
      scopes: ["tasks.read"],
    });
    restrictedApiKey = restrictedCred.rawKey;

    // 3. Key for other tenant
    const otherTenantCred = await platformInstance.apiCredentialService.createCredential({
      principalId: "service-other-tenant",
      principalType: "SERVICE",
      tenantId: "tenant-other-enterprise",
      applicationId: validAppId,
      name: "AUD-03 Other Tenant Key",
      scopes: ["vto.tryon"],
    });
    mismatchedTenantApiKey = otherTenantCred.rawKey;

    // 4. Key for other application
    const otherAppCred = await platformInstance.apiCredentialService.createCredential({
      principalId: "service-other-app",
      principalType: "SERVICE",
      tenantId: validTenantId,
      applicationId: "unauthorized-application",
      name: "AUD-03 Other App Key",
      scopes: ["vto.tryon"],
    });
    mismatchedAppApiKey = otherAppCred.rawKey;

    // 5. VTO-only key for privilege containment verification
    const vtoOnlyCred = await platformInstance.apiCredentialService.createCredential({
      principalId: "service-vto-only-containment",
      principalType: "SERVICE",
      tenantId: validTenantId,
      applicationId: validAppId,
      name: "AUD-03 VTO Only Containment Key",
      scopes: ["vto.tryon"],
    });
    vtoOnlyApiKey = vtoOnlyCred.rawKey;

    // In-process PlatformService and HTTP Server with strict security enabled
    service = new PlatformService(platformInstance);
    server = createHttpServer(service, {
      apiCredentialService: platformInstance.apiCredentialService,
      virtualTryOnService: vtoService,
      enforceSecurity: true,
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  /**
   * AUD-03.1: MVP Certification Invariant & Honest Environmental Boundaries (Fase 163)
   * Evidence Level: E4 (E2E Contract & Invariant Certification)
   */
  it("AUD-03.1: MVP Certification Invariant & Honest Environmental Boundaries (Fase 163)", async () => {
    const certReport = await runTentacionesVtoCertification();

    assert.equal(certReport.applicationId, "tentaciones-commerce");
    assert.equal(certReport.overallPassed, true);
    assert.equal(certReport.releaseStatus, "MVP_CERTIFIED_WITH_OPEN_ENVIRONMENTAL_GAPS");

    // All 9 dimensions pass
    const allPass = Object.values(certReport.dimensions).every((d) => d.verdict === "PASS");
    assert.equal(allPass, true);

    // Verify environmental gap is recorded without dishonest physical claims
    assert.ok(certReport.environmentalGaps.length >= 1, "Must contain at least 1 environmental gap");
    const gapEnv = certReport.environmentalGaps.find((g) => g.id === "GAP-ENV-01 / HAL-007");
    assert.ok(gapEnv, "Must track GAP-ENV-01 / HAL-007");
    assert.equal(gapEnv.status, "OPEN_ENVIRONMENTAL_GAP");
    assert.equal(gapEnv.blockerForCi, false, "Physical hardware is not a blocker in headless CI");
    assert.equal(gapEnv.blockerForPhysicalRelease, true, "Physical hardware remains required for production release");
  });

  /**
   * AUD-03.2: Platform Integration Gateway Fail-Closed Security Enforcement (Fase 164)
   * Evidence Level: E5 (LIVE HTTP IN-PROCESS)
   */
  it("AUD-03.2: Platform Integration Gateway Fail-Closed Security Enforcement (Fase 164)", async () => {
    // 1. Missing credentials -> 401
    const resNoAuth = await fetch(`${baseUrl}/api/v1/vto/tryon`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        garment: CANONICAL_TEST_GARMENT,
        bodyProfile: CANONICAL_TEST_BODY_PROFILE,
      }),
    });
    assert.equal(resNoAuth.status, 401, "Unauthenticated request must be rejected 401");

    // 2. Insufficient scope -> 403
    const resForbidden = await fetch(`${baseUrl}/api/v1/vto/tryon`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": restrictedApiKey,
        "X-Tenant-Id": validTenantId,
        "X-Application-Id": validAppId,
      },
      body: JSON.stringify({
        garment: CANONICAL_TEST_GARMENT,
        bodyProfile: CANONICAL_TEST_BODY_PROFILE,
      }),
    });
    assert.equal(resForbidden.status, 403, "Insufficient scope must be rejected 403");
    const forbiddenBody = await resForbidden.json() as any;
    assert.equal(forbiddenBody.code, "INSUFFICIENT_SCOPE");

    // 3. Authorized request -> 200
    const resAllowed = await fetch(`${baseUrl}/api/v1/vto/tryon`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": validApiKey,
        "X-Tenant-Id": validTenantId,
        "X-Application-Id": validAppId,
      },
      body: JSON.stringify({
        garment: CANONICAL_TEST_GARMENT,
        bodyProfile: CANONICAL_TEST_BODY_PROFILE,
      }),
    });
    assert.equal(resAllowed.status, 200, "Authorized request must succeed with 200");
    const allowedBody = await resAllowed.json() as any;
    assert.equal(allowedBody.status, "SUCCESS");
  });

  /**
   * AUD-03.3: Multi-Tenant & Application Isolation Gating (Fase 164)
   * Evidence Level: E5 (LIVE HTTP IN-PROCESS)
   */
  it("AUD-03.3: Multi-Tenant & Application Isolation Gating (Fase 164)", async () => {
    // 1. Cross-tenant payload mismatch -> 403 TENANT_MISMATCH
    const resTenantMismatch = await fetch(`${baseUrl}/api/v1/vto/tryon`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": validApiKey,
        "X-Tenant-Id": validTenantId,
      },
      body: JSON.stringify({
        tenantId: "tenant-injected-attacker",
        garment: CANONICAL_TEST_GARMENT,
        bodyProfile: CANONICAL_TEST_BODY_PROFILE,
      }),
    });
    assert.equal(resTenantMismatch.status, 403);
    const tenantErr = await resTenantMismatch.json() as any;
    assert.equal(tenantErr.code, "TENANT_MISMATCH");

    // 2. Cross-application payload mismatch -> 403 APPLICATION_MISMATCH
    const resAppMismatch = await fetch(`${baseUrl}/api/v1/vto/tryon`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": mismatchedAppApiKey,
        "X-Application-Id": validAppId,
        "X-Tenant-Id": validTenantId,
      },
      body: JSON.stringify({
        garment: CANONICAL_TEST_GARMENT,
        bodyProfile: CANONICAL_TEST_BODY_PROFILE,
      }),
    });
    assert.equal(resAppMismatch.status, 403);
    const appErr = await resAppMismatch.json() as any;
    assert.equal(appErr.code, "APPLICATION_MISMATCH");
  });

  /**
   * AUD-03.4: Scope and Capability Reconciliation & Privilege Containment
   * Evidence Level: E3 / E5
   */
  it("AUD-03.4: Scope and Capability Reconciliation & Privilege Containment", async () => {
    // Platform Capability catalog verification
    const vtoCap = PLATFORM_CAPABILITY_CATALOG.find((c) => c.id === "vto.tryon");
    const arCap = PLATFORM_CAPABILITY_CATALOG.find((c) => c.id === "ar.fitting_room");

    assert.ok(vtoCap, "vto.tryon capability must be defined");
    assert.ok(arCap, "ar.fitting_room capability must be defined");
    assert.equal(vtoCap.category, "AR_3D");
    assert.equal(arCap.category, "AR_3D");
    assert.ok(vtoCap.endpoints.includes("POST /api/v1/vto/tryon"));
    assert.ok(arCap.endpoints.includes("POST /api/v1/vto/tryon"));

    // Verify that VTO scope does NOT grant unrelated permissions (privilege containment)
    const resSpareParts = await fetch(`${baseUrl}/api/v1/spareparts/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": vtoOnlyApiKey,
        "X-Tenant-Id": validTenantId,
      },
      body: JSON.stringify({ query: "filtro de aceite" }),
    });
    assert.equal(resSpareParts.status, 403, "VTO scope must NOT authorize spare parts search");
  });

  /**
   * AUD-03.5: Core Engine Purity & Zero Contamination from PROJ-03 Fleet Management (Fase 165)
   * Evidence Level: E1 (STATIC CODE ANALYSIS & BOUNDARY VERIFICATION)
   */
  it("AUD-03.5: Core Engine Purity & Zero Contamination from PROJ-03 Fleet Management (Fase 165)", () => {
    // 1. Verify src/domain/ contains 0 fleet domain models or files
    const domainDir = path.join(rootDir, "src", "domain");
    const domainFiles = fs.readdirSync(domainDir);
    assert.ok(!domainFiles.includes("fleet"), "src/domain/ must NOT contain 'fleet' module");
    assert.ok(!domainFiles.includes("telemetry"), "src/domain/ must NOT contain 'telemetry' module");
    assert.ok(!domainFiles.includes("logistics"), "src/domain/ must NOT contain 'logistics' module");

    // 2. Verify PLATFORM_CAPABILITY_CATALOG contains 0 fleet capabilities
    const fleetCaps = PLATFORM_CAPABILITY_CATALOG.filter((c) =>
      c.id.startsWith("fleet.") || c.id.startsWith("route.") || c.id.startsWith("dispatch.") || c.id.startsWith("maintenance.")
    );
    assert.equal(fleetCaps.length, 0, "PLATFORM_CAPABILITY_CATALOG must NOT be contaminated with fleet capabilities");

    // 3. Verify SQLite migrations contain 0 fleet tables
    const migrationsDir = path.join(rootDir, "src", "infrastructure", "persistence", "sqlite");
    const schemaFile = path.join(migrationsDir, "sqlite-schema-migration.ts");
    if (fs.existsSync(schemaFile)) {
      const content = fs.readFileSync(schemaFile, "utf8");
      assert.ok(!content.includes("CREATE TABLE IF NOT EXISTS fleet_vehicles"), "No fleet tables in DB schema");
      assert.ok(!content.includes("CREATE TABLE IF NOT EXISTS vehicle_telemetry"), "No telemetry tables in DB schema");
    }
  });

  /**
   * AUD-03.6: PROJ-03 Fleet Management Formalization Integrity & Scope Boundaries (Fase 165)
   * Evidence Level: E0 / E1 (CANONICAL ARTIFACT INTEGRITY)
   */
  it("AUD-03.6: PROJ-03 Fleet Management Formalization Integrity & Scope Boundaries (Fase 165)", () => {
    const charterPath = path.join(rootDir, "docs", "PROJ_03_FLEET_PRODUCT_CHARTER.md");
    const specPath = path.join(rootDir, "docs", "FLEET_TELEMETRY_SPECIFICATION.md");
    const portfolioPath = path.join(rootDir, "docs", "APPLICATION_PORTFOLIO.md");

    assert.ok(fs.existsSync(charterPath), "PROJ_03_FLEET_PRODUCT_CHARTER.md must exist");
    assert.ok(fs.existsSync(specPath), "FLEET_TELEMETRY_SPECIFICATION.md must exist");
    assert.ok(fs.existsSync(portfolioPath), "APPLICATION_PORTFOLIO.md must exist");

    const charter = fs.readFileSync(charterPath, "utf8");
    assert.ok(charter.includes("PROJ-03 Fleet Management"), "Charter defines PROJ-03");
    assert.ok(charter.includes("Drive-by-Wire"), "Charter explicitly excludes Drive-by-Wire control");
    assert.ok(charter.includes("Fecha de Formalización"), "Charter designates formalization date");
    assert.ok(charter.includes("fleet-dispatcher-agent"), "Charter defines dispatcher agent");
    assert.ok(charter.includes("maintenance-planner-agent"), "Charter defines maintenance agent");

    const spec = fs.readFileSync(specPath, "utf8");
    assert.ok(spec.includes("TelemetryEnvelope"), "Spec defines TelemetryEnvelope contract");
    assert.ok(spec.includes("TelemetryPosition"), "Spec defines TelemetryPosition WGS 84 contract");
    assert.ok(spec.includes("VehicleDiagnostics"), "Spec defines VehicleDiagnostics SAE J1979 contract");
    assert.ok(spec.includes("REQUIRED"), "Spec includes availability categories");

    const portfolio = fs.readFileSync(portfolioPath, "utf8");
    assert.ok(portfolio.includes("PLANNED / FORMALIZED"), "Portfolio records PLANNED / FORMALIZED status");
  });

  /**
   * AUD-03.7: OpenAPI 3.1 Specification Parity & Schema Integrity
   * Evidence Level: E1 / E4
   */
  it("AUD-03.7: OpenAPI 3.1 Specification Parity & Schema Integrity", () => {
    const openApiPath = path.join(rootDir, "docs", "openapi.yaml");
    const content = fs.readFileSync(openApiPath, "utf8");

    // 1. /vto/tryon declared
    assert.ok(content.includes("  /vto/tryon:"), "Endpoint /vto/tryon is in OpenAPI");
    assert.ok(content.includes("operationId: submitVirtualTryOn"), "operationId is declared");
    assert.ok(content.includes("apiKeyAuth: []"), "apiKeyAuth security scheme attached");
    assert.ok(content.includes("VirtualTryOnApiRequest"), "VirtualTryOnApiRequest component is referenced");

    // 2. Zero premature fleet endpoints in OpenAPI 3.1
    assert.ok(!content.includes("  /fleet/"), "No /fleet/* routes prematurely added in OpenAPI");
    assert.ok(!content.includes("  /telemetry/"), "No /telemetry/* routes prematurely added in OpenAPI");
  });

  /**
   * AUD-03.8: SSE Telemetry Event Publication, Trace Correlation & Privacy Isolation (Fase 164)
   * Evidence Level: E5 (LIVE HTTP IN-PROCESS)
   */
  it("AUD-03.8: SSE Telemetry Event Publication, Trace Correlation & Privacy Isolation (Fase 164)", async () => {
    const eventStream = service.getEventStream();
    assert.ok(eventStream, "EventStreamAdapter is active on platform");

    const customTraceId = `trace-aud-03-${Date.now()}`;
    const capturedEvents: any[] = [];

    const originalPublish = eventStream.publishEvent.bind(eventStream);
    eventStream.publishEvent = (event: any) => {
      if (event.traceId === customTraceId) {
        capturedEvents.push(event);
      }
      return originalPublish(event);
    };

    try {
      const res = await fetch(`${baseUrl}/api/v1/vto/tryon`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": validApiKey,
          "X-Tenant-Id": validTenantId,
          "X-Trace-Id": customTraceId,
        },
        body: JSON.stringify({
          garment: CANONICAL_TEST_GARMENT,
          bodyProfile: CANONICAL_TEST_BODY_PROFILE,
        }),
      });

      assert.equal(res.status, 200);

      // Verify lifecycle events
      assert.equal(capturedEvents.length, 2, "Must emit started and completed events");
      assert.equal(capturedEvents[0].type, "vto.tryon.started");
      assert.equal(capturedEvents[0].traceId, customTraceId);
      assert.equal(capturedEvents[1].type, "vto.tryon.completed");
      assert.equal(capturedEvents[1].traceId, customTraceId);

      // Verify Privacy by Design: 0 raw optical data in telemetry payload
      for (const ev of capturedEvents) {
        assert.ok(!ev.payload.userImage, "Telemetry must NOT contain raw user image");
        assert.ok(!ev.payload.opticalBuffer, "Telemetry must NOT contain optical buffer");
        assert.ok(!ev.payload.pixels, "Telemetry must NOT contain pixel arrays");
      }
    } finally {
      eventStream.publishEvent = originalPublish;
    }
  });
});

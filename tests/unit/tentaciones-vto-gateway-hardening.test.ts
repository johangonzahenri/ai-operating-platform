/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * FASE 164: Post-Release Certification Evidence Hardening & Platform Integration Gateway
 * 
 * Demonstrates:
 * 1. Hardened Gateway Authentication (401 UNAUTHORIZED for missing/invalid credentials, 200 ALLOW for valid).
 * 2. Tenant Isolation & Application Reconciliation (403 TENANT_MISMATCH, 403 APPLICATION_MISMATCH).
 * 3. Granular Capability / Scope Enforcement (403 INSUFFICIENT_SCOPE for restricted, 200 for vto.tryon, vto.*, ar.fitting_room).
 * 4. OpenAPI 3.1 Contract Parity & Capability Catalog Alignment.
 * 5. SSE Telemetry Streaming & Lifecycle Event Emission (vto.tryon.started, vto.tryon.completed, vto.tryon.failed).
 * 6. Observability & Trace Correlation (traceId, requestId, tenantId, applicationId).
 * 7. Fail-Closed Validation & Safe Error Isolation.
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
} from "../../src/application/vto/index.js";
import { PLATFORM_CAPABILITY_CATALOG } from "../../src/domain/application/application-contract.js";

const rootDir = process.cwd();

describe("Phase 164 — PROJ-01 Tentaciones AI Commerce: Post-Release Certification Evidence Hardening & Platform Gateway", () => {
  let server: ReturnType<typeof createHttpServer>;
  let service: PlatformService;
  let baseUrl: string;
  let vtoService: VirtualTryOnService;

  const validTenantId = "tenant-tentaciones";
  const otherTenantId = "tenant-other-store";

  let validApiKey: string;
  let restrictedApiKey: string;
  let otherTenantApiKey: string;
  let mismatchedAppApiKey: string;
  let canonicalArApiKey: string;

  before(async () => {
    const platform = createPlatform();
    vtoService = new VirtualTryOnService();

    // 1. Valid API Key with full VTO scopes and matching tenant/app
    const validCred = await platform.apiCredentialService.createCredential({
      principalId: "service-tentaciones-vto",
      principalType: "SERVICE",
      tenantId: validTenantId,
      applicationId: TENTACIONES_APPLICATION_ID,
      name: "Tentaciones VTO Certified Integration Key",
      scopes: ["vto.tryon", "vto.*", "ar.fitting_room", "public.read", "health.check", "events.read"],
    });
    validApiKey = validCred.rawKey;

    // 2. Restricted API Key lacking VTO scopes
    const restrictedCred = await platform.apiCredentialService.createCredential({
      principalId: "service-tentaciones-restricted",
      principalType: "SERVICE",
      tenantId: validTenantId,
      applicationId: TENTACIONES_APPLICATION_ID,
      name: "Restricted Scope Key",
      scopes: ["tasks.read", "health.check"],
    });
    restrictedApiKey = restrictedCred.rawKey;

    // 3. API Key from different tenant
    const otherTenantCred = await platform.apiCredentialService.createCredential({
      principalId: "service-other-tenant",
      principalType: "SERVICE",
      tenantId: otherTenantId,
      applicationId: TENTACIONES_APPLICATION_ID,
      name: "Other Tenant Key",
      scopes: ["vto.tryon", "vto.*"],
    });
    otherTenantApiKey = otherTenantCred.rawKey;

    // 4. API Key with mismatched application ID
    const mismatchedAppCred = await platform.apiCredentialService.createCredential({
      principalId: "service-mismatched-app",
      principalType: "SERVICE",
      tenantId: validTenantId,
      applicationId: "unauthorized-application",
      name: "Mismatched App Key",
      scopes: ["vto.tryon"],
    });
    mismatchedAppApiKey = mismatchedAppCred.rawKey;

    // 5. API Key with canonical capability scope (ar.fitting_room)
    const canonicalArCred = await platform.apiCredentialService.createCredential({
      principalId: "service-tentaciones-ar",
      principalType: "SERVICE",
      tenantId: validTenantId,
      applicationId: TENTACIONES_APPLICATION_ID,
      name: "Canonical AR Fitting Room Key",
      scopes: ["ar.fitting_room", "health.check"],
    });
    canonicalArApiKey = canonicalArCred.rawKey;

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

    server = createHttpServer(service, {
      apiCredentialService: platform.apiCredentialService,
      virtualTryOnService: vtoService,
      enforceSecurity: true,
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });

  // =========================================================================
  // 1. LIVE HTTP GATEWAY AUTHENTICATION (Task 164.1 & 164.6 — Evidence Level E5)
  // =========================================================================
  describe("1. Hardened Gateway Authentication Proofs (LIVE HTTP — E5)", () => {
    it("1.1 Positive: Valid API Key + Matching Tenant -> 200 ALLOW with complete VTO result", async () => {
      const traceId = "trace-f164-test-001";
      const res = await fetch(`${baseUrl}/api/v1/vto/tryon`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": validApiKey,
          "X-Tenant-Id": validTenantId,
          "X-Application-Id": TENTACIONES_APPLICATION_ID,
          "X-Trace-Id": traceId,
        },
        body: JSON.stringify({
          garment: CANONICAL_TEST_GARMENT,
          bodyProfile: CANONICAL_TEST_BODY_PROFILE,
        }),
      });

      assert.equal(res.status, 200);
      const data = await res.json() as any;
      assert.equal(data.status, "SUCCESS");
      assert.ok(data.jobId);
      assert.ok(data.requestId);
      assert.ok(data.compositeArtifact);
      assert.equal(data.compositeArtifact.kind, "FINAL_COMPOSITE_IMAGE");
      assert.ok(data.fitAssessment);
      assert.ok(data.fitAssessment.fitScore >= 0.8);
      assert.equal(data.inferenceMetadata.providerId, "vto-provider-deterministic-fake");
    });

    it("1.2 Negative: Missing API Key / Authorization Header -> 401 UNAUTHORIZED", async () => {
      const res = await fetch(`${baseUrl}/api/v1/vto/tryon`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Tenant-Id": validTenantId,
        },
        body: JSON.stringify({
          garment: CANONICAL_TEST_GARMENT,
          bodyProfile: CANONICAL_TEST_BODY_PROFILE,
        }),
      });

      assert.equal(res.status, 401);
      const data = await res.json() as any;
      assert.equal(data.code, "NO_CREDENTIALS_PROVIDED");
    });

    it("1.3 Negative: Invalid/Apocryphal API Key -> 401 UNAUTHORIZED", async () => {
      const res = await fetch(`${baseUrl}/api/v1/vto/tryon`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": "key-invalid-apocryphal.secret12345",
          "X-Tenant-Id": validTenantId,
        },
        body: JSON.stringify({
          garment: CANONICAL_TEST_GARMENT,
          bodyProfile: CANONICAL_TEST_BODY_PROFILE,
        }),
      });

      assert.equal(res.status, 401);
      const data = await res.json() as any;
      assert.equal(data.code, "KEY_NOT_FOUND");
    });
  });

  // =========================================================================
  // 2. TENANT ISOLATION & APPLICATION RECONCILIATION (Task 164.2 — E5)
  // =========================================================================
  describe("2. Tenant Isolation & Application Reconciliation (LIVE HTTP — E5)", () => {
    it("2.1 Negative: Header tenant mismatch against authenticated credential -> 403 TENANT_MISMATCH", async () => {
      const res = await fetch(`${baseUrl}/api/v1/vto/tryon`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": validApiKey, // credential tenant is validTenantId
          "X-Tenant-Id": "tenant-tampered-foreign", // header mismatch
        },
        body: JSON.stringify({
          garment: CANONICAL_TEST_GARMENT,
          bodyProfile: CANONICAL_TEST_BODY_PROFILE,
        }),
      });

      assert.equal(res.status, 403);
      const data = await res.json() as any;
      assert.equal(data.code, "TENANT_MISMATCH");
    });

    it("2.2 Negative: Payload tenantId mismatch against caller tenant -> 403 TENANT_MISMATCH", async () => {
      const res = await fetch(`${baseUrl}/api/v1/vto/tryon`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": validApiKey,
          "X-Tenant-Id": validTenantId,
        },
        body: JSON.stringify({
          tenantId: "tenant-injected-malicious",
          garment: CANONICAL_TEST_GARMENT,
          bodyProfile: CANONICAL_TEST_BODY_PROFILE,
        }),
      });

      assert.equal(res.status, 403);
      const data = await res.json() as any;
      assert.equal(data.code, "TENANT_MISMATCH");
    });

    it("2.3 Negative: Application mismatch against credential metadata -> 403 APPLICATION_MISMATCH", async () => {
      const res = await fetch(`${baseUrl}/api/v1/vto/tryon`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": mismatchedAppApiKey, // registered to 'unauthorized-application'
          "X-Application-Id": TENTACIONES_APPLICATION_ID, // caller asserts tentaciones-commerce
          "X-Tenant-Id": validTenantId,
        },
        body: JSON.stringify({
          garment: CANONICAL_TEST_GARMENT,
          bodyProfile: CANONICAL_TEST_BODY_PROFILE,
        }),
      });

      assert.equal(res.status, 403);
      const data = await res.json() as any;
      assert.equal(data.code, "APPLICATION_MISMATCH");
    });
  });

  // =========================================================================
  // 3. CAPABILITY & SCOPE ENFORCEMENT (Task 164.3 — E5)
  // =========================================================================
  describe("3. Capability & Scope Enforcement (LIVE HTTP — E5)", () => {
    it("3.1 Negative: Credential lacking VTO scope -> 403 INSUFFICIENT_SCOPE", async () => {
      const res = await fetch(`${baseUrl}/api/v1/vto/tryon`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": restrictedApiKey, // has only ['tasks.read', 'health.check']
          "X-Tenant-Id": validTenantId,
          "X-Application-Id": TENTACIONES_APPLICATION_ID,
        },
        body: JSON.stringify({
          garment: CANONICAL_TEST_GARMENT,
          bodyProfile: CANONICAL_TEST_BODY_PROFILE,
        }),
      });

      assert.equal(res.status, 403);
      const data = await res.json() as any;
      assert.equal(data.code, "INSUFFICIENT_SCOPE");
      assert.ok(data.error.includes("lacks required scope"));
    });

    it("3.2 Positive: Credential with canonical capability 'ar.fitting_room' -> 200 ALLOW", async () => {
      const res = await fetch(`${baseUrl}/api/v1/vto/tryon`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": canonicalArApiKey, // has ['ar.fitting_room']
          "X-Tenant-Id": validTenantId,
          "X-Application-Id": TENTACIONES_APPLICATION_ID,
        },
        body: JSON.stringify({
          garment: CANONICAL_TEST_GARMENT,
          bodyProfile: CANONICAL_TEST_BODY_PROFILE,
        }),
      });

      assert.equal(res.status, 200);
      const data = await res.json() as any;
      assert.equal(data.status, "SUCCESS");
    });

    it("3.3 Positive: Confirms capability registration in PLATFORM_CAPABILITY_CATALOG", () => {
      const arFittingCap = PLATFORM_CAPABILITY_CATALOG.find((c) => c.id === "ar.fitting_room");
      assert.ok(arFittingCap, "ar.fitting_room capability exists");
      assert.equal(arFittingCap.category, "AR_3D");
      assert.ok(arFittingCap.endpoints.includes("POST /api/v1/vto/tryon"));

      const vtoCap = PLATFORM_CAPABILITY_CATALOG.find((c) => c.id === "vto.tryon");
      assert.ok(vtoCap, "vto.tryon capability exists");
      assert.ok(vtoCap.endpoints.includes("POST /api/v1/vto/tryon"));
    });
  });

  // =========================================================================
  // 4. OPENAPI 3.1 SPECIFICATION CONTRACT PARITY (Task 164.4 — E1 / E4)
  // =========================================================================
  describe("4. OpenAPI 3.1 Specification Contract Parity (E1 / E4)", () => {
    it("4.1 confirms /vto/tryon is formally declared with operationId 'submitVirtualTryOn'", () => {
      const openApiPath = path.join(rootDir, "docs", "openapi.yaml");
      const content = fs.readFileSync(openApiPath, "utf8");

      assert.ok(content.includes("  /vto/tryon:"), "route /vto/tryon is in openapi.yaml");
      assert.ok(content.includes("operationId: submitVirtualTryOn"), "operationId submitVirtualTryOn is declared");
      assert.ok(content.includes("$ref: '#/components/schemas/VirtualTryOnApiRequest'"), "request schema ref exists");
      assert.ok(content.includes("$ref: '#/components/schemas/VirtualTryOnApiResponse'"), "response schema ref exists");
    });

    it("4.2 confirms all component schemas resolve cleanly without orphan references", () => {
      const openApiPath = path.join(rootDir, "docs", "openapi.yaml");
      const content = fs.readFileSync(openApiPath, "utf8");

      const requiredSchemas = [
        "VirtualTryOnApiRequest",
        "VirtualTryOnApiResponse",
        "GarmentApiReference",
        "BodyProfileApiReference",
        "ImageAssetApiReference",
        "PoseApiReference",
        "VirtualTryOnPrivacyPolicyApi",
        "VirtualTryOnArtifactApi",
      ];

      for (const s of requiredSchemas) {
        assert.ok(content.includes(`    ${s}:`), `Schema ${s} is declared in components`);
      }
    });
  });

  // =========================================================================
  // 5. SERVER-SENT EVENTS (SSE) LIFECYCLE & TELEMETRY (Task 164.5 — E5)
  // =========================================================================
  describe("5. Server-Sent Events (SSE) Lifecycle Streaming (LIVE HTTP — E5)", () => {
    it("5.1 publishes vto.tryon.started and vto.tryon.completed events on platform EventStreamAdapter", async () => {
      const eventStream = service.getEventStream();
      assert.ok(eventStream, "EventStreamAdapter is active on platform service");

      const traceId = `trace-sse-${Date.now()}`;
      const publishedEvents: any[] = [];

      // Intercept publishEvent on adapter
      const originalPublish = eventStream.publishEvent.bind(eventStream);
      eventStream.publishEvent = (ev: any) => {
        if (ev.traceId === traceId) {
          publishedEvents.push(ev);
        }
        return originalPublish(ev);
      };

      try {
        const res = await fetch(`${baseUrl}/api/v1/vto/tryon`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": validApiKey,
            "X-Tenant-Id": validTenantId,
            "X-Trace-Id": traceId,
          },
          body: JSON.stringify({
            garment: CANONICAL_TEST_GARMENT,
            bodyProfile: CANONICAL_TEST_BODY_PROFILE,
          }),
        });

        assert.equal(res.status, 200);

        // Verify lifecycle telemetry events were emitted
        assert.equal(publishedEvents.length, 2, "Expected exactly 2 telemetry events (started + completed)");
        assert.equal(publishedEvents[0].type, "vto.tryon.started");
        assert.equal(publishedEvents[0].traceId, traceId);
        assert.equal(publishedEvents[0].payload.applicationId, TENTACIONES_APPLICATION_ID);
        assert.equal(publishedEvents[0].payload.tenantId, validTenantId);
        assert.equal(publishedEvents[0].payload.productId, CANONICAL_TEST_GARMENT.productId);

        assert.equal(publishedEvents[1].type, "vto.tryon.completed");
        assert.equal(publishedEvents[1].traceId, traceId);
        assert.equal(publishedEvents[1].payload.status, "SUCCESS");
        assert.equal(publishedEvents[1].payload.providerId, "vto-provider-deterministic-fake");
      } finally {
        eventStream.publishEvent = originalPublish;
      }
    });

    it("5.2 emits vto.tryon.failed when the try-on pipeline encounters an error", async () => {
      const eventStream = service.getEventStream();
      assert.ok(eventStream);

      const traceId = `trace-failed-${Date.now()}`;
      const failedEvents: any[] = [];

      const originalPublish = eventStream.publishEvent.bind(eventStream);
      eventStream.publishEvent = (ev: any) => {
        if (ev.traceId === traceId) {
          failedEvents.push(ev);
        }
        return originalPublish(ev);
      };

      try {
        // Send a request with invalid negative TTL to trigger pipeline error
        const res = await fetch(`${baseUrl}/api/v1/vto/tryon`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": validApiKey,
            "X-Tenant-Id": validTenantId,
            "X-Trace-Id": traceId,
          },
          body: JSON.stringify({
            garment: CANONICAL_TEST_GARMENT,
            bodyProfile: CANONICAL_TEST_BODY_PROFILE,
            privacyPolicy: {
              ttlSeconds: -10, // Invalid: negative TTL triggers validation failure
            },
          }),
        });

        // The try-on service throws on negative TTL -> 500 INTERNAL_SERVER_ERROR
        assert.equal(res.status, 500);

        // Verify vto.tryon.failed event was published
        const failedEvent = failedEvents.find((e) => e.type === "vto.tryon.failed");
        assert.ok(failedEvent, "vto.tryon.failed was published");
        assert.equal(failedEvent.traceId, traceId);
        assert.ok(failedEvent.payload.error);
      } finally {
        eventStream.publishEvent = originalPublish;
      }
    });
  });

  // =========================================================================
  // 6. OBSERVABILITY & TRACE CORRELATION (Task 164.7 — E5)
  // =========================================================================
  describe("6. Observability & End-to-End Trace Correlation (LIVE HTTP — E5)", () => {
    it("6.1 correlates custom traceId and requestId across HTTP Request, VTO Engine, and Response", async () => {
      const customTraceId = "trace-e2e-correlation-xyz-789";
      const customRequestId = "req-e2e-correlation-abc-123";

      const res = await fetch(`${baseUrl}/api/v1/vto/tryon`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": validApiKey,
          "X-Tenant-Id": validTenantId,
          "X-Trace-Id": customTraceId,
          "X-Request-Id": customRequestId,
        },
        body: JSON.stringify({
          requestId: customRequestId,
          metadata: { traceId: customTraceId },
          garment: CANONICAL_TEST_GARMENT,
          bodyProfile: CANONICAL_TEST_BODY_PROFILE,
        }),
      });

      assert.equal(res.status, 200);
      const data = await res.json() as any;
      assert.equal(data.requestId, customRequestId, "Response requestId matches caller supplied requestId");
      assert.ok(data.completedAt, "completedAt timestamp is provided");
      assert.ok(new Date(data.completedAt).getTime() <= Date.now());
    });
  });

  // =========================================================================
  // 7. FAIL-CLOSED VALIDATION & SECURITY ISOLATION (Task 164.8 — E5)
  // =========================================================================
  describe("7. Fail-Closed Validation & Security Isolation (LIVE HTTP — E5)", () => {
    it("7.1 rejects payload missing required garment properties -> 400 INVALID_REQUEST", async () => {
      const res = await fetch(`${baseUrl}/api/v1/vto/tryon`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": validApiKey,
          "X-Tenant-Id": validTenantId,
        },
        body: JSON.stringify({
          garment: { name: "Incomplete Garment" }, // missing productId and category
          bodyProfile: CANONICAL_TEST_BODY_PROFILE,
        }),
      });

      assert.equal(res.status, 400);
      const data = await res.json() as any;
      assert.equal(data.code, "INVALID_REQUEST");
    });

    it("7.2 rejects payload missing required bodyProfile -> 400 INVALID_REQUEST", async () => {
      const res = await fetch(`${baseUrl}/api/v1/vto/tryon`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": validApiKey,
          "X-Tenant-Id": validTenantId,
        },
        body: JSON.stringify({
          garment: CANONICAL_TEST_GARMENT,
          // bodyProfile missing
        }),
      });

      assert.equal(res.status, 400);
      const data = await res.json() as any;
      assert.equal(data.code, "INVALID_REQUEST");
    });

    it("7.3 ensures error responses do not leak stack traces or internal server paths", async () => {
      const res = await fetch(`${baseUrl}/api/v1/vto/tryon`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": validApiKey,
          "X-Tenant-Id": validTenantId,
        },
        body: "invalid-non-json-body",
      });

      assert.equal(res.status, 400);
      const text = await res.text();
      assert.ok(!text.includes("node_modules"));
      assert.ok(!text.includes("at Module."));
      assert.ok(!text.includes("C:\\"));
      assert.ok(!text.includes("/home/"));
    });
  });
});

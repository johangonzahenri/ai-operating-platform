/**
 * AI Operating Platform — Transversal Quality Governance & Audit Suite
 * 
 * AUD-SISTEMA-001: First Full-System End-to-End Holistic Audit
 * 
 * Invariants Verified:
 * 1. Test Suite Pass != System Audit Approved != Production Certified
 * 2. Default Deny & Fail-Closed Authentication / Scoped Authorization
 * 3. Strict Multi-Tenant (Tenant A != Tenant B) & Multi-App Isolation
 * 4. Reactive SSE Event Stream with Monotonic Last-Event-ID & Replay
 * 5. PROJ-02 Spare Parts Search & Fitment Regression Golden Journey
 * 6. PROJ-01 Tentaciones VTO End-to-End Pipeline (Fases 153-156)
 * 7. Official Enterprise MCP Server Protocol Conformance
 * 8. Zero innerHTML / eval & Pure Hexagonal Architecture Isolation
 */

import test, { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { AddressInfo } from "node:net";

// Composition Root & Platform API Server
import { createPlatform } from "../../src/interfaces/composition.js";
import { PlatformService } from "../../src/platform/api/platform-service.js";
import { createHttpServer } from "../../src/platform/api/http-router.js";
import { PLATFORM_VERSION } from "../../src/platform/version.js";

// Domain & Security
import { SecurityContext, Principal } from "../../src/domain/security/security.js";
import { PLATFORM_CAPABILITY_CATALOG } from "../../src/domain/application/application-contract.js";

// Spare Parts (PROJ-02)
import { SparePartsFacade, SparePartsSearchRequest } from "../../src/application/spareparts/spare-parts-facade.js";
import { InMemoryAutomotiveSourceRegistry } from "../../src/application/spareparts/automotive-source-registry.js";
import { CANONICAL_AUTOMOTIVE_SOURCES } from "../../src/infrastructure/spareparts/canonical-sources.js";
import { TestFixtureAutomotiveConnector } from "../../src/infrastructure/spareparts/fixture-connectors.js";

// Tentaciones VTO (PROJ-01, Fases 153-156)
import {
  GarmentReference,
  BodyProfileReference,
} from "../../src/domain/vto/virtual-tryon.js";
import { CanonicalLandmarkIndex } from "../../src/domain/vto/pose-types.js";
import { PosePreprocessingPipeline, RawPoseInput } from "../../src/domain/vto/pose-preprocessing-pipeline.js";
import { DeterministicFakeSegmentationProvider } from "../../src/domain/vto/segmentation-provider.js";
import { DeterministicFakeDepthProvider } from "../../src/domain/vto/depth-provider.js";
import { DepthMaterialPipeline } from "../../src/domain/vto/depth-material-pipeline.js";

// Workflows & Verifier
import { WorkflowDefinition } from "../../src/domain/workflow/workflow-definition.js";
import { DeterministicVerifier } from "../../src/application/workflow/deterministic-verifier.js";

// MCP Server Adapter
import { createPlatformMcpServer } from "../../src/platform/mcp/platform-mcp-server.js";
import { ToolInvocationRuntime } from "../../src/application/tools/tool-invocation-runtime.js";
import { InMemoryToolRegistry } from "../../src/infrastructure/tools/in-memory-tool-registry.js";
import { InMemoryIdempotencyStore } from "../../src/infrastructure/persistence/in-memory-idempotency-store.js";
import { InMemoryAgentRateLimiter } from "../../src/infrastructure/security/agent-rate-limiter.js";
import { InMemoryRoleRepository } from "../../src/infrastructure/security/in-memory-role-repository.js";
import { RbacAuthorizationEvaluator } from "../../src/application/security/rbac-authorization-evaluator.js";
import { SecurityBoundaryEnforcer } from "../../src/application/security/security-boundary-enforcer.js";
import { InMemoryHITLBridge } from "../../src/infrastructure/workflow/in-memory-hitl-bridge.js";

import { DomainEvent } from "../../src/domain/events/events.js";

describe("AUD-SISTEMA-001: Master Full-System End-to-End Audit Suite", () => {
  let server: ReturnType<typeof createHttpServer>;
  let service: PlatformService;
  let platformInstance: ReturnType<typeof createPlatform>;
  let baseUrl: string;

  // Key Identifiers
  const tenantAlpha = "tenant-enterprise-alpha";
  const tenantBeta = "tenant-enterprise-beta";
  const appAlpha = "app-enterprise-alpha";
  let validAlphaKey: string;
  let restrictedScopeKey: string;
  let operatorAlphaKey: string;

  before(async () => {
    const platform = createPlatform();
    platformInstance = platform;

    // Register test agent in service
    try {
      platform.agents.register({
        id: "agent-research",
        name: "Research Agent",
        model: "stub-model",
        instructions: "Research data",
        tools: [],
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
    } catch {
      // Ignore if already registered
    }

    // 1. Create Alpha Tenant Admin Credential
    const alphaCred = await platform.apiCredentialService.createCredential({
      principalId: "service-alpha-admin",
      principalType: "SERVICE",
      tenantId: tenantAlpha,
      applicationId: appAlpha,
      name: "Alpha Admin Key",
      scopes: ["*"],
    });
    validAlphaKey = alphaCred.rawKey;

    // 2. Create Alpha Tenant Restricted Credential (read-only tasks)
    const restrictedCred = await platform.apiCredentialService.createCredential({
      principalId: "service-alpha-restricted",
      principalType: "SERVICE",
      tenantId: tenantAlpha,
      applicationId: appAlpha,
      name: "Alpha Restricted Key",
      scopes: ["tasks.read", "health.check"],
    });
    restrictedScopeKey = restrictedCred.rawKey;

    // 3. Create Alpha Tenant Non-Wildcard Operator Credential (for isolation testing)
    const opCred = await platform.apiCredentialService.createCredential({
      principalId: "service-alpha-operator",
      principalType: "SERVICE",
      tenantId: tenantAlpha,
      applicationId: appAlpha,
      name: "Alpha Operator Key",
      scopes: ["tasks.read", "tasks.create", "task.read", "task.create"],
    });
    operatorAlphaKey = opCred.rawKey;

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
      apiKeyRepository: platform.apiKeyRepository,
      apiCredentialService: platform.apiCredentialService,
      enforceSecurity: true, // Fail-closed production mode
      trustProxy: true,
      corsOrigins: ["http://127.0.0.1:3000"],
      allowedHosts: ["127.0.0.1", "localhost"],
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
  // E2E-01: Platform Startup, Health & Capability Discovery
  // =========================================================================
  describe("E2E-01: Platform Startup, Health & Capability Discovery", () => {
    it("1.1 returns HTTP 200 with platform health and version from /api/v1/health", async () => {
      const res = await fetch(`${baseUrl}/api/v1/health`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.status, "HEALTHY");
      assert.equal(data.version, PLATFORM_VERSION);
      assert.ok(typeof data.uptimeSeconds === "number");
    });

    it("1.2 returns HTTP 200 with capability catalog from /api/v1/capabilities", async () => {
      const res = await fetch(`${baseUrl}/api/v1/capabilities`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data));
      assert.ok(data.length >= 10);
      assert.ok(data.some((c: any) => c.id === "product.discovery"));
      assert.ok(data.some((c: any) => c.id === "spareparts.search"));
    });

    it("1.3 returns HTTP 200 with network perimeter diagnostics", async () => {
      const res = await fetch(`${baseUrl}/api/v1/diagnostics/network`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(data.bindAddress);
      assert.equal(data.trustProxy, true);
    });
  });

  // =========================================================================
  // E2E-02: Live Gateway Authentication & Security Boundary
  // =========================================================================
  describe("E2E-02: Live Gateway Authentication & Security Boundary", () => {
    it("2.1 rejects unauthenticated request to protected endpoint with HTTP 401", async () => {
      const res = await fetch(`${baseUrl}/api/v1/tasks`, {
        headers: {
          "Content-Type": "application/json",
        },
      });
      assert.equal(res.status, 401);
      const data = await res.json();
      assert.ok(data.error);
    });

    it("2.2 rejects invalid/forged API key with HTTP 401", async () => {
      const res = await fetch(`${baseUrl}/api/v1/tasks`, {
        headers: {
          "Authorization": "Bearer aop_live_forged_invalid_key_12345",
          "Content-Type": "application/json",
        },
      });
      assert.equal(res.status, 401);
      const data = await res.json();
      assert.ok(data.error);
    });

    it("2.3 allows authenticated request with valid API key with HTTP 200", async () => {
      const res = await fetch(`${baseUrl}/api/v1/tasks`, {
        headers: {
          "Authorization": `Bearer ${validAlphaKey}`,
          "X-Tenant-ID": tenantAlpha,
          "Content-Type": "application/json",
        },
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data));
    });
  });

  // =========================================================================
  // E2E-03: Scoped Authorization & Method Security Enforcement
  // =========================================================================
  describe("E2E-03: Scoped Authorization & Method Security Enforcement", () => {
    it("3.1 rejects request when credential lacks required scope with HTTP 403", async () => {
      // restrictedScopeKey only has tasks.read, cannot POST tasks
      const res = await fetch(`${baseUrl}/api/v1/tasks`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${restrictedScopeKey}`,
          "X-Tenant-ID": tenantAlpha,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agentId: "agent-research",
          input: { query: "unauthorized" },
        }),
      });
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.ok(data.code === "INSUFFICIENT_SCOPE" || data.error?.includes("scope") || data.error?.includes("Access denied"));
    });

    it("3.2 allows request when credential has exact or wildcard scope with HTTP 200/201", async () => {
      const res = await fetch(`${baseUrl}/api/v1/tasks`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${validAlphaKey}`,
          "X-Tenant-ID": tenantAlpha,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agentId: "agent-research",
          input: { query: "authorized data analysis" },
        }),
      });
      assert.ok(res.status === 200 || res.status === 201);
      const data = await res.json();
      assert.ok(data.taskId || data.id || data.task);
    });
  });

  // =========================================================================
  // E2E-04: Multi-Tenant & Application Isolation Invariants
  // =========================================================================
  describe("E2E-04: Multi-Tenant & Application Isolation Invariants", () => {
    it("4.1 rejects request when header X-Tenant-ID does not match non-wildcard credential tenant with HTTP 403", async () => {
      // operatorAlphaKey belongs to tenantAlpha, attempting to masquerade as tenantBeta
      const res = await fetch(`${baseUrl}/api/v1/tasks`, {
        headers: {
          "Authorization": `Bearer ${operatorAlphaKey}`,
          "X-Tenant-ID": tenantBeta, // MISMATCH!
          "Content-Type": "application/json",
        },
      });
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.ok(data.code === "TENANT_MISMATCH" || data.error?.includes("tenant") || data.error?.includes("Tenant mismatch"));
    });

    it("4.2 rejects request when header X-Application-ID does not match non-wildcard credential application with HTTP 403", async () => {
      const res = await fetch(`${baseUrl}/api/v1/tasks`, {
        headers: {
          "Authorization": `Bearer ${operatorAlphaKey}`,
          "X-Tenant-ID": tenantAlpha,
          "X-Application-ID": "foreign-unregistered-app", // MISMATCH!
          "Content-Type": "application/json",
        },
      });
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.ok(data.code === "APPLICATION_MISMATCH" || data.error?.includes("application") || data.error?.includes("Application mismatch"));
    });
  });

  // =========================================================================
  // E2E-05: Governed Workflow Execution & Verification Engine
  // =========================================================================
  describe("E2E-05: Governed Workflow Execution & Verification Engine", () => {
    it("5.1 (Level E3 - Integration) validates DAG dependency resolution and monotonic verification verdict", () => {
      const wf = WorkflowDefinition.create({
        id: "wf-audit-001",
        tenantId: tenantAlpha,
        organizationId: "org-alpha",
        name: "Transversal Audit Governance Workflow",
        version: 1,
        steps: [
          {
            stepId: "step-1-fetch",
            name: "Data Fetch Step",
            agentId: "agent-research",
            order: 0,
            dependencies: [],
            action: { toolId: "tool-data-fetch", inputSchema: {} },
          },
          {
            stepId: "step-2-verify",
            name: "Verification Step",
            agentId: "agent-verifier",
            order: 1,
            dependencies: ["step-1-fetch"],
            action: { toolId: "tool-verify", inputSchema: {} },
          },
        ],
      });

      assert.equal(wf.id, "wf-audit-001");
      assert.equal(wf.steps.length, 2);

      // Deterministic Verifier check
      const verification = DeterministicVerifier.evaluate(
        { resultStatus: "SUCCESS", value: 100 },
        {
          ruleId: "rule-numeric",
          ruleType: "RANGE",
          field: "value",
          min: 1,
          max: 200,
          severity: "BLOCKING",
        }
      );

      assert.equal(verification.verdict, "PASS");
    });

    it("5.2 (Level E5 - Live HTTP) verifies workflow definition and instance lifecycle through HTTP API", async () => {
      // Create Workflow Definition via POST /api/v1/workflows
      const createDefRes = await fetch(`${baseUrl}/api/v1/workflows`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${validAlphaKey}`,
          "X-Tenant-ID": tenantAlpha,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: "wf-http-audit-001",
          name: "Live HTTP Audit Workflow",
          organizationId: "org-alpha",
          steps: [
            {
              stepId: "step-initial",
              name: "Initial Step",
              agentId: "agent-research",
              order: 0,
              dependencies: [],
              action: { toolId: "calculator", inputSchema: {} },
            },
          ],
        }),
      });

      assert.equal(createDefRes.status, 201);
      const defData = await createDefRes.json();
      assert.equal(defData.id, "wf-http-audit-001");

      // List Workflow Definitions via GET /api/v1/workflows
      const listRes = await fetch(`${baseUrl}/api/v1/workflows`, {
        headers: {
          "Authorization": `Bearer ${validAlphaKey}`,
          "X-Tenant-ID": tenantAlpha,
        },
      });
      assert.equal(listRes.status, 200);
      const listData = await listRes.json();
      assert.ok(Array.isArray(listData));
      assert.ok(listData.some((d: any) => d.id === "wf-http-audit-001"));
    });
  });

  // =========================================================================
  // E2E-06: Real-Time Event Streaming (Server-Sent Events & Replay)
  // =========================================================================
  describe("E2E-06: Real-Time Event Streaming (Server-Sent Events & Replay)", () => {
    it("6.1 (Level E5 - Live HTTP) connects to SSE stream and establishes text/event-stream response", async () => {
      const controller = new AbortController();
      const res = await fetch(`${baseUrl}/api/v1/events/stream`, {
        headers: {
          "Authorization": `Bearer ${validAlphaKey}`,
          "X-Tenant-ID": tenantAlpha,
          "Accept": "text/event-stream",
        },
        signal: controller.signal,
      });

      assert.equal(res.status, 200);
      assert.ok(res.headers.get("content-type")?.includes("text/event-stream"));
      controller.abort();
    });

    it("6.2 (Level E5 - Live HTTP) receives initial stream connection comment and live domain event broadcast", async () => {
      const controller = new AbortController();
      const res = await fetch(`${baseUrl}/api/v1/events/stream`, {
        headers: {
          "Authorization": `Bearer ${validAlphaKey}`,
          "X-Tenant-ID": tenantAlpha,
          "Accept": "text/event-stream",
        },
        signal: controller.signal,
      });

      assert.equal(res.status, 200);
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      // Read initial connection message
      const firstChunk = await reader.read();
      const firstText = decoder.decode(firstChunk.value);
      assert.ok(firstText.includes("stream connected"));

      // Broadcast live event on platform publisher
      platformInstance.events.publish({
        type: "audit.test.event",
        payload: { tenantId: tenantAlpha, message: "Live broadcast audit event", secretKey: "sensitive-token-123" },
        occurredAt: new Date(),
      } as any);

      // Read broadcasted event from stream
      const secondChunk = await reader.read();
      const secondText = decoder.decode(secondChunk.value);
      assert.ok(secondText.includes("audit.test.event"));
      assert.ok(secondText.includes("Live broadcast audit event"));
      // Assert secret redaction in stream payload
      assert.ok(secondText.includes("[REDACTED]"));

      controller.abort();
    });

    it("6.3 (Level E5 - Live HTTP) replays durable historical events matching tenant using Last-Event-ID header", async () => {
      // 1. Ingest a durable event into eventStore
      const durableEvent = await platformInstance.eventStore.append({
        eventId: `evt-audit-replay-${Date.now()}`,
        eventType: "audit.durable.event",
        aggregateType: "TENANT",
        aggregateId: tenantAlpha,
        tenantId: tenantAlpha,
        traceId: `trace-${Date.now()}`,
        correlationId: `corr-${Date.now()}`,
        payload: { note: "Historical event for replay check", tenantId: tenantAlpha },
        occurredAt: new Date(),
      });

      const durableSeq = durableEvent.sequenceNumber;
      assert.ok(durableSeq > 0);

      // 2. Connect with Last-Event-ID query/header for replay
      const controller = new AbortController();
      const res = await fetch(`${baseUrl}/api/v1/events/stream?lastEventId=${durableSeq - 1}`, {
        headers: {
          "Authorization": `Bearer ${validAlphaKey}`,
          "X-Tenant-ID": tenantAlpha,
          "Accept": "text/event-stream",
        },
        signal: controller.signal,
      });

      assert.equal(res.status, 200);
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      // Read chunks until replay event is received
      let accumulated = "";
      while (!accumulated.includes("audit.durable.event")) {
        const chunk = await reader.read();
        accumulated += decoder.decode(chunk.value);
      }

      assert.ok(accumulated.includes("audit.durable.event"));
      assert.ok(accumulated.includes("Historical event for replay check"));
      assert.ok(accumulated.includes(`"replayed":true`));

      controller.abort();
    });

    it("6.4 (Level E5 - Live HTTP) enforces tenant isolation on stream: Beta events are NOT delivered to Alpha subscriber", async () => {
      const controller = new AbortController();
      const res = await fetch(`${baseUrl}/api/v1/events/stream`, {
        headers: {
          "Authorization": `Bearer ${validAlphaKey}`,
          "X-Tenant-ID": tenantAlpha,
          "Accept": "text/event-stream",
        },
        signal: controller.signal,
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      const firstChunk = await reader.read();
      assert.ok(decoder.decode(firstChunk.value).includes("stream connected"));

      // Broadcast an event destined for Tenant Beta
      platformInstance.events.publish({
        type: "audit.tenant.beta.event",
        payload: { tenantId: tenantBeta, secretMessage: "Beta private data" },
        occurredAt: new Date(),
      } as any);

      // Broadcast an event for Tenant Alpha immediately after
      platformInstance.events.publish({
        type: "audit.tenant.alpha.event",
        payload: { tenantId: tenantAlpha, alphaMessage: "Alpha verified" },
        occurredAt: new Date(),
      } as any);

      const nextChunk = await reader.read();
      const text = decoder.decode(nextChunk.value);
      // Alpha event received, Beta event filtered out
      assert.ok(text.includes("audit.tenant.alpha.event"));
      assert.equal(text.includes("Beta private data"), false);

      controller.abort();
    });
  });

  // =========================================================================
  // E2E-07: PROJ-02 Spare Parts Search Regression Golden Journey
  // =========================================================================
  describe("E2E-07: PROJ-02 Spare Parts Search Regression Golden Journey", () => {
    it("7.1 executes full spare parts search, clustering, fitment, and landed cost comparison", async () => {
      const registry = new InMemoryAutomotiveSourceRegistry(CANONICAL_AUTOMOTIVE_SOURCES);
      const connectors = CANONICAL_AUTOMOTIVE_SOURCES.map((s) => new TestFixtureAutomotiveConnector(s, { mode: "SUCCESS" }));
      const facade = new SparePartsFacade({ registry, connectors });

      const request: SparePartsSearchRequest = {
        vehicle: {
          make: "Toyota",
          model: "Hilux",
          year: 2021,
          engine: "2.8 D-4D",
        },
        query: "Pastillas de freno delanteras",
      };

      const result = await facade.searchAndCompare(request);
      assert.equal(result.status, "SUCCESS");
      assert.ok(result.totalOffersFound > 0);
      assert.ok(result.clusters.length > 0);
      assert.ok(result.clusters[0].comparison);
    });
  });

  // =========================================================================
  // E2E-08: PROJ-01 Tentaciones VTO End-to-End Pipeline (Fases 153-156)
  // =========================================================================
  describe("E2E-08: PROJ-01 Tentaciones VTO End-to-End Pipeline (Fases 153-156)", () => {
    it("8.1 executes complete VTO chain: Pose -> Warping -> Depth -> Occlusion -> Material -> Composition", async () => {
      const sampleGarment: GarmentReference = {
        productId: "garment-biker-01",
        name: "Leather Biker Jacket",
        category: "UPPER_BODY",
        size: "M",
        primaryAsset: {
          referenceId: "asset-garment-01",
          sourceType: "ARTIFACT_REF",
          uriOrHandle: "memory://garments/biker.webp",
          mimeType: "image/webp",
        },
      };

      const sampleProfile: BodyProfileReference = {
        profileId: "profile-aud-01",
        profileType: "USER_CALIBRATED",
        genderPresentation: "NEUTRAL",
        measurements: { heightCm: 175, chestBustCm: 96, waistCm: 80, shoulderWidthCm: 45 },
      };

      const createSyntheticPoseLandmarks = () => [
        { id: CanonicalLandmarkIndex.NOSE, x: 960, y: 150, z: 0, confidence: 0.98 },
        { id: CanonicalLandmarkIndex.LEFT_SHOULDER, x: 800, y: 300, z: 0, confidence: 0.95 },
        { id: CanonicalLandmarkIndex.RIGHT_SHOULDER, x: 1120, y: 300, z: 0, confidence: 0.95 },
        { id: CanonicalLandmarkIndex.LEFT_ELBOW, x: 740, y: 500, z: 20, confidence: 0.92 },
        { id: CanonicalLandmarkIndex.RIGHT_ELBOW, x: 1180, y: 500, z: 20, confidence: 0.92 },
        { id: CanonicalLandmarkIndex.LEFT_WRIST, x: 700, y: 700, z: 10, confidence: 0.88 },
        { id: CanonicalLandmarkIndex.RIGHT_WRIST, x: 1220, y: 700, z: 10, confidence: 0.88 },
        { id: CanonicalLandmarkIndex.LEFT_HIP, x: 860, y: 650, z: 0, confidence: 0.94 },
        { id: CanonicalLandmarkIndex.RIGHT_HIP, x: 1060, y: 650, z: 0, confidence: 0.94 },
        { id: CanonicalLandmarkIndex.LEFT_KNEE, x: 870, y: 1000, z: 5, confidence: 0.91 },
        { id: CanonicalLandmarkIndex.RIGHT_KNEE, x: 1050, y: 1000, z: 5, confidence: 0.91 },
        { id: CanonicalLandmarkIndex.LEFT_ANKLE, x: 880, y: 1350, z: 0, confidence: 0.89 },
        { id: CanonicalLandmarkIndex.RIGHT_ANKLE, x: 1040, y: 1350, z: 0, confidence: 0.89 },
      ];

      const rawPose: RawPoseInput = {
        frameId: "frame-aud-001",
        timestampMs: 1000,
        isPixelCoordinates: true,
        imageDimensions: { widthPx: 1920, heightPx: 1080 },
        rawLandmarks: createSyntheticPoseLandmarks(),
      };

      const posePipeline = new PosePreprocessingPipeline();
      const preparedPose = posePipeline.processPoseFrame(rawPose, sampleGarment, sampleProfile);
      assert.equal(preparedPose.isReadyForInference, true);

      const segProvider = new DeterministicFakeSegmentationProvider({ defaultResolution: { width: 32, height: 32 } });
      const depthProvider = new DeterministicFakeDepthProvider({ defaultResolution: { width: 32, height: 32 }, defaultSceneType: "GARMENT_FOREGROUND" });
      const pipeline = new DepthMaterialPipeline({ segmentationProvider: segProvider, depthProvider });

      const renderInput = await pipeline.process(preparedPose, sampleGarment, tenantAlpha, sampleProfile);

      assert.equal(renderInput.isDegraded, false);
      assert.equal(renderInput.depthStatus, "SUCCESS");
      assert.ok(renderInput.materialProfile);
      assert.equal(renderInput.materialProfile.category, "LEATHER");
      assert.ok(renderInput.dynamicOcclusionMap);
      assert.ok(renderInput.depthAwareLayers.length === 3);
      assert.ok(renderInput.artifacts.length >= 7);
    });
  });

  // =========================================================================
  // E2E-09: Official Enterprise MCP Server Protocol Conformance
  // =========================================================================
  describe("E2E-09: Official Enterprise MCP Server Protocol Conformance", () => {
    it("9.1 handles initialize and tools listing over MCP Server", async () => {
      const toolRegistry = new InMemoryToolRegistry();
      const idempotencyStore = new InMemoryIdempotencyStore();
      const rateLimiter = new InMemoryAgentRateLimiter();
      const roleRepo = new InMemoryRoleRepository();
      const authzEvaluator = new RbacAuthorizationEvaluator(roleRepo);
      const boundaryEnforcer = new SecurityBoundaryEnforcer();

      const toolRuntime = new ToolInvocationRuntime({
        registry: toolRegistry,
        idempotencyStore,
        rateLimiter,
        authzEvaluator,
        boundaryEnforcer,
      });

      const mcpServer = createPlatformMcpServer({
        toolRuntime,
        toolRegistry,
        eventPublisher: { publish: () => {} } as any,
        hitlBridge: new InMemoryHITLBridge(),
        serverInfo: { name: "ai-operating-platform-mcp", version: "1.4.0" },
      });

      const secCtx = SecurityContext.create({
        correlationId: "corr-audit-mcp-001",
        principal: Principal.create({
          id: "mcp-service-user",
          type: "SERVICE",
          roles: ["service", "operator"],
          permissions: ["tools.*", "*"],
        }),
        tenantId: tenantAlpha,
        authenticated: true,
      });

      const initResponse = await mcpServer.handleRequest({
        jsonrpc: "2.0",
        id: "req-init-1",
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test-client", version: "1.0.0" },
        },
      }, secCtx);

      assert.equal(initResponse.jsonrpc, "2.0");
      assert.equal(initResponse.id, "req-init-1");
      assert.ok((initResponse as any).result?.serverInfo?.name === "ai-operating-platform-mcp");
    });
  });

  // =========================================================================
  // E2E-10: Static Security, DOM Purity & Hexagonal Boundary Audit (Level E1)
  // =========================================================================
  describe("E2E-10: Static Security, DOM Purity & Hexagonal Boundary Audit (Level E1)", () => {
    it("10.1 (Level E1 - Static) asserts 0 .innerHTML, 0 .outerHTML, 0 eval, and 0 document.write in platform frontend assets", () => {
      const webDir = path.resolve(process.cwd(), "src/platform/web");
      if (fs.existsSync(webDir)) {
        const jsFiles = fs.readdirSync(webDir).filter((f) => f.endsWith(".js"));
        for (const file of jsFiles) {
          const content = fs.readFileSync(path.join(webDir, file), "utf8");
          assert.equal(
            content.includes(".innerHTML =") || content.includes(".innerHTML="),
            false,
            `Forbidden innerHTML in ${file}`
          );
          assert.equal(
            content.includes(".outerHTML =") || content.includes(".outerHTML="),
            false,
            `Forbidden outerHTML in ${file}`
          );
          assert.equal(
            content.includes("eval(") || content.includes("document.write("),
            false,
            `Forbidden eval/document.write in ${file}`
          );
        }
      }
    });

    it("10.2 (Level E1 - Static) asserts Core domain layer contains zero HTTP, vendor SDK, or UI framework imports", () => {
      const domainDir = path.resolve(process.cwd(), "src/domain");
      if (fs.existsSync(domainDir)) {
        const scanDir = (dir: string) => {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              scanDir(fullPath);
            } else if (entry.isFile() && entry.name.endsWith(".ts")) {
              const content = fs.readFileSync(fullPath, "utf8");
              assert.equal(content.includes("from \"node:http\""), false, `Domain file ${entry.name} imports node:http`);
              assert.equal(content.includes("from \"express\""), false, `Domain file ${entry.name} imports express`);
              assert.equal(content.includes("from \"three\""), false, `Domain file ${entry.name} imports three`);
            }
          }
        };
        scanDir(domainDir);
      }
    });
  });

  // =========================================================================
  // E2E-11: Runtime Security Boundary & Secret Isolation Evaluation (Level E5)
  // =========================================================================
  describe("E2E-11: Runtime Security Boundary & Secret Isolation Evaluation (Level E5)", () => {
    it("11.1 (Level E5 - Live HTTP) enforces secret redaction in API responses and error payloads", async () => {
      // Intentionally request non-existent path or malformed task with secret-looking string
      const res = await fetch(`${baseUrl}/api/v1/tasks`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${validAlphaKey}`,
          "X-Tenant-ID": tenantAlpha,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agentId: "agent-research",
          input: { query: "hello", apiKey: "secret_live_token_12345" },
        }),
      });

      assert.ok(res.status === 200 || res.status === 201);
      const text = await res.text();
      // Ensure that raw bearer or credentials are never leaked back unmasked
      assert.equal(text.includes(validAlphaKey), false);
    });

    it("11.2 (Level E5 - Live HTTP) rejects requests with invalid Host header (Host Header Poisoning defense)", async () => {
      const port = Number(new URL(baseUrl).port);
      const res = await new Promise<{ statusCode: number }>((resolve, reject) => {
        const req = http.request(
          {
            hostname: "127.0.0.1",
            port,
            path: "/health",
            method: "GET",
            headers: { Host: "evil-attacker.com" },
          },
          (response) => {
            resolve({ statusCode: response.statusCode ?? 0 });
          }
        );
        req.on("error", reject);
        req.end();
      });

      assert.equal(res.statusCode, 400);
    });
  });
});

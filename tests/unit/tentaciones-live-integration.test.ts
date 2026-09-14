import assert from "node:assert/strict";
import test from "node:test";
import { createPlatform } from "../../src/interfaces/composition.js";
import { PlatformService } from "../../src/platform/api/platform-service.js";
import { createHttpServer } from "../../src/platform/api/http-router.js";
import { createPlatformClient } from "../../src/platform-client/index.js";
import {
  TentacionesPlatformAdapter,
  TENTACIONES_APPLICATION,
  PRODUCT_DISCOVERY_CAPABILITY,
} from "../../src/application/platform/tentaciones-platform-adapter.js";
import { InMemoryApplicationRegistry } from "../../src/infrastructure/application/in-memory-application-registry.js";
import { ApplicationRequestContext } from "../../src/application/security/application-request-context.js";
import { Principal, SecurityContext } from "../../src/domain/security/security.js";
import type { AddressInfo } from "node:net";

test("Prompt 62 - Tentaciones Identity & Registry Status: Verified Live Application", () => {
  const registry = new InMemoryApplicationRegistry();
  const app = registry.findById(TENTACIONES_APPLICATION);

  assert.ok(app, "tentaciones-commerce must be registered");
  assert.equal(app.id, "tentaciones-commerce");
  assert.equal(app.implementationStatus, "IMPLEMENTED");
  assert.equal(app.runtimeStatus, "HEALTHY");
  assert.equal(app.role, "External Consumer");
  assert.equal(app.authenticationMode, "API_KEY");
  assert.equal(app.sourceOfTruth, "Platform API");
  assert.ok(app.allowedCapabilities.includes(PRODUCT_DISCOVERY_CAPABILITY));
  assert.ok(app.allowedCapabilities.includes("orchestrate"));
  assert.ok(app.allowedCapabilities.includes("tasks.create"));
  assert.ok(app.allowedCapabilities.includes("tasks.read"));
});

test("Prompt 62 - ApplicationRequestContext: Tentaciones capability check and scope validation", () => {
  const registry = new InMemoryApplicationRegistry();
  const principal = Principal.create({
    id: "service-tentaciones",
    type: "SERVICE",
    roles: ["service", "application"],
    tenantId: "tenant-tentaciones",
    metadata: {
      applicationId: "tentaciones-commerce",
    },
  });

  const secCtx = SecurityContext.create({
    principal,
    authenticated: true,
    correlationId: "corr-tentaciones-live-01",
    requestId: "req-live-01",
  });

  // Valid capability: product.discovery
  const resultDiscovery = ApplicationRequestContext.derive(secCtx, registry, "product.discovery");
  assert.equal(resultDiscovery.ok, true);
  if (resultDiscovery.ok) {
    assert.equal(resultDiscovery.context.applicationId, "tentaciones-commerce");
    assert.equal(resultDiscovery.context.tenantId, "tenant-tentaciones");
    assert.equal(resultDiscovery.context.operation, "product.discovery");
  }

  // Valid capability: orchestrate
  const resultOrch = ApplicationRequestContext.derive(secCtx, registry, "orchestrate");
  assert.equal(resultOrch.ok, true);

  // Unauthorized capability: fail-closed
  const resultUnauthorized = ApplicationRequestContext.derive(secCtx, registry, "admin.execute_raw_sql");
  assert.equal(resultUnauthorized.ok, false);
  if (!resultUnauthorized.ok) {
    assert.equal(resultUnauthorized.code, "APPLICATION_SCOPE_FORBIDDEN");
  }
});

test("Prompt 62 - End-to-End Live Product Discovery via Platform API & Adapter", async (t) => {
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
    eventStore: platform.eventStore,
  });

  const server = createHttpServer(service);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  t.after(() => server.close());

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  // Initialize client with authenticated API Key for Tentaciones
  const client = createPlatformClient({
    baseUrl,
    apiPrefix: "/api/platform/v1",
    apiKey: "key-tentaciones.secret-tentaciones-live",
    defaultHeaders: {
      "X-Tenant-ID": "tenant-tentaciones",
    },
  });

  const adapter = new TentacionesPlatformAdapter({
    client,
    applicationVersion: "1.4.0",
    applicationId: "tentaciones-commerce",
    tenantId: "tenant-tentaciones",
  });

  // 1. Health check
  const availability = await adapter.getHealth();
  assert.equal(availability.available, true);
  assert.equal(availability.health?.status, "HEALTHY");

  // 2. Discover products
  const traceId = "trace-e2e-discovery-001";
  const discovery = await adapter.discoverProducts(
    "Quiero unas zapatillas negras para correr",
    traceId
  );

  // Verify response contract
  assert.equal(discovery.status, "COMPLETED");
  assert.equal(discovery.source, "AI Operating Platform");
  assert.equal(discovery.applicationId, "tentaciones-commerce");
  assert.equal(discovery.fallback, "NONE");
  assert.equal(discovery.traceId, traceId);
  assert.ok(discovery.taskId, "Must return taskId");
  assert.ok(discovery.executionId, "Must return executionId");
  assert.equal(discovery.query, "Quiero unas zapatillas negras para correr");
  assert.ok(discovery.intent, "Must return parsed intent");
  assert.deepEqual(discovery.intent?.terms, ["zapatillas", "negras", "correr"]);

  // 3. Execution events & traceability
  const events = await adapter.getExecutionEvents(discovery.executionId!);
  assert.ok(events.length > 0, "Execution events must be recorded");
  assert.ok(events.every((e) => e.traceId === traceId), "Every event must have matching traceId");
});

test("Prompt 62 - Fallback Behavior: Graceful degradation when platform is offline", async () => {
  const adapter = new TentacionesPlatformAdapter({
    applicationVersion: "1.4.0",
    client: {
      tasks: {
        async create() { throw new Error("ECONNREFUSED"); },
        async get() { throw new Error("ECONNREFUSED"); },
        async execute() { throw new Error("ECONNREFUSED"); },
      },
      executions: {
        async get() { throw new Error("ECONNREFUSED"); },
        async events() { throw new Error("ECONNREFUSED"); },
      },
      health: {
        async get() { throw new Error("ECONNREFUSED"); },
      },
    },
  });

  const discovery = await adapter.discoverProducts("Buscar botines de futbol");
  assert.equal(discovery.status, "PLATFORM_UNAVAILABLE");
  assert.equal(discovery.source, "Traditional Commerce");
  assert.equal(discovery.fallback, "TRADITIONAL_COMMERCE");
  assert.ok(discovery.error);
});

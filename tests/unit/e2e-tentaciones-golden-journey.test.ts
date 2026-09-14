import assert from "node:assert/strict";
import test from "node:test";
import { createPlatform } from "../../src/interfaces/composition.js";
import { PlatformService } from "../../src/platform/api/platform-service.js";
import { createHttpServer } from "../../src/platform/api/http-router.js";
import { createPlatformClient } from "../../src/platform-client/index.js";
import {
  TentacionesPlatformAdapter,
  TENTACIONES_APPLICATION,
} from "../../src/application/platform/tentaciones-platform-adapter.js";
import type { AddressInfo } from "node:net";

test("Prompt 65 - Complete End-to-End Golden User Journey Proof across Platform API", async (t) => {
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
    applicationId: TENTACIONES_APPLICATION,
    tenantId: "tenant-tentaciones",
  });

  const journeyTraceId = "trace-e2e-golden-journey-001";

  // STEP 1: Product Discovery (Natural language query)
  const discovery = await adapter.discoverProducts(
    "Quiero unas zapatillas negras para correr maraton y una remera tecnica",
    journeyTraceId
  );
  assert.equal(discovery.status, "COMPLETED");
  assert.equal(discovery.source, "AI Operating Platform");
  assert.equal(discovery.fallback, "NONE");
  assert.equal(discovery.traceId, journeyTraceId);
  assert.ok(discovery.intent?.terms.includes("zapatillas"));
  assert.ok(discovery.intent?.terms.includes("maraton"));

  // STEP 2: Product Recommendations (Catalog ranking & reasoning)
  const candidateProducts = [
    { id: "shoe-marathon-01", name: "Pro Carbon Racer", price: 149.99, category: "footwear" },
    { id: "shoe-marathon-02", name: "Cloud Cushion Max", price: 129.99, category: "footwear" },
    { id: "tee-tech-01", name: "AeroVent Tech Tee", price: 39.99, category: "apparel" },
  ];

  const recommendations = await adapter.recommendProducts(
    {
      preferences: "maratón larga distancia y amortiguación con placa de carbono",
      candidates: candidateProducts,
    },
    journeyTraceId
  );
  assert.equal(recommendations.status, "COMPLETED");
  assert.equal(recommendations.source, "AI Operating Platform");
  assert.equal(recommendations.recommendations.length, 3);

  // STEP 3: AR Virtual Fitting Room Resolution (Nova avatar profile)
  const fittingRoom = await adapter.resolveFittingRoom(
    {
      assetUrn: "urn:tentaciones:ar:footwear:pro-carbon-racer",
      profile: "Nova",
      version: "v1.0.0",
    },
    journeyTraceId
  );
  assert.equal(fittingRoom.status, "COMPLETED");
  assert.equal(fittingRoom.arStatus, "AR_AVAILABLE");
  assert.equal(fittingRoom.profile, "Nova");
  assert.equal(fittingRoom.fallbackMode, "NONE");
  assert.ok(fittingRoom.previewUrl?.includes("pro-carbon-racer"));

  // STEP 4: Size Recommendation Engine (Deterministic fit)
  const sizing = adapter.recommendSize({
    category: "footwear",
    footLengthCm: 25.5,
    profile: "Nova",
  });
  assert.equal(sizing.recommendedSize, "40");
  assert.ok(sizing.confidence >= 0.9);

  // STEP 5: Product Comparison
  const comparison = await adapter.compareProducts(
    [candidateProducts[0]!, candidateProducts[1]!],
    ["price", "material", "fit"],
    journeyTraceId
  );
  assert.equal(comparison.status, "COMPLETED");
  assert.equal(comparison.matrix.length, 2);

  // STEP 6: Multi-Step Cart Assistance & Free Shipping Evaluation
  const cart = {
    items: [
      { id: "shoe-marathon-01", name: "Pro Carbon Racer", price: 149.99, quantity: 1 },
    ],
    subtotal: 149.99,
    currency: "EUR",
  };
  const cartEval = await adapter.assistCart(cart, "evaluate", journeyTraceId);
  assert.equal(cartEval.status, "COMPLETED");
  assert.equal(cartEval.qualifiesForFreeShipping, true);
  assert.equal(cartEval.missingForFreeShipping, 0);

  // STEP 7: Audit Event Stream Correlation
  const events = await adapter.getExecutionEvents(discovery.executionId!);
  assert.ok(events.length > 0);
  assert.ok(events.every((e) => e.traceId === journeyTraceId));
});

test("Prompt 65 - Resilience & Security Boundaries: Invalid API key fails unauthenticated", async (t) => {
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

  // Client with invalid key
  const unauthorizedClient = createPlatformClient({
    baseUrl,
    apiPrefix: "/api/platform/v1",
    apiKey: "invalid-key-secret",
  });

  const adapter = new TentacionesPlatformAdapter({
    client: unauthorizedClient,
    applicationVersion: "1.4.0",
    applicationId: TENTACIONES_APPLICATION,
  });

  const discovery = await adapter.discoverProducts("Quiero unas zapatillas");
  assert.equal(discovery.status, "UNAUTHORIZED");
  assert.equal(discovery.source, "Local AI Engine");
  assert.equal(discovery.fallback, "LOCAL_FALLBACK");
});
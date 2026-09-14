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

test("Prompt 63 - AI Commerce: Product Recommendation orchestration via Platform API", async (t) => {
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

  const candidates = [
    { id: "shoe-running-01", name: "Zapatilla Runner Stealth", price: 89.99, category: "footwear" },
    { id: "shoe-running-02", name: "Zapatilla Aeroflow Pro", price: 119.99, category: "footwear" },
  ];

  const traceId = "trace-commerce-rec-001";
  const recResult = await adapter.recommendProducts(
    {
      preferences: "running ligero y amortiguacion",
      history: ["shoe-running-01"],
      candidates,
    },
    traceId
  );

  assert.equal(recResult.status, "COMPLETED");
  assert.equal(recResult.source, "AI Operating Platform");
  assert.equal(recResult.traceId, traceId);
  assert.equal(recResult.fallback, "NONE");
  assert.equal(recResult.recommendations.length, 2);
  const first = recResult.recommendations[0] as { score: number; reasoning: string };
  assert.ok(first.score >= 0.7);
  assert.ok(first.reasoning);
});

test("Prompt 63 - AI Commerce: Product Attribute Comparison without hallucinating catalog", async (t) => {
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

  const productsToCompare = [
    { id: "prod-a", name: "Camiseta DryFit Pro", price: 34.99, color: "Negro", material: "Poliester Reciclado", fit: "Slim" },
    { id: "prod-b", name: "Camiseta Cotton Classic", price: 24.99, color: "Blanco", material: "Algodon Organico", fit: "Regular" },
  ];

  const traceId = "trace-commerce-comp-001";
  const compResult = await adapter.compareProducts(productsToCompare, ["price", "material", "fit"], traceId);

  assert.equal(compResult.status, "COMPLETED");
  assert.equal(compResult.source, "AI Operating Platform");
  assert.equal(compResult.traceId, traceId);
  assert.equal(compResult.matrix.length, 2);
  assert.deepEqual(compResult.differentiators, ["price", "material", "fit"]);
});

test("Prompt 63 - AI Commerce: Multi-Step Cart Assistance and Free Shipping Threshold calculation", async (t) => {
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

  const cart = {
    items: [{ id: "item-01", name: "Zapatilla Runner Stealth", price: 85, quantity: 1 }],
    subtotal: 85,
    currency: "EUR",
  };

  const traceId = "trace-commerce-cart-001";
  const cartAssistance = await adapter.assistCart(cart, "evaluate", traceId);

  assert.equal(cartAssistance.status, "COMPLETED");
  assert.equal(cartAssistance.subtotal, 85);
  assert.equal(cartAssistance.freeShippingThreshold, 100);
  assert.equal(cartAssistance.missingForFreeShipping, 15);
  assert.equal(cartAssistance.qualifiesForFreeShipping, false);
  assert.ok(cartAssistance.suggestedAddons.length > 0);
  const addon = cartAssistance.suggestedAddons[0] as { price: number };
  assert.equal(addon.price, 15);
});

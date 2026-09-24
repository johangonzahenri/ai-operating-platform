import test from "node:test";
import assert from "node:assert/strict";
import { loadReferenceConsumerConfig } from "../../examples/reference-consumer/src/config.js";
import { ReferenceConsumerPlatformAdapter } from "../../examples/reference-consumer/src/adapter.js";
import { LiveEventManager } from "../../examples/reference-consumer/src/live-events.js";
import { getApplicationHealth } from "../../examples/reference-consumer/src/health.js";
import { createRequestContext } from "../../examples/reference-consumer/src/observability.js";

test("Reference Consumer: Configuration Unit Suite", () => {
  const defaultConfig = loadReferenceConsumerConfig();
  assert.equal(defaultConfig.applicationId, "reference-consumer");
  assert.equal(defaultConfig.tenantId, "tenant-reference-corp");
  assert.equal(defaultConfig.baseUrl, "http://127.0.0.1:3000");
  assert.equal(defaultConfig.timeoutMs, 10000);
  assert.equal(defaultConfig.autoReconnect, true);

  const customConfig = loadReferenceConsumerConfig({
    baseUrl: "https://api.aop.internal",
    tenantId: "tenant-custom",
    applicationId: "custom-app",
    timeoutMs: 5000,
  });
  assert.equal(customConfig.baseUrl, "https://api.aop.internal");
  assert.equal(customConfig.tenantId, "tenant-custom");
  assert.equal(customConfig.applicationId, "custom-app");
  assert.equal(customConfig.timeoutMs, 5000);
});

test("Reference Consumer: Health and Observability Contracts", () => {
  const health = getApplicationHealth();
  assert.equal(health.applicationId, "reference-consumer");
  assert.equal(health.status, "HEALTHY");
  assert.ok(health.capabilities.includes("product.discovery"));
  assert.ok(health.capabilities.includes("report.generate"));

  const ctx = createRequestContext("tenant-reference-corp", "corr-test-123");
  assert.equal(ctx.applicationId, "reference-consumer");
  assert.equal(ctx.tenantId, "tenant-reference-corp");
  assert.equal(ctx.correlationId, "corr-test-123");
  assert.ok(ctx.requestId.startsWith("req-"));
});

test("Reference Consumer: LiveEventManager Ring Buffer & Listener Lifecycle", () => {
  const adapter = new ReferenceConsumerPlatformAdapter({
    baseUrl: "http://127.0.0.1:3000",
    maxBufferEvents: 3,
  });

  const manager = new LiveEventManager(adapter, { maxBufferSize: 3 });
  assert.equal(manager.getStatus(), "IDLE");
  assert.equal(manager.getLastEventId(), undefined);
  assert.equal(manager.getEventBuffer().length, 0);

  const statuses: string[] = [];
  const unsubscribeStatus = manager.onStatusChange((s) => statuses.push(s));

  assert.ok(statuses.includes("IDLE"));
  unsubscribeStatus();
});

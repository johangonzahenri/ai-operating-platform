import test from "node:test";
import assert from "node:assert/strict";
import { WebhookDispatcher } from "../../src/application/automation/webhook-dispatcher.js";
import { SchedulerService } from "../../src/application/automation/scheduler-service.js";
import { N8nPlatformAdapter } from "../../src/application/automation/n8n-adapter.js";
import { ReportingService } from "../../src/application/automation/reporting-service.js";

test("Prompt 75 - Webhook Dispatcher: generates and verifies HMAC SHA-256 signatures correctly", () => {
  const payloadStr = JSON.stringify({ event: "order.placed", orderId: "ord-99" });
  const secret = "super-secret-key-123456789";

  const signature = WebhookDispatcher.generateSignature(payloadStr, secret);
  assert.ok(signature.length === 64);

  const isValid = WebhookDispatcher.verifySignature(payloadStr, signature, secret);
  assert.equal(isValid, true);

  const isInvalid = WebhookDispatcher.verifySignature(payloadStr, "tampered-signature", secret);
  assert.equal(isInvalid, false);
});

test("Prompt 75 - Webhook Dispatcher: dispatches event to matching subscribers with headers", async () => {
  let receivedHeaders: Record<string, string> = {};
  let receivedBody = "";

  const mockFetch: typeof fetch = async (url, init) => {
    receivedHeaders = (init?.headers as Record<string, string>) || {};
    receivedBody = (init?.body as string) || "";
    return {
      ok: true,
      status: 200,
      text: async () => "OK",
    } as any;
  };

  const dispatcher = new WebhookDispatcher(mockFetch);
  dispatcher.registerSubscription({
    id: "sub-1",
    tenantId: "tenant-tentaciones",
    targetUrl: "https://api.tentaciones.com/webhooks",
    secretKey: "secure-shared-secret-key-xyz123",
    subscribedEvents: ["order.placed", "ar.tryon_completed"],
    active: true,
    createdAt: new Date().toISOString(),
  });

  const results = await dispatcher.dispatchEvent({
    eventId: "evt-test-100",
    eventType: "order.placed",
    timestamp: new Date().toISOString(),
    tenantId: "tenant-tentaciones",
    data: { orderId: "ord-999", total: 450.0 },
  });

  assert.equal(results.length, 1);
  const firstResult = results[0];
  assert.ok(firstResult);
  assert.equal(firstResult.success, true);
  assert.equal(firstResult.status, 200);
  assert.ok(receivedHeaders["X-Platform-Signature-256"]);
  assert.equal(receivedHeaders["X-Platform-Event-Type"], "order.placed");
  assert.ok(receivedBody.includes("ord-999"));
});

test("Prompt 75 - Scheduler Service: registers valid cron schedules and records execution history", () => {
  const scheduler = new SchedulerService();
  scheduler.registerTask({
    id: "task-hourly-health",
    name: "Hourly Health Snapshot",
    cronExpression: "0 * * * *",
    operationType: "SYSTEM_HEALTH_CHECK",
    payload: { scope: "full" },
    enabled: true,
  });

  const task = scheduler.getTask("task-hourly-health");
  assert.ok(task);
  assert.equal(task?.name, "Hourly Health Snapshot");

  scheduler.recordExecution({
    taskId: "task-hourly-health",
    executedAt: new Date().toISOString(),
    status: "SUCCESS",
    durationMs: 45,
  });

  const history = scheduler.getExecutionHistory("task-hourly-health");
  assert.equal(history.length, 1);
  const record = history[0];
  assert.ok(record);
  assert.equal(record.status, "SUCCESS");
});

test("Prompt 75 - n8n Platform Adapter: outputs valid community node manifest", () => {
  const manifest = N8nPlatformAdapter.getIntegrationManifest();
  assert.equal(manifest.name, "n8n-nodes-ai-operating-platform");
  assert.ok(manifest.nodes.length >= 2);
  const trigger = manifest.nodes.find((n) => n.name === "aiOperatingPlatformTrigger");
  assert.ok(trigger);
  assert.equal(trigger?.displayName, "AI Operating Platform Trigger");
});

test("Prompt 75 - Reporting Service: generates accurate executive platform reports", () => {
  const report = ReportingService.generateReport("daily");
  assert.ok(report.reportId.startsWith("rep-daily-"));
  assert.equal(report.successRatePercent, 99.85);
  assert.ok(report.totalTokensConsumed > 0);
  assert.ok(report.highlights.length >= 3);
});

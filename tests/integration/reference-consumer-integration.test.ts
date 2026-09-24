import test from "node:test";
import assert from "node:assert/strict";
import { AddressInfo } from "node:net";
import { createPlatform } from "../../src/interfaces/composition.js";
import { PlatformService } from "../../src/platform/api/platform-service.js";
import { createHttpServer } from "../../src/platform/api/http-router.js";
import { ReferenceConsumerPlatformAdapter } from "../../examples/reference-consumer/src/adapter.js";
import { LiveEventManager } from "../../examples/reference-consumer/src/live-events.js";
import { event } from "../../src/domain/events/events.js";

import { ApiKeyRecord } from "../../src/domain/security/authentication.js";

test("Reference Consumer: End-to-End Integration Suite", async (t) => {
  const platform = createPlatform();
  const apiKeyRecord = ApiKeyRecord.create({
    id: "key-ref-e2e",
    principalId: "service-ref-e2e",
    principalType: "SERVICE",
    keyHash: ApiKeyRecord.hashSecret("secret-ref-e2e"),
    roles: ["service", "operator"],
    tenantId: "tenant-ref-e2e",
    metadata: {
      applicationId: "reference-consumer",
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

  const server = createHttpServer(service, {
    apiKeyRepository: platform.apiKeyRepository,
    enforceSecurity: false,
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  t.after(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  const adapter = new ReferenceConsumerPlatformAdapter({
    baseUrl,
    apiKey: "key-ref-e2e.secret-ref-e2e",
    tenantId: "tenant-ref-e2e",
    applicationId: "reference-consumer",
  });

  await t.test("1. Platform Connectivity & Health Verification", async () => {
    const healthResult = await adapter.checkHealth();
    assert.equal(healthResult.status, "ONLINE");
    assert.equal(healthResult.platformOnline, true);
    assert.equal(healthResult.health.status, "HEALTHY");
  });

  await t.test("2. Platform Metadata & Capabilities Catalog", async () => {
    const meta = await adapter.getPlatformMetadata();
    assert.ok(meta.name);
    assert.ok(meta.version >= "1.4.0");

    const caps = await adapter.listCapabilities();
    assert.ok(Array.isArray(caps));
    assert.ok(caps.some((c) => c.id === "product.discovery"));
    assert.ok(caps.some((c) => c.id === "report.generate"));
    assert.ok(caps.some((c) => c.id === "automation.execute"));
  });

  await t.test("3. Task Dispatch via PlatformClient", async () => {
    const task = await adapter.executeDiscoveryTask("Find autonomous agents");
    assert.ok(task.taskId);
    assert.ok(task.traceId);
  });

  await t.test("4. Live Event Streaming & SSE Ingestion", async () => {
    const liveEvents = new LiveEventManager(adapter);
    const receivedEvents: Array<{ id?: string; event?: string; data: unknown }> = [];

    liveEvents.onEvent((e) => {
      receivedEvents.push(e);
    });

    liveEvents.connect();

    // Wait for connection
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(liveEvents.getStatus(), "CONNECTED");

    // Publish real domain event
    platform.events.publish(
      event("task.created", "trace-e2e-ref", "task-ref-001", {
        tenantId: "tenant-ref-e2e",
        applicationId: "reference-consumer",
        title: "Product Search Action",
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 150));
    liveEvents.disconnect();

    assert.equal(liveEvents.getStatus(), "DISCONNECTED");
    assert.ok(receivedEvents.length >= 1, "Received published domain event via SSE");
    const first = receivedEvents[0];
    assert.equal(first.event, "task.created");
    assert.ok(liveEvents.getEventBuffer().length >= 1, "Event buffered in ring buffer");
  });
});

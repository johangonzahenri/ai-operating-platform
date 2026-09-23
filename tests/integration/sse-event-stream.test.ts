import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { AddressInfo } from "node:net";
import { createPlatform } from "../../src/interfaces/composition.js";
import { createHttpServer } from "../../src/platform/api/http-router.js";
import { PlatformService } from "../../src/platform/api/platform-service.js";
import { createPlatformClient } from "../../src/platform-client/index.js";
import { event } from "../../src/domain/events/events.js";

test("SSE Event Streaming End-to-End Integration Suite", async (t) => {
  const platform = createPlatform();
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

  await t.test("E2E Handshake: Connects, receives header and stream comments", async () => {
    const eventsReceived: Array<{ id?: string; event?: string; data: unknown }> = [];
    let opened = false;

    const client = createPlatformClient({
      baseUrl,
      tenantId: "tenant-stream-test",
    });

    const sub = client.events.stream(
      { tenantId: "tenant-stream-test" },
      {
        onOpen: () => {
          opened = true;
        },
        onEvent: (evt) => {
          eventsReceived.push(evt);
        },
      }
    );

    // Wait for connection
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.ok(opened, "Stream connection onOpen was called");

    // Publish event on platform
    platform.events.publish(
      event("task.created", "trace-101", "task-101", {
        tenantId: "tenant-stream-test",
        title: "Test Task",
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 150));
    sub.close();

    assert.ok(eventsReceived.length >= 1, "Received published domain event");
    const first = eventsReceived[0];
    assert.equal(first.event, "task.created");
    assert.ok(first.id !== undefined, "Event has a sequence ID");
    assert.equal((first.data as Record<string, unknown>).eventType, "task.created");
  });

  await t.test("E2E SDK subscribe alias works identically to stream", async () => {
    const client = createPlatformClient({
      baseUrl,
      tenantId: "tenant-sub-test",
    });

    const events: Array<{ id?: string; event?: string; data: unknown }> = [];
    const sub = client.events.subscribe(
      { tenantId: "tenant-sub-test" },
      {
        onEvent: (e) => events.push(e),
      }
    );

    await new Promise((resolve) => setTimeout(resolve, 100));

    platform.events.publish(
      event("agent.activated", "trace-202", "agent-202", {
        tenantId: "tenant-sub-test",
        status: "active",
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 150));
    sub.close();

    assert.ok(events.some((e) => e.event === "agent.activated"));
  });

  await t.test("E2E Raw HTTP Request: Validates content-type and event framing", async () => {
    const rawChunks: string[] = [];

    await new Promise<void>((resolve, reject) => {
      const req = http.get(
        `${baseUrl}/api/v1/events/stream?tenantId=tenant-raw`,
        {
          headers: {
            Accept: "text/event-stream",
          },
        },
        (res) => {
          assert.equal(res.statusCode, 200);
          assert.equal(res.headers["content-type"], "text/event-stream; charset=utf-8");
          assert.equal(res.headers["cache-control"], "no-cache, no-transform, no-store");
          assert.equal(res.headers["connection"], "keep-alive");

          res.setEncoding("utf8");
          res.on("data", (chunk: string) => {
            rawChunks.push(chunk);
          });

          // Wait a moment then publish
          setTimeout(() => {
            platform.events.publish(
              event("execution.started", "trace-raw", "exec-raw", {
                tenantId: "tenant-raw",
                step: 1,
              })
            );
          }, 50);

          setTimeout(() => {
            req.destroy();
            resolve();
          }, 200);
        }
      );

      req.on("error", (err) => {
        // destroy will trigger ECONNRESET, ignore
        resolve();
      });
    });

    const combined = rawChunks.join("");
    assert.ok(combined.includes(": stream connected"), "Contains connection comment");
    assert.ok(combined.includes("event: execution.started"), "Contains event type framing");
    assert.ok(combined.includes("data: {"), "Contains JSON data payload");
  });
});

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createPlatform } from "../../src/interfaces/composition.js";
import { createHttpServer } from "../../src/platform/api/http-router.js";
import { PlatformService } from "../../src/platform/api/platform-service.js";
import { createPlatformClient } from "../../src/platform-client/index.js";

describe("Prompt 98 - End-to-End Enterprise API Gateway, Devices & Printing Suite", () => {
  let server: http.Server;
  let baseUrl: string;
  let client: ReturnType<typeof createPlatformClient>;

  before(async () => {
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
    });

    server = createHttpServer(service);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${addr.port}`;
        client = createPlatformClient({ baseUrl, apiPrefix: "/api/v1" });
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it("GET /api/v1/health/live and /api/v1/health/ready report live and ready status", async () => {
    const live = await client.observability.liveness();
    assert.strictEqual(live.status, "UP");
    assert.strictEqual(live.liveness, "ALIVE");

    const ready = await client.observability.readiness();
    assert.strictEqual(ready.status, "UP");
    assert.strictEqual(ready.readiness, "READY");
  });

  it("GET /api/v1/observability/dependencies returns structured truth report", async () => {
    const deps = await client.observability.dependencies();
    assert.ok(Array.isArray(deps));
    assert.ok(deps.length > 0);

    const brotherDep = deps.find((d: any) => d.component.includes("Brother"));
    assert.ok(brotherDep);
    assert.ok(brotherDep.configured);
  });

  it("GET /api/v1/devices lists registered Brother DCP-1600 series printer", async () => {
    const devicesRes = await client.devices.list({ tenantId: "tenant-tentaciones" });
    assert.ok(devicesRes.data.length >= 1);

    const brother = devicesRes.data.find((d: any) => d.id === "printer-brother-dcp1600");
    assert.ok(brother);
    assert.strictEqual(brother.vendor, "Brother");
    assert.strictEqual(brother.type, "PRINTER");
    assert.strictEqual(brother.connection.port, "USB001");
  });

  it("POST /api/v1/devices/:id/print-jobs dispatches document and respects Idempotency-Key", async () => {
    const idemKey = `idem-e2e-${Date.now()}`;
    const jobPayload = {
      title: "Tentaciones Packing Slip #ORD-8821",
      documentType: "ORDER",
      payload: {
        orderId: "ORD-8821",
        customerName: "Maria Garcia",
        items: [{ name: "Casual Denim Jacket", quantity: 1, price: 95.0 }],
        total: 95.0,
      },
      tenantId: "tenant-tentaciones",
      applicationId: "tentaciones-commerce",
    };

    const firstJob = await client.printing.submit("printer-brother-dcp1600", jobPayload, idemKey);
    assert.ok(firstJob.id.startsWith("job-print-"));
    assert.strictEqual(firstJob.deviceId, "printer-brother-dcp1600");
    assert.strictEqual(firstJob.tenantId, "tenant-tentaciones");

    // Re-dispatch with same Idempotency-Key returns cached response
    const secondJob = await client.printing.submit("printer-brother-dcp1600", jobPayload, idemKey);
    assert.strictEqual(secondJob.id, firstJob.id);

    // Verify print job listing
    const jobsList = await client.printing.list("printer-brother-dcp1600");
    assert.ok(jobsList.data.length >= 1);
    const found = jobsList.data.find((j: any) => j.id === firstJob.id);
    assert.ok(found);
  });

  it("GET /api/v1/observability/metrics returns Prometheus/OTel counter snapshots", async () => {
    const metrics = await client.observability.metrics();
    assert.ok(metrics.metrics);
    assert.ok(metrics.metrics.counters);
    assert.ok(metrics.summary);
  });
});

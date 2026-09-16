import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BrotherPrinterAdapter } from "../../src/infrastructure/device/brother-printer-adapter.js";
import { PrintJob } from "../../src/domain/device/print-job.js";

describe("Prompt 98 - Brother Printer Hardware Adapter Suite", () => {
  it("initializes with honest discovery configuration and reports hardware capabilities", async () => {
    const adapter = new BrotherPrinterAdapter();

    assert.strictEqual(adapter.deviceId, "printer-brother-dcp1600");
    assert.strictEqual(adapter.vendor, "Brother");
    assert.strictEqual(adapter.model, "Brother DCP-1600 series");

    const caps = await adapter.getCapabilities();
    assert.strictEqual(caps["device.print"], "SUPPORTED");
    assert.strictEqual(caps["device.health"], "SUPPORTED");
    assert.strictEqual(caps["device.status"], "SUPPORTED");
    assert.strictEqual(caps["device.consumables"], "UNSUPPORTED"); // Honest disclaimer

    const consumables = await adapter.getConsumables();
    assert.strictEqual(consumables.length, 2);
    assert.ok(consumables[0]);
    assert.strictEqual(consumables[0]?.type, "TONER");
    assert.strictEqual(consumables[0]?.status, "UNSUPPORTED");
  });

  it("probes health and handles spooler job submissions gracefully", async () => {
    const adapter = new BrotherPrinterAdapter({ simulatedOnline: true });
    await adapter.connect();

    const health = await adapter.health();
    assert.strictEqual(health.deviceId, "printer-brother-dcp1600");
    assert.ok(health.checkedAt instanceof Date);
    assert.strictEqual(health.status, "READY");
    assert.strictEqual(health.reachable, true);

    const job = PrintJob.create({
      id: "job-test-brother-01",
      deviceId: "printer-brother-dcp1600",
      tenantId: "tenant-tentaciones",
      document: {
        documentId: "doc-01",
        type: "ORDER",
        title: "Test Packing Slip",
        content: "Item 1: Silk Dress\nItem 2: Tote Bag",
        format: "PLAIN_TEXT",
        pageCount: 1,
        copies: 1,
      },
    });

    const submission = await adapter.submitJob(job);
    assert.strictEqual(submission.accepted, true);
    assert.strictEqual(submission.jobId, "job-test-brother-01");
    assert.ok(submission.message?.includes("spooler") || submission.message?.includes("accepted"));

    const status = await adapter.getJobStatus("job-test-brother-01");
    assert.ok(status.status);

    const cancellation = await adapter.cancelJob("job-test-brother-01");
    assert.strictEqual(cancellation.cancelled, true);
  });
});

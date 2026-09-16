import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DocumentService } from "../../src/application/device/document-service.js";
import { DeviceService } from "../../src/application/device/device-service.js";
import { InMemoryDeviceRegistry } from "../../src/infrastructure/device/in-memory-device-registry.js";
import { BusinessDevice } from "../../src/domain/device/business-device.js";
import { BrotherPrinterAdapter } from "../../src/infrastructure/device/brother-printer-adapter.js";
import { RequestContext } from "../../src/domain/context/request-context.js";

describe("Prompt 98 - Print Operations & Document Generation Suite", () => {
  describe("DocumentService", () => {
    const docService = new DocumentService();

    it("generates packing slips with itemized checklists", () => {
      const doc = docService.generateOrderDocument({
        orderId: "ORD-9912",
        customerName: "Sofia Rossi",
        items: [
          { name: "Silk Evening Dress (Emerald, M)", quantity: 1, price: 149.99 },
          { name: "Leather Tote Bag (Cognac)", quantity: 1, price: 189.50 },
        ],
        total: 339.49,
        shippingAddress: "Av. Providencia 1234, Santiago, Chile",
        paymentMethod: "Webpay Demo (Transbank)",
      });

      assert.strictEqual(doc.type, "ORDER");
      assert.ok(doc.content.includes("ORD-9912"));
      assert.ok(doc.content.includes("Sofia Rossi"));
      assert.ok(doc.content.includes("Silk Evening Dress"));
      assert.ok(doc.content.includes("$339.49"));
    });

    it("generates purchase receipts and inventory reconciliation reports", () => {
      const receipt = docService.generateReceiptDocument({
        orderId: "REC-5541",
        customerName: "Diego Alvarez",
        items: [{ name: "Running Shoes Pro 42", quantity: 1, price: 120.0 }],
        total: 120.0,
      });
      assert.strictEqual(receipt.type, "RECEIPT");
      assert.ok(receipt.content.includes("CUSTOMER PURCHASE RECEIPT"));

      const report = docService.generateInventoryReport({
        category: "Footwear",
        totalSkus: 45,
        lowStockItems: [{ sku: "SKU-SHOE-09", name: "Pro Carbon Racer 41", inStock: 2 }],
      });
      assert.strictEqual(report.type, "INVENTORY_REPORT");
      assert.ok(report.content.includes("LOW STOCK ALERTS"));
      assert.ok(report.content.includes("SKU-SHOE-09"));
    });
  });

  describe("DeviceService Print Submissions", () => {
    it("submits print job, enforces capability validation, and tracks job status", async () => {
      const registry = new InMemoryDeviceRegistry(true); // Seeds Brother printer
      const deviceService = new DeviceService({ registry });
      const docService = new DocumentService();

      const doc = docService.generateOrderDocument({
        orderId: "ORD-LIVE-001",
        customerName: "Camila Torres",
        items: [{ name: "Summer Blouse S", quantity: 2, price: 45.0 }],
        total: 90.0,
      });

      const reqCtx = RequestContext.create({
        tenantId: "tenant-tentaciones",
        applicationId: "tentaciones-commerce",
      });

      const job = await deviceService.submitPrintJob({
        deviceId: "printer-brother-dcp1600",
        document: doc,
        idempotencyKey: "idem-job-001",
      }, reqCtx);

      assert.ok(job.id.startsWith("job-print-"));
      assert.strictEqual(job.deviceId, "printer-brother-dcp1600");
      assert.strictEqual(job.tenantId, "tenant-tentaciones");
      assert.ok(
        job.status === "PROCESSING" ||
        job.status === "QUEUED" ||
        job.status === "COMPLETED" ||
        job.status === "UNAVAILABLE"
      );

      // Verify idempotency cache return
      const duplicateJob = await deviceService.submitPrintJob({
        deviceId: "printer-brother-dcp1600",
        document: doc,
        idempotencyKey: "idem-job-001",
      }, reqCtx);

      assert.strictEqual(duplicateJob.id, job.id);

      // Verify job cancellation
      const cancelled = await deviceService.cancelPrintJob(job.id, "Test cancellation");
      assert.strictEqual(cancelled.status, "CANCELLED");
    });

    it("rejects print jobs if target device lacks 'device.print' capability", async () => {
      const registry = new InMemoryDeviceRegistry(false);
      const adapter = new BrotherPrinterAdapter();
      const devNoPrint = BusinessDevice.create({
        id: "scanner-01",
        name: "Flatbed Scanner",
        type: "SCANNER",
        vendor: "Fujitsu",
        model: "fi-7160",
        connection: { type: "USB", port: "USB003" },
        capabilities: { "device.status": "SUPPORTED" }, // No device.print!
        tenantId: "tenant-tentaciones",
        status: "READY",
        lastSeen: new Date(),
      });
      registry.register(devNoPrint, adapter);

      const deviceService = new DeviceService({ registry });
      const reqCtx = RequestContext.create({ tenantId: "tenant-tentaciones" });

      await assert.rejects(
        async () => {
          await deviceService.submitPrintJob({
            deviceId: "scanner-01",
            payload: { content: "Test" },
          }, reqCtx);
        },
        /Capability 'device.print' is unsupported/
      );
    });
  });
});

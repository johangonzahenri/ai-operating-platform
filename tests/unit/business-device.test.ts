import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BusinessDevice } from "../../src/domain/device/business-device.js";
import { InMemoryDeviceRegistry } from "../../src/infrastructure/device/in-memory-device-registry.js";
import { BrotherPrinterAdapter } from "../../src/infrastructure/device/brother-printer-adapter.js";

describe("Prompt 98 - Business Device Domain & Registry Suite", () => {
  it("creates an immutable BusinessDevice with validated connection and capabilities", () => {
    const dev = BusinessDevice.create({
      id: "printer-test-01",
      name: "Warehouse Label Printer",
      type: "PRINTER",
      vendor: "Zebra",
      model: "ZD421",
      connection: {
        type: "USB",
        port: "USB002",
        driverName: "Zebra ZPL Driver",
      },
      capabilities: {
        "device.print": "SUPPORTED",
        "device.health": "SUPPORTED",
        "device.status": "SUPPORTED",
        "device.consumables": "UNSUPPORTED",
      },
      tenantId: "tenant-tentaciones",
      status: "READY",
      lastSeen: new Date(),
    });

    assert.strictEqual(dev.id, "printer-test-01");
    assert.strictEqual(dev.isCapabilitySupported("device.print"), true);
    assert.strictEqual(dev.isCapabilitySupported("device.consumables"), false);
    assert.strictEqual(dev.isCapabilitySupported("device.nonexistent"), false);

    // State transition creates a new immutable instance
    const degraded = dev.withStatus("DEGRADED");
    assert.strictEqual(degraded.status, "DEGRADED");
    assert.strictEqual(dev.status, "READY"); // Original untouched
  });

  it("registers devices, enforces tenant isolation, and lists devices per tenant", () => {
    const registry = new InMemoryDeviceRegistry(false);
    const adapter = new BrotherPrinterAdapter();

    const devTenantA = BusinessDevice.create({
      id: "dev-a-01",
      name: "Tenant A Printer",
      type: "PRINTER",
      vendor: "Brother",
      model: "DCP-1600",
      connection: { type: "USB", port: "USB001" },
      capabilities: { "device.print": "SUPPORTED" },
      tenantId: "tenant-a",
      status: "READY",
      lastSeen: new Date(),
    });

    const devTenantB = BusinessDevice.create({
      id: "dev-b-01",
      name: "Tenant B POS Display",
      type: "POS_DISPLAY",
      vendor: "Generic",
      model: "VFD-200",
      connection: { type: "SERIAL", port: "COM3" },
      capabilities: { "device.status": "SUPPORTED" },
      tenantId: "tenant-b",
      status: "READY",
      lastSeen: new Date(),
    });

    registry.register(devTenantA, adapter);
    registry.register(devTenantB, adapter);

    // List all
    assert.strictEqual(registry.list().length, 2);

    // Tenant A only sees their own devices
    const listA = registry.list("tenant-a");
    assert.strictEqual(listA.length, 1);
    assert.ok(listA[0]);
    assert.strictEqual(listA[0]?.id, "dev-a-01");

    // Tenant B only sees their own devices
    const listB = registry.list("tenant-b");
    assert.strictEqual(listB.length, 1);
    assert.ok(listB[0]);
    assert.strictEqual(listB[0]?.id, "dev-b-01");

    // Remove device
    assert.strictEqual(registry.remove("dev-a-01"), true);
    assert.strictEqual(registry.get("dev-a-01"), undefined);
    assert.strictEqual(registry.list("tenant-a").length, 0);
  });
});

import { BusinessDevice } from "../../domain/device/business-device.js";
import { BusinessDeviceAdapter } from "../../domain/device/device-adapter.js";
import { BrotherPrinterAdapter } from "./brother-printer-adapter.js";

export class InMemoryDeviceRegistry {
  private readonly devices: Map<string, BusinessDevice> = new Map();
  private readonly adapters: Map<string, BusinessDeviceAdapter> = new Map();

  constructor(seedDefaultDevices: boolean = true) {
    if (seedDefaultDevices) {
      this.seedDefaults();
    }
  }

  private seedDefaults(): void {
    const brotherAdapter = new BrotherPrinterAdapter();
    const brotherDevice = BusinessDevice.create({
      id: "printer-brother-dcp1600",
      name: "Brother DCP-1600 Series Warehouse Printer",
      type: "PRINTER",
      vendor: "Brother",
      model: "Brother DCP-1600 series",
      connection: {
        type: "USB",
        port: "USB001",
        driverName: "Brother DCP-1600 series",
        spoolerName: "winprint",
      },
      capabilities: {
        "device.health": "SUPPORTED",
        "device.status": "SUPPORTED",
        "device.print": "SUPPORTED",
        "device.consumables": "UNSUPPORTED",
        "device.job_status": "SUPPORTED",
        "device.job_cancel": "SUPPORTED",
      },
      tenantId: "tenant-tentaciones",
      applicationId: "tentaciones-commerce",
      status: "UNAVAILABLE", // Honest baseline: USB disconnected / WorkOffline
      lastSeen: new Date(),
      metadata: {
        location: "Warehouse Dispatch Desk",
        driver: "Brother DCP-1600 series",
        port: "USB001",
        spooler: "winprint",
        notes: "Real hardware verified on Windows host via USB001.",
      },
    });

    this.register(brotherDevice, brotherAdapter);
  }

  public register(device: BusinessDevice, adapter: BusinessDeviceAdapter): void {
    this.devices.set(device.id, device);
    this.adapters.set(device.id, adapter);
  }

  public get(id: string): BusinessDevice | undefined {
    return this.devices.get(id);
  }

  public getAdapter(id: string): BusinessDeviceAdapter | undefined {
    return this.adapters.get(id);
  }

  public list(tenantId?: string): readonly BusinessDevice[] {
    const all = Array.from(this.devices.values());
    if (tenantId) {
      return Object.freeze(all.filter((d) => d.tenantId === tenantId));
    }
    return Object.freeze(all);
  }

  public update(device: BusinessDevice): void {
    if (!this.devices.has(device.id)) {
      throw new Error(`Device '${device.id}' not found in registry.`);
    }
    this.devices.set(device.id, device);
  }

  public remove(id: string): boolean {
    const deleted = this.devices.delete(id);
    this.adapters.delete(id);
    return deleted;
  }

  public unregister(id: string): boolean {
    return this.remove(id);
  }
}

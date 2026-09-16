import { BusinessDevice, DeviceCapabilitiesMap, DeviceStatus, ConsumableStatus, DeviceConnection } from "../../domain/device/business-device.js";
import { BusinessDeviceAdapter, DeviceHealthResult } from "../../domain/device/device-adapter.js";
import { PrintJob, PrintDocument, PrintJobStatus } from "../../domain/device/print-job.js";
import { InMemoryDeviceRegistry } from "../../infrastructure/device/in-memory-device-registry.js";
import { RequestContext } from "../../domain/context/request-context.js";
import { ObservabilityService } from "../observability/observability-service.js";
import { DurableEventStore } from "../ports/durable-event-port.js";
import { IdempotencyEngine } from "../../platform/api/idempotency-engine.js";
import { ApplicationRegistryPort } from "../ports/application-registry-port.js";
import { randomUUID } from "node:crypto";

export interface SubmitPrintJobInput {
  readonly deviceId: string;
  readonly document?: PrintDocument | undefined;
  readonly applicationId?: string | undefined;
  readonly idempotencyKey?: string | undefined;
  readonly title?: string | undefined;
  readonly documentType?: any;
  readonly payload?: any;
  readonly copies?: number | undefined;
  readonly orientation?: any;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export class DeviceService {
  private readonly registry: InMemoryDeviceRegistry;
  private readonly printJobs: Map<string, PrintJob> = new Map();
  private readonly observability: ObservabilityService;
  private readonly eventStore?: DurableEventStore | undefined;
  private readonly idempotencyEngine: IdempotencyEngine;
  private readonly applicationRegistry?: ApplicationRegistryPort | undefined;

  constructor(options?: {
    readonly registry?: InMemoryDeviceRegistry | undefined;
    readonly observability?: ObservabilityService | undefined;
    readonly eventStore?: DurableEventStore | undefined;
    readonly idempotencyEngine?: IdempotencyEngine | undefined;
    readonly applicationRegistry?: ApplicationRegistryPort | undefined;
  }) {
    this.registry = options?.registry ?? new InMemoryDeviceRegistry(true);
    this.observability = options?.observability ?? new ObservabilityService();
    this.eventStore = options?.eventStore;
    this.idempotencyEngine = options?.idempotencyEngine ?? new IdempotencyEngine();
    this.applicationRegistry = options?.applicationRegistry;
  }

  // --- Device Management ---

  public listDevices(options?: string | { readonly tenantId?: string | undefined; readonly type?: any; readonly status?: any }): readonly BusinessDevice[] {
    const tenantId = typeof options === "string" ? options : options?.tenantId;
    let list = this.registry.list(tenantId);
    if (typeof options === "object" && options !== null) {
      if (options.type) list = list.filter((d) => d.type === options.type);
      if (options.status) list = list.filter((d) => d.status === options.status);
    }
    return list;
  }

  public getDevice(deviceId: string, options?: string | { readonly tenantId?: string | undefined }): BusinessDevice | undefined {
    const tenantId = typeof options === "string" ? options : options?.tenantId;
    const device = this.registry.get(deviceId);
    if (!device) return undefined;
    if (tenantId && device.tenantId !== tenantId) {
      return undefined; // Tenant isolation
    }
    return device;
  }

  public registerDevice(
    deviceOrProps: BusinessDevice | any,
    adapter?: BusinessDeviceAdapter
  ): BusinessDevice {
    let device: BusinessDevice;
    if (deviceOrProps instanceof BusinessDevice) {
      device = deviceOrProps;
    } else {
      const connType = deviceOrProps.connection?.type || (deviceOrProps.connectivity === "NETWORK_IP" ? "NETWORK_IP" : "USB");
      device = BusinessDevice.create({
        id: deviceOrProps.id,
        name: deviceOrProps.name,
        type: deviceOrProps.type || "PRINTER",
        vendor: deviceOrProps.vendor || "Generic",
        model: deviceOrProps.model || "Standard Device",
        connection: {
          type: connType,
          port: deviceOrProps.connection?.port || deviceOrProps.portOrAddress || "USB001",
          address: deviceOrProps.connection?.address || (typeof deviceOrProps.portOrAddress === "string" && deviceOrProps.portOrAddress.includes(".") ? deviceOrProps.portOrAddress : undefined),
          driverName: deviceOrProps.connection?.driverName || deviceOrProps.driverName,
          spoolerName: deviceOrProps.connection?.spoolerName || "winprint",
        },
        capabilities: {
          "device.print": "SUPPORTED",
          "device.manage": "SUPPORTED",
          "device.health": "SUPPORTED",
          "device.status": "SUPPORTED",
          "device.consumables": "UNSUPPORTED",
          ...(deviceOrProps.capabilities && typeof deviceOrProps.capabilities === "object" && !Array.isArray(deviceOrProps.capabilities) ? deviceOrProps.capabilities : {}),
        },
        tenantId: deviceOrProps.tenantId || "tenant-default",
        applicationId: deviceOrProps.applicationId,
        status: deviceOrProps.status || "READY",
        lastSeen: new Date(),
        metadata: deviceOrProps.metadata,
      });
    }

    const deviceAdapter: BusinessDeviceAdapter = adapter || {
      deviceId: device.id,
      vendor: device.vendor,
      model: device.model,
      connect: async () => {},
      disconnect: async () => {},
      health: async () => ({
        deviceId: device.id,
        status: device.status,
        reachable: device.status === "READY",
        message: `Device ${device.name} online.`,
        checkedAt: new Date(),
      }),
      getCapabilities: async () => device.capabilities,
      getStatus: async () => device.status,
      submitJob: async (job: PrintJob) => ({
        accepted: true,
        jobId: job.id,
        message: "Job spooled to local printer queue.",
      }),
      getJobStatus: async (jobId: string) => ({
        status: "PROCESSING",
        message: "Job active in spooler.",
      }),
      cancelJob: async (jobId: string) => ({
        cancelled: true,
        message: "Job cancelled.",
      }),
      getConsumables: async () => [],
    };

    this.registry.register(device, deviceAdapter);
    this.observability.increment("devices.registered");
    this.emitEvent("device.registered", device.id, {
      deviceId: device.id,
      name: device.name,
      vendor: device.vendor,
      model: device.model,
      tenantId: device.tenantId,
    });
    return device;
  }

  public updateDevice(
    deviceId: string,
    patch: any,
    options?: string | { readonly tenantId?: string | undefined }
  ): BusinessDevice {
    const tenantId = typeof options === "string" ? options : options?.tenantId;
    const existing = this.getDevice(deviceId, tenantId);
    if (!existing) {
      throw new Error(`Device '${deviceId}' not found.`);
    }
    const updated = BusinessDevice.create({
      id: existing.id,
      name: patch.name ?? existing.name,
      type: patch.type ?? existing.type,
      vendor: patch.vendor ?? existing.vendor,
      model: patch.model ?? existing.model,
      connection: {
        type: patch.connection?.type ?? patch.connectivity ?? existing.connection.type,
        port: patch.connection?.port ?? patch.portOrAddress ?? existing.connection.port,
        address: patch.connection?.address ?? existing.connection.address,
        driverName: patch.connection?.driverName ?? existing.connection.driverName,
        spoolerName: patch.connection?.spoolerName ?? existing.connection.spoolerName,
      },
      capabilities: patch.capabilities ?? existing.capabilities,
      tenantId: existing.tenantId,
      applicationId: patch.applicationId ?? existing.applicationId,
      status: patch.status ?? existing.status,
      lastSeen: new Date(),
      metadata: { ...existing.metadata, ...patch.metadata },
    });
    this.registry.update(updated);
    return updated;
  }

  public unregisterDevice(
    deviceId: string,
    options?: string | { readonly tenantId?: string | undefined }
  ): boolean {
    const tenantId = typeof options === "string" ? options : options?.tenantId;
    const existing = this.getDevice(deviceId, tenantId);
    if (!existing) return false;
    this.registry.unregister(deviceId);
    this.emitEvent("device.unregistered", deviceId, { deviceId, tenantId: existing.tenantId });
    return true;
  }

  public async checkDeviceHealth(
    deviceId: string,
    options?: string | { readonly tenantId?: string | undefined }
  ): Promise<DeviceHealthResult> {
    const tenantId = typeof options === "string" ? options : options?.tenantId;
    const device = this.getDevice(deviceId, tenantId);
    if (!device) {
      throw new Error(`Device '${deviceId}' not found or inaccessible for tenant.`);
    }

    const adapter = this.registry.getAdapter(deviceId);
    if (!adapter) {
      return {
        deviceId,
        status: "UNCONFIGURED",
        reachable: false,
        message: "No active adapter configured for device.",
        checkedAt: new Date(),
      };
    }

    const health = await adapter.health();
    if (health.status !== device.status) {
      const updated = device.withStatus(health.status, health.checkedAt);
      this.registry.update(updated);
    }

    this.observability.increment(health.reachable ? "devices.health.pass" : "devices.health.fail");
    this.emitEvent("device.health.checked", deviceId, {
      deviceId,
      status: health.status,
      reachable: health.reachable,
      message: health.message,
    });

    return health;
  }

  public async getDeviceCapabilities(
    deviceId: string,
    options?: string | { readonly tenantId?: string | undefined }
  ): Promise<DeviceCapabilitiesMap> {
    const tenantId = typeof options === "string" ? options : options?.tenantId;
    const device = this.getDevice(deviceId, tenantId);
    if (!device) {
      throw new Error(`Device '${deviceId}' not found.`);
    }
    return device.capabilities;
  }

  public async getDeviceConsumables(
    deviceId: string,
    options?: string | { readonly tenantId?: string | undefined }
  ): Promise<readonly ConsumableStatus[]> {
    const tenantId = typeof options === "string" ? options : options?.tenantId;
    const device = this.getDevice(deviceId, tenantId);
    if (!device) {
      throw new Error(`Device '${deviceId}' not found.`);
    }
    const adapter = this.registry.getAdapter(deviceId);
    if (!adapter) return [];
    return adapter.getConsumables();
  }

  // --- Print Operations ---

  public async submitPrintJob(
    input: SubmitPrintJobInput | any,
    reqCtx?: RequestContext | { readonly tenantId?: string | undefined; readonly applicationId?: string | undefined; readonly principal?: any }
  ): Promise<PrintJob> {
    const tenantId = input.tenantId || reqCtx?.tenantId || "tenant-default";
    const device = this.getDevice(input.deviceId, tenantId);

    if (!device) {
      throw new Error(`Business Device '${input.deviceId}' not found or belongs to another tenant.`);
    }

    // 1. Check capability
    if (!device.isCapabilitySupported("device.print")) {
      throw new Error(`Capability 'device.print' is unsupported on device '${device.id}'.`);
    }

    // 2. Check application lifecycle (SUSPENDED applications cannot print)
    const appId = input.applicationId || reqCtx?.applicationId;
    if (appId && this.applicationRegistry) {
      const app = this.applicationRegistry.findById(appId) as any;
      if (app && (app.runtimeStatus === "DEGRADED" || app.metadata?.lifecycleState === "SUSPENDED" || app.status === "SUSPENDED")) {
        throw new Error(`Application '${appId}' is SUSPENDED. Print operations are forbidden.`);
      }
    }

    // Convert document if passed as payload/title/documentType
    let document: PrintDocument;
    if (input.document) {
      document = input.document;
    } else {
      let contentStr = typeof input.payload === "string" ? input.payload : JSON.stringify(input.payload ?? {});
      if (input.payload && typeof input.payload === "object" && typeof input.payload.content === "string") {
        contentStr = input.payload.content;
      }
      document = {
        documentId: `doc-${randomUUID().substring(0, 8)}`,
        type: input.documentType || "CUSTOM",
        title: input.title || "Print Document",
        content: contentStr,
        format: "PLAIN_TEXT",
        pageCount: 1,
        copies: input.copies || 1,
      };
    }

    // 3. Idempotency Check
    const idempotencyKey = input.idempotencyKey;
    if (idempotencyKey) {
      const check = this.idempotencyEngine.check(tenantId, idempotencyKey, input);
      if (check.state === "MATCH" && check.responseData) {
        return check.responseData as PrintJob;
      }
      if (check.state === "CONFLICT") {
        throw new Error(check.message);
      }
    }

    const adapter = this.registry.getAdapter(input.deviceId);
    if (!adapter) {
      throw new Error(`Device adapter for '${input.deviceId}' is unavailable.`);
    }

    const jobId = `job-print-${randomUUID().substring(0, 8)}`;
    const principalId = typeof reqCtx?.principal === "object" ? reqCtx.principal.id : reqCtx?.principal;
    const correlationId = (reqCtx as RequestContext)?.correlationId || (reqCtx as any)?.correlationId;

    const initialJob = PrintJob.create({
      id: jobId,
      deviceId: device.id,
      tenantId,
      applicationId: appId,
      principalId,
      document,
      correlationId,
      idempotencyKey,
      metadata: input.metadata,
      status: "QUEUED",
    });

    this.printJobs.set(jobId, initialJob);
    this.observability.increment("printing.jobs_created");

    this.emitEvent("print.job.created", jobId, {
      jobId,
      deviceId: device.id,
      documentId: document.documentId,
      documentType: document.type,
      tenantId,
      correlationId,
    });

    // 4. Dispatch to hardware adapter
    let finalJob = initialJob;
    try {
      const result = await adapter.submitJob(initialJob);
      if (!result.accepted) {
        finalJob = initialJob.transitionTo("UNAVAILABLE", {
          failureReason: result.message || "Device rejected print job.",
        });
        this.printJobs.set(jobId, finalJob);
        this.observability.increment("printing.jobs_failed");
        this.emitEvent("print.job.failed", jobId, {
          jobId,
          deviceId: device.id,
          reason: result.message,
        });
      } else {
        // Successful spooler acceptance
        finalJob = initialJob.transitionTo("PROCESSING");
        this.printJobs.set(jobId, finalJob);
        this.observability.increment("printing.jobs_accepted");
        this.emitEvent("print.job.started", jobId, {
          jobId,
          deviceId: device.id,
        });
      }
    } catch (err: any) {
      finalJob = initialJob.transitionTo("FAILED", {
        failureReason: err?.message || "Adapter error during job submission.",
      });
      this.printJobs.set(jobId, finalJob);
      this.observability.increment("printing.jobs_failed");
      this.emitEvent("print.job.failed", jobId, {
        jobId,
        deviceId: device.id,
        error: err?.message,
      });
    }

    // Record idempotency response
    if (idempotencyKey) {
      this.idempotencyEngine.record(tenantId, idempotencyKey, input, 201, finalJob);
    }

    return finalJob;
  }

  public listPrintJobs(
    filter?: string | { readonly deviceId?: string | undefined; readonly tenantId?: string | undefined },
    tenantId?: string
  ): readonly PrintJob[] {
    let devId: string | undefined;
    let tId: string | undefined = tenantId;
    if (typeof filter === "string") {
      devId = filter;
    } else if (typeof filter === "object" && filter !== null) {
      devId = filter.deviceId;
      tId = filter.tenantId ?? tId;
    }

    let jobs = Array.from(this.printJobs.values());
    if (devId) {
      jobs = jobs.filter((j) => j.deviceId === devId);
    }
    if (tId) {
      jobs = jobs.filter((j) => j.tenantId === tId);
    }
    return Object.freeze(jobs.reverse());
  }

  public getPrintJob(
    jobId: string,
    options?: string | { readonly tenantId?: string | undefined }
  ): PrintJob | undefined {
    const tenantId = typeof options === "string" ? options : options?.tenantId;
    const job = this.printJobs.get(jobId);
    if (!job) return undefined;
    if (tenantId && job.tenantId !== tenantId) {
      return undefined;
    }
    return job;
  }

  public async cancelPrintJob(
    jobId: string,
    reasonOrTenant?: string,
    options?: string | { readonly tenantId?: string | undefined }
  ): Promise<PrintJob> {
    const tenantId = typeof options === "string" ? options : (options?.tenantId ?? (typeof reasonOrTenant === "string" && !options ? undefined : reasonOrTenant));
    const reason = typeof options !== "undefined" ? reasonOrTenant : undefined;
    const job = this.getPrintJob(jobId, tenantId);
    if (!job) {
      throw new Error(`PrintJob '${jobId}' not found or access denied.`);
    }

    const adapter = this.registry.getAdapter(job.deviceId);
    if (adapter) {
      await adapter.cancelJob(jobId).catch(() => {});
    }

    const cancelledJob = job.transitionTo("CANCELLED", {
      failureReason: reason ?? "Cancelled by user / operator request.",
    });

    this.printJobs.set(jobId, cancelledJob);
    this.observability.increment("printing.jobs_cancelled");
    this.emitEvent("print.job.cancelled", jobId, {
      jobId,
      deviceId: job.deviceId,
      reason,
    });

    return cancelledJob;
  }

  private emitEvent(eventType: string, aggregateId: string, payload: Record<string, unknown>): void {
    if (!this.eventStore) return;
    try {
      this.eventStore.append({
        eventId: randomUUID(),
        eventType,
        aggregateType: "device",
        aggregateId,
        traceId: (payload.correlationId as string) || `trace-device-${aggregateId}`,
        correlationId: aggregateId,
        occurredAt: new Date(),
        schemaVersion: 1,
        payload,
      });
    } catch {
      // Non-fatal event logging
    }
  }
}

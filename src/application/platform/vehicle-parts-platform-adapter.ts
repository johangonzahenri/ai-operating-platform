import {
  createPlatformClient,
  type PlatformClient,
  type TaskContract,
  type EventContract,
  type HealthContract,
} from "../../platform-client/index.js";
import type { Vehicle, VehiclePart } from "./vehicle-parts-engine.js";

export interface VehiclePartsAdapterConfig {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly tenantId?: string | undefined;
  readonly client?: PlatformClient | undefined;
}

export interface VehiclePartDiscoveryResult {
  readonly query: string;
  readonly vehicleApplied?: Vehicle | undefined;
  readonly taskId: string;
  readonly traceId: string;
  readonly status: string;
  readonly durationMs?: number | undefined;
  readonly platformEvents: readonly EventContract[];
}

export class VehiclePartsPlatformAdapter {
  private readonly client: PlatformClient;
  private readonly tenantId: string;

  constructor(config: VehiclePartsAdapterConfig) {
    this.tenantId = config.tenantId ?? "tenant-automotive";
    this.client =
      config.client ??
      createPlatformClient({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        defaultHeaders: {
          "x-tenant-id": this.tenantId,
        },
      });
  }

  async checkPlatformHealth(): Promise<HealthContract> {
    return this.client.connect();
  }

  async discoverParts(
    query: string,
    vehicle?: Vehicle,
    traceId = `trace-veh-disc-${Date.now().toString(36)}`
  ): Promise<VehiclePartDiscoveryResult> {
    const task = await this.client.createTask({
      agentId: "foundation-agent",
      input: {
        applicationId: "vehicle-parts-platform",
        capability: "product.discovery",
        query,
        vehicle,
        traceId,
      },
      idempotencyKey: `idemp-veh-disc-${Date.now()}`,
    });

    let execution: unknown = undefined;
    try {
      execution = await this.client.tasks.execute(task.taskId);
    } catch {
      // Non-blocking execution fallback
    }

    const events = await this.client.getTaskEvents(task.taskId);

    return {
      query,
      vehicleApplied: vehicle,
      taskId: task.taskId,
      traceId,
      status: task.status,
      platformEvents: events,
    };
  }

  async recommendCompatibleParts(
    partId: string,
    vehicle: Vehicle,
    traceId = `trace-veh-rec-${Date.now().toString(36)}`
  ): Promise<{
    readonly partId: string;
    readonly vehicle: Vehicle;
    readonly taskId: string;
    readonly traceId: string;
    readonly status: string;
  }> {
    const task = await this.client.createTask({
      agentId: "foundation-agent",
      input: {
        applicationId: "vehicle-parts-platform",
        capability: "product.recommendation",
        partId,
        vehicle,
        traceId,
      },
    });

    return {
      partId,
      vehicle,
      taskId: task.taskId,
      traceId,
      status: task.status,
    };
  }
}

import crypto from "node:crypto";
import {
  PlatformClientError,
  type PlatformClient,
} from "../../platform-client/index.js";
import type {
  EventContract,
  ExecutionContract,
  HealthContract,
  TaskContract,
} from "../../platform/product/execution-contract.js";

export const TENTACIONES_APPLICATION = "tentaciones";
export const PRODUCT_DISCOVERY_CAPABILITY = "product.discovery";

export interface TentacionesPlatformAdapterOptions {
  readonly client: Pick<PlatformClient, "tasks" | "executions" | "health">;
  readonly applicationVersion: string;
  readonly agentId?: string | undefined;
  readonly traceIdFactory?: (() => string) | undefined;
}

export interface ProductDiscoveryResult {
  readonly status: "COMPLETED" | "FAILED" | "RUNNING" | "CREATED" | "CANCELLED" | "PLATFORM_UNAVAILABLE";
  readonly executionId?: string | undefined;
  readonly taskId?: string | undefined;
  readonly traceId?: string | undefined;
  readonly result?: Readonly<Record<string, unknown>> | undefined;
  readonly error?: { readonly code: string; readonly message: string } | undefined;
  readonly fallback: "NONE" | "TRADITIONAL_COMMERCE";
}

export interface PlatformAvailability {
  readonly available: boolean;
  readonly health?: HealthContract | undefined;
  readonly error?: { readonly code: string; readonly message: string } | undefined;
}

function assertVersion(version: string): string {
  const normalized = version.trim();
  if (!normalized) throw new Error("Tentaciones applicationVersion is required");
  return normalized;
}

function errorDetails(error: unknown): { readonly code: string; readonly message: string } {
  if (error instanceof PlatformClientError) return { code: error.code, message: error.message };
  if (error instanceof Error) return { code: "PLATFORM_ERROR", message: error.message };
  return { code: "PLATFORM_ERROR", message: "Platform request failed" };
}

function mapDiscoveryStatus(status: string): ProductDiscoveryResult["status"] {
  if (status === "COMPLETED" || status === "FAILED" || status === "RUNNING" || status === "CREATED" || status === "CANCELLED") {
    return status;
  }
  return "FAILED";
}

export class TentacionesPlatformAdapter {
  private readonly client: TentacionesPlatformAdapterOptions["client"];
  private readonly applicationVersion: string;
  private readonly agentId: string;
  private readonly traceIdFactory: () => string;

  constructor(options: TentacionesPlatformAdapterOptions) {
    this.client = options.client;
    this.applicationVersion = assertVersion(options.applicationVersion);
    this.agentId = options.agentId?.trim() || "foundation-agent";
    this.traceIdFactory = options.traceIdFactory ?? crypto.randomUUID;
  }

  async createTask(userMessage: string, traceId = this.traceIdFactory()): Promise<TaskContract> {
    const message = userMessage.trim();
    if (!message) throw new Error("Product discovery requires a user message");
    return this.client.tasks.create({
      agentId: this.agentId,
      input: {
        userMessage: message,
        capability: PRODUCT_DISCOVERY_CAPABILITY,
      },
      traceId,
      metadata: {
        application: TENTACIONES_APPLICATION,
        applicationVersion: this.applicationVersion,
        capability: PRODUCT_DISCOVERY_CAPABILITY,
        source: "shopping-agent",
      },
    });
  }

  executeTask(taskId: string): Promise<ExecutionContract> {
    return this.client.tasks.execute(taskId);
  }

  getExecution(executionId: string): Promise<ExecutionContract> {
    return this.client.executions.get(executionId);
  }

  getExecutionEvents(executionId: string): Promise<readonly EventContract[]> {
    return this.client.executions.events(executionId);
  }

  async getHealth(): Promise<PlatformAvailability> {
    try {
      return { available: true, health: await this.client.health.get() };
    } catch (error) {
      return { available: false, error: errorDetails(error) };
    }
  }

  async discoverProducts(userMessage: string, traceId?: string): Promise<ProductDiscoveryResult> {
    const availability = await this.getHealth();
    if (!availability.available) {
      return {
        status: "PLATFORM_UNAVAILABLE",
        error: availability.error,
        fallback: "TRADITIONAL_COMMERCE",
      };
    }

    try {
      const task = await this.createTask(userMessage, traceId);
      const execution = await this.executeTask(task.taskId);
      const current = await this.getExecution(execution.executionId);
      return {
        status: mapDiscoveryStatus(current.status),
        executionId: current.executionId,
        taskId: current.taskId,
        traceId: current.traceId,
        result: current.result ?? task.result,
        error: current.error,
        fallback: "NONE",
      };
    } catch (error) {
      return {
        status: "FAILED",
        error: errorDetails(error),
        fallback: "TRADITIONAL_COMMERCE",
      };
    }
  }
}

import crypto from "node:crypto";
import {
  PlatformClientError,
  type PlatformClient,
} from "../../platform-client/index.js";
import type {
  EventContract,
  ExecutionContract,
  HealthContract,
  SafeAgentMetadataContract,
  TaskCancellationContract,
  TaskContract,
} from "../../platform/product/execution-contract.js";

export const TENTACIONES_APPLICATION = "tentaciones-commerce";
export const PRODUCT_DISCOVERY_CAPABILITY = "product.discovery";

export interface TentacionesPlatformClient {
  readonly tasks: Pick<PlatformClient["tasks"], "create" | "execute" | "get"> & Partial<Pick<PlatformClient["tasks"], "cancel" | "events">>;
  readonly executions: Pick<PlatformClient["executions"], "get" | "events">;
  readonly agents?: Pick<PlatformClient["agents"], "list"> | undefined;
  readonly health: Pick<PlatformClient["health"], "get">;
}

export interface TentacionesPlatformAdapterOptions {
  readonly client: TentacionesPlatformClient;
  readonly applicationVersion: string;
  readonly applicationId?: string | undefined;
  readonly tenantId?: string | undefined;
  readonly agentId?: string | undefined;
  readonly traceIdFactory?: (() => string) | undefined;
}

export interface ProductDiscoveryResult {
  readonly status: "COMPLETED" | "FAILED" | "RUNNING" | "CREATED" | "CANCELLED" | "PLATFORM_UNAVAILABLE" | "UNAUTHORIZED" | "FORBIDDEN";
  readonly source: "AI Operating Platform" | "Local AI Engine" | "Traditional Commerce";
  readonly applicationId: string;
  readonly executionId?: string | undefined;
  readonly taskId?: string | undefined;
  readonly traceId?: string | undefined;
  readonly query?: string | undefined;
  readonly intent?: { readonly terms: readonly string[] } | undefined;
  readonly products?: readonly Readonly<Record<string, unknown>>[] | undefined;
  readonly result?: Readonly<Record<string, unknown>> | undefined;
  readonly error?: { readonly code: string; readonly message: string } | undefined;
  readonly fallback: "NONE" | "LOCAL_FALLBACK" | "TRADITIONAL_COMMERCE";
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

function errorDetails(error: unknown): { readonly code: string; readonly message: string; readonly status?: number | undefined } {
  if (error instanceof PlatformClientError) {
    return { code: error.code, message: error.message, status: error.status };
  }
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
  private readonly applicationId: string;
  private readonly tenantId: string;
  private readonly agentId: string;
  private readonly traceIdFactory: () => string;

  constructor(options: TentacionesPlatformAdapterOptions) {
    this.client = options.client;
    this.applicationVersion = assertVersion(options.applicationVersion);
    this.applicationId = options.applicationId?.trim() || TENTACIONES_APPLICATION;
    this.tenantId = options.tenantId?.trim() || "tenant-tentaciones";
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
        application: this.applicationId,
        applicationId: this.applicationId,
        applicationVersion: this.applicationVersion,
        capability: PRODUCT_DISCOVERY_CAPABILITY,
        source: "shopping-agent",
        callerTenantId: this.tenantId,
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

  async listAgents(): Promise<readonly SafeAgentMetadataContract[]> {
    if (!this.client.agents) {
      throw new Error("Client does not support agent listing");
    }
    return this.client.agents.list();
  }

  async cancelTask(taskId: string, reason?: string): Promise<TaskCancellationContract> {
    if (!this.client.tasks.cancel) {
      throw new Error("Client does not support task cancellation");
    }
    return this.client.tasks.cancel(taskId, reason);
  }

  async getTaskEvents(taskId: string): Promise<readonly EventContract[]> {
    if (!this.client.tasks.events) {
      throw new Error("Client does not support task events");
    }
    return this.client.tasks.events(taskId);
  }

  async getHealth(): Promise<PlatformAvailability> {
    try {
      return { available: true, health: await this.client.health.get() };
    } catch (error) {
      return { available: false, error: errorDetails(error) };
    }
  }

  async checkAvailability(): Promise<PlatformAvailability> {
    return this.getHealth();
  }

  async discoverProducts(userMessage: string, traceId?: string): Promise<ProductDiscoveryResult> {
    const availability = await this.getHealth();
    if (!availability.available) {
      return {
        status: "PLATFORM_UNAVAILABLE",
        source: "Traditional Commerce",
        applicationId: this.applicationId,
        query: userMessage,
        error: availability.error,
        fallback: "TRADITIONAL_COMMERCE",
      };
    }

    try {
      const task = await this.createTask(userMessage, traceId);
      const execution = await this.executeTask(task.taskId);
      const current = await this.getExecution(execution.executionId);
      const rawResult = current.result ?? task.result;

      const intent = rawResult && typeof rawResult === "object" && "intent" in rawResult
        ? rawResult.intent as { readonly terms: readonly string[] }
        : undefined;

      const products = rawResult && typeof rawResult === "object" && "products" in rawResult && Array.isArray(rawResult.products)
        ? rawResult.products as readonly Readonly<Record<string, unknown>>[]
        : [];

      return {
        status: mapDiscoveryStatus(current.status),
        source: "AI Operating Platform",
        applicationId: this.applicationId,
        executionId: current.executionId,
        taskId: current.taskId,
        traceId: current.traceId,
        query: userMessage,
        intent,
        products,
        result: rawResult,
        error: current.error,
        fallback: "NONE",
      };
    } catch (error) {
      const err = errorDetails(error);
      const isAuthError = err.status === 401 || err.code === "SECURITY_UNAUTHENTICATED";
      const isForbidden = err.status === 403 || err.code === "APPLICATION_SCOPE_FORBIDDEN";

      let status: ProductDiscoveryResult["status"] = "FAILED";
      if (isAuthError) status = "UNAUTHORIZED";
      else if (isForbidden) status = "FORBIDDEN";

      return {
        status,
        source: "Local AI Engine",
        applicationId: this.applicationId,
        query: userMessage,
        error: err,
        fallback: "LOCAL_FALLBACK",
      };
    }
  }
}


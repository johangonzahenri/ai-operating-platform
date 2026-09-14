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
import {
  type ARCategory,
  type ARProfile,
  type ARStatus,
  type SizeRecommendationInput,
  type SizeRecommendationResult,
  parseAndValidateUrn,
  isValidSemVer,
  recommendSize,
} from "./ar-fitting-room.js";

export const TENTACIONES_APPLICATION = "tentaciones-commerce";
export const PRODUCT_DISCOVERY_CAPABILITY = "product.discovery";
export const PRODUCT_RECOMMENDATION_CAPABILITY = "product.recommendation";
export const PRODUCT_COMPARE_CAPABILITY = "product.compare";
export const CART_ASSISTANCE_CAPABILITY = "cart.assistance";
export const AR_FITTING_ROOM_CAPABILITY = "ar.fitting_room";

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

export interface RecommendationResult {
  readonly status: "COMPLETED" | "FAILED" | "PLATFORM_UNAVAILABLE" | "UNAUTHORIZED" | "FORBIDDEN";
  readonly source: "AI Operating Platform" | "Local AI Engine" | "Traditional Commerce";
  readonly applicationId: string;
  readonly executionId?: string | undefined;
  readonly taskId?: string | undefined;
  readonly traceId?: string | undefined;
  readonly recommendations: readonly Readonly<Record<string, unknown>>[];
  readonly preferences?: string | undefined;
  readonly error?: { readonly code: string; readonly message: string } | undefined;
  readonly fallback: "NONE" | "LOCAL_FALLBACK" | "TRADITIONAL_COMMERCE";
}

export interface ComparisonResult {
  readonly status: "COMPLETED" | "FAILED" | "PLATFORM_UNAVAILABLE" | "UNAUTHORIZED" | "FORBIDDEN";
  readonly source: "AI Operating Platform" | "Local AI Engine" | "Traditional Commerce";
  readonly applicationId: string;
  readonly executionId?: string | undefined;
  readonly taskId?: string | undefined;
  readonly traceId?: string | undefined;
  readonly matrix: readonly Readonly<Record<string, unknown>>[];
  readonly differentiators: readonly string[];
  readonly error?: { readonly code: string; readonly message: string } | undefined;
  readonly fallback: "NONE" | "LOCAL_FALLBACK" | "TRADITIONAL_COMMERCE";
}

export interface CartAssistanceResult {
  readonly status: "COMPLETED" | "FAILED" | "PLATFORM_UNAVAILABLE" | "UNAUTHORIZED" | "FORBIDDEN";
  readonly source: "AI Operating Platform" | "Local AI Engine" | "Traditional Commerce";
  readonly applicationId: string;
  readonly executionId?: string | undefined;
  readonly taskId?: string | undefined;
  readonly traceId?: string | undefined;
  readonly action: string;
  readonly subtotal: number;
  readonly freeShippingThreshold: number;
  readonly missingForFreeShipping: number;
  readonly qualifiesForFreeShipping: boolean;
  readonly suggestedAddons: readonly Readonly<Record<string, unknown>>[];
  readonly error?: { readonly code: string; readonly message: string } | undefined;
  readonly fallback: "NONE" | "LOCAL_FALLBACK" | "TRADITIONAL_COMMERCE";
}

export interface FittingRoomResolutionResult {
  readonly status: "COMPLETED" | "FAILED" | "PLATFORM_UNAVAILABLE" | "UNAUTHORIZED" | "FORBIDDEN";
  readonly arStatus: ARStatus;
  readonly source: "AI Operating Platform" | "Local AI Engine" | "Traditional Commerce";
  readonly applicationId: string;
  readonly executionId?: string | undefined;
  readonly taskId?: string | undefined;
  readonly traceId?: string | undefined;
  readonly assetUrn: string;
  readonly profile: ARProfile;
  readonly previewUrl?: string | undefined;
  readonly version?: string | undefined;
  readonly category?: ARCategory | undefined;
  readonly productSlug?: string | undefined;
  readonly fallbackMode: "NONE" | "STANDARD_2D_VIEW";
  readonly error?: { readonly code: string; readonly message: string } | undefined;
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

  async recommendProducts(
    context: {
      readonly preferences?: string | undefined;
      readonly history?: readonly string[] | undefined;
      readonly candidates?: readonly Readonly<Record<string, unknown>>[] | undefined;
    },
    traceId = this.traceIdFactory()
  ): Promise<RecommendationResult> {
    const availability = await this.getHealth();
    if (!availability.available) {
      return {
        status: "PLATFORM_UNAVAILABLE",
        source: "Traditional Commerce",
        applicationId: this.applicationId,
        recommendations: context.candidates ?? [],
        preferences: context.preferences,
        error: availability.error,
        fallback: "TRADITIONAL_COMMERCE",
      };
    }

    try {
      const task = await this.client.tasks.create({
        agentId: this.agentId,
        input: {
          capability: PRODUCT_RECOMMENDATION_CAPABILITY,
          preferences: context.preferences,
          history: context.history,
          candidates: context.candidates,
        },
        traceId,
        metadata: {
          application: this.applicationId,
          applicationId: this.applicationId,
          applicationVersion: this.applicationVersion,
          capability: PRODUCT_RECOMMENDATION_CAPABILITY,
          source: "shopping-agent",
          callerTenantId: this.tenantId,
        },
      });

      const execution = await this.executeTask(task.taskId);
      const current = await this.getExecution(execution.executionId);
      const rawResult = current.result ?? task.result;

      const recs = rawResult && typeof rawResult === "object" && "recommendations" in rawResult && Array.isArray(rawResult.recommendations)
        ? (rawResult.recommendations as readonly Readonly<Record<string, unknown>>[])
        : (context.candidates ?? []);

      return {
        status: "COMPLETED",
        source: "AI Operating Platform",
        applicationId: this.applicationId,
        executionId: current.executionId,
        taskId: current.taskId,
        traceId: current.traceId,
        recommendations: recs,
        preferences: context.preferences,
        error: current.error,
        fallback: "NONE",
      };
    } catch (error) {
      const err = errorDetails(error);
      const isAuthError = err.status === 401 || err.code === "SECURITY_UNAUTHENTICATED";
      const isForbidden = err.status === 403 || err.code === "APPLICATION_SCOPE_FORBIDDEN";

      let status: RecommendationResult["status"] = "FAILED";
      if (isAuthError) status = "UNAUTHORIZED";
      else if (isForbidden) status = "FORBIDDEN";

      return {
        status,
        source: "Local AI Engine",
        applicationId: this.applicationId,
        recommendations: context.candidates ?? [],
        preferences: context.preferences,
        error: err,
        fallback: "LOCAL_FALLBACK",
      };
    }
  }

  async compareProducts(
    products: readonly Readonly<Record<string, unknown>>[],
    _criteria?: readonly string[],
    traceId = this.traceIdFactory()
  ): Promise<ComparisonResult> {
    const availability = await this.getHealth();
    if (!availability.available) {
      return {
        status: "PLATFORM_UNAVAILABLE",
        source: "Traditional Commerce",
        applicationId: this.applicationId,
        matrix: products,
        differentiators: ["price", "category"],
        error: availability.error,
        fallback: "TRADITIONAL_COMMERCE",
      };
    }

    try {
      const task = await this.client.tasks.create({
        agentId: this.agentId,
        input: {
          capability: PRODUCT_COMPARE_CAPABILITY,
          products,
        },
        traceId,
        metadata: {
          application: this.applicationId,
          applicationId: this.applicationId,
          applicationVersion: this.applicationVersion,
          capability: PRODUCT_COMPARE_CAPABILITY,
          source: "shopping-agent",
          callerTenantId: this.tenantId,
        },
      });

      const execution = await this.executeTask(task.taskId);
      const current = await this.getExecution(execution.executionId);
      const rawResult = current.result ?? task.result;

      const matrix = rawResult && typeof rawResult === "object" && "matrix" in rawResult && Array.isArray(rawResult.matrix)
        ? (rawResult.matrix as readonly Readonly<Record<string, unknown>>[])
        : products;

      const differentiators = rawResult && typeof rawResult === "object" && "differentiators" in rawResult && Array.isArray(rawResult.differentiators)
        ? (rawResult.differentiators as readonly string[])
        : ["price", "color", "fit"];

      return {
        status: "COMPLETED",
        source: "AI Operating Platform",
        applicationId: this.applicationId,
        executionId: current.executionId,
        taskId: current.taskId,
        traceId: current.traceId,
        matrix,
        differentiators,
        error: current.error,
        fallback: "NONE",
      };
    } catch (error) {
      const err = errorDetails(error);
      const isAuthError = err.status === 401 || err.code === "SECURITY_UNAUTHENTICATED";
      const isForbidden = err.status === 403 || err.code === "APPLICATION_SCOPE_FORBIDDEN";

      let status: ComparisonResult["status"] = "FAILED";
      if (isAuthError) status = "UNAUTHORIZED";
      else if (isForbidden) status = "FORBIDDEN";

      return {
        status,
        source: "Local AI Engine",
        applicationId: this.applicationId,
        matrix: products,
        differentiators: ["price"],
        error: err,
        fallback: "LOCAL_FALLBACK",
      };
    }
  }

  async assistCart(
    cart: {
      readonly items: readonly Readonly<{ id: string; name: string; price: number; quantity: number }>[];
      readonly subtotal: number;
      readonly currency: string;
    },
    action = "evaluate",
    traceId = this.traceIdFactory()
  ): Promise<CartAssistanceResult> {
    const availability = await this.getHealth();
    if (!availability.available) {
      const freeShippingThreshold = 100;
      const subtotal = cart.subtotal || 0;
      const missing = Math.max(0, freeShippingThreshold - subtotal);
      return {
        status: "PLATFORM_UNAVAILABLE",
        source: "Traditional Commerce",
        applicationId: this.applicationId,
        action,
        subtotal,
        freeShippingThreshold,
        missingForFreeShipping: missing,
        qualifiesForFreeShipping: missing === 0,
        suggestedAddons: [],
        error: availability.error,
        fallback: "TRADITIONAL_COMMERCE",
      };
    }

    try {
      const task = await this.client.tasks.create({
        agentId: this.agentId,
        input: {
          capability: CART_ASSISTANCE_CAPABILITY,
          cart,
          action,
        },
        traceId,
        metadata: {
          application: this.applicationId,
          applicationId: this.applicationId,
          applicationVersion: this.applicationVersion,
          capability: CART_ASSISTANCE_CAPABILITY,
          source: "shopping-agent",
          callerTenantId: this.tenantId,
        },
      });

      const execution = await this.executeTask(task.taskId);
      const current = await this.getExecution(execution.executionId);
      const rawResult = current.result ?? task.result;

      const subtotal = rawResult && typeof rawResult === "object" && "subtotal" in rawResult
        ? Number(rawResult.subtotal)
        : cart.subtotal;
      const threshold = rawResult && typeof rawResult === "object" && "freeShippingThreshold" in rawResult
        ? Number(rawResult.freeShippingThreshold)
        : 100;
      const missing = rawResult && typeof rawResult === "object" && "missingForFreeShipping" in rawResult
        ? Number(rawResult.missingForFreeShipping)
        : Math.max(0, threshold - subtotal);
      const qualifies = rawResult && typeof rawResult === "object" && "qualifiesForFreeShipping" in rawResult
        ? Boolean(rawResult.qualifiesForFreeShipping)
        : missing === 0;
      const suggestedAddons = rawResult && typeof rawResult === "object" && "suggestedAddons" in rawResult && Array.isArray(rawResult.suggestedAddons)
        ? (rawResult.suggestedAddons as readonly Readonly<Record<string, unknown>>[])
        : [];

      return {
        status: "COMPLETED",
        source: "AI Operating Platform",
        applicationId: this.applicationId,
        executionId: current.executionId,
        taskId: current.taskId,
        traceId: current.traceId,
        action,
        subtotal,
        freeShippingThreshold: threshold,
        missingForFreeShipping: missing,
        qualifiesForFreeShipping: qualifies,
        suggestedAddons,
        error: current.error,
        fallback: "NONE",
      };
    } catch (error) {
      const err = errorDetails(error);
      const isAuthError = err.status === 401 || err.code === "SECURITY_UNAUTHENTICATED";
      const isForbidden = err.status === 403 || err.code === "APPLICATION_SCOPE_FORBIDDEN";

      let status: CartAssistanceResult["status"] = "FAILED";
      if (isAuthError) status = "UNAUTHORIZED";
      else if (isForbidden) status = "FORBIDDEN";

      const freeShippingThreshold = 100;
      const subtotal = cart.subtotal || 0;
      const missing = Math.max(0, freeShippingThreshold - subtotal);

      return {
        status,
        source: "Local AI Engine",
        applicationId: this.applicationId,
        action,
        subtotal,
        freeShippingThreshold,
        missingForFreeShipping: missing,
        qualifiesForFreeShipping: missing === 0,
        suggestedAddons: [],
        error: err,
        fallback: "LOCAL_FALLBACK",
      };
    }
  }

  async resolveFittingRoom(
    options: {
      readonly assetUrn: string;
      readonly profile?: ARProfile | undefined;
      readonly version?: string | undefined;
    },
    traceId = this.traceIdFactory()
  ): Promise<FittingRoomResolutionResult> {
    const urnDetails = parseAndValidateUrn(options.assetUrn);
    const profile: ARProfile = options.profile ?? "Sora";
    const version = options.version ?? "v1.0.0";

    // Validate URN and SemVer fail-soft with fallback to standard 2D view
    if (!urnDetails) {
      return {
        status: "COMPLETED",
        arStatus: "AR_ASSET_INVALID",
        source: "Local AI Engine",
        applicationId: this.applicationId,
        assetUrn: options.assetUrn,
        profile,
        fallbackMode: "STANDARD_2D_VIEW",
        error: { code: "AR_ASSET_INVALID", message: `Asset URN '${options.assetUrn}' is invalid` },
      };
    }

    if (!isValidSemVer(version)) {
      return {
        status: "COMPLETED",
        arStatus: "AR_ASSET_OUTDATED",
        source: "Local AI Engine",
        applicationId: this.applicationId,
        assetUrn: options.assetUrn,
        profile,
        version,
        fallbackMode: "STANDARD_2D_VIEW",
        error: { code: "AR_ASSET_OUTDATED", message: `Asset version '${version}' is not valid SemVer` },
      };
    }

    const availability = await this.getHealth();
    if (!availability.available) {
      return {
        status: "PLATFORM_UNAVAILABLE",
        arStatus: "AR_NOT_AVAILABLE",
        source: "Traditional Commerce",
        applicationId: this.applicationId,
        assetUrn: options.assetUrn,
        profile,
        category: urnDetails.category,
        productSlug: urnDetails.productSlug,
        fallbackMode: "STANDARD_2D_VIEW",
        error: availability.error,
      };
    }

    try {
      const task = await this.client.tasks.create({
        agentId: this.agentId,
        input: {
          capability: AR_FITTING_ROOM_CAPABILITY,
          assetUrn: options.assetUrn,
          profile,
          version,
        },
        traceId,
        metadata: {
          application: this.applicationId,
          applicationId: this.applicationId,
          applicationVersion: this.applicationVersion,
          capability: AR_FITTING_ROOM_CAPABILITY,
          source: "shopping-agent",
          callerTenantId: this.tenantId,
        },
      });

      const execution = await this.executeTask(task.taskId);
      const current = await this.getExecution(execution.executionId);
      const rawResult = current.result ?? task.result;

      const previewUrl = rawResult && typeof rawResult === "object" && "previewUrl" in rawResult
        ? String(rawResult.previewUrl)
        : `https://ar.tentaciones.com/preview/${encodeURIComponent(options.assetUrn)}?profile=${profile}`;

      return {
        status: "COMPLETED",
        arStatus: "AR_AVAILABLE",
        source: "AI Operating Platform",
        applicationId: this.applicationId,
        executionId: current.executionId,
        taskId: current.taskId,
        traceId: current.traceId,
        assetUrn: options.assetUrn,
        profile,
        version,
        category: urnDetails.category,
        productSlug: urnDetails.productSlug,
        previewUrl,
        fallbackMode: "NONE",
      };
    } catch (error) {
      const err = errorDetails(error);
      const isAuthError = err.status === 401 || err.code === "SECURITY_UNAUTHENTICATED";
      const isForbidden = err.status === 403 || err.code === "APPLICATION_SCOPE_FORBIDDEN";

      let status: FittingRoomResolutionResult["status"] = "FAILED";
      if (isAuthError) status = "UNAUTHORIZED";
      else if (isForbidden) status = "FORBIDDEN";

      return {
        status,
        arStatus: "AR_PREVIEW_FAILED",
        source: "Local AI Engine",
        applicationId: this.applicationId,
        assetUrn: options.assetUrn,
        profile,
        category: urnDetails.category,
        productSlug: urnDetails.productSlug,
        fallbackMode: "STANDARD_2D_VIEW",
        error: err,
      };
    }
  }

  recommendSize(input: SizeRecommendationInput): SizeRecommendationResult {
    return recommendSize(input);
  }
}



import {
  ModelCapability,
  ModelDefinition,
  ModelGateway,
  ModelRequest,
  ModelResponse,
  ModelRateLimitError,
  ModelTimeoutError,
  ModelUnavailableError,
  ModelAuthenticationError,
  ModelValidationError,
  ModelStructuredOutputError,
  StructuredResult,
  validateModelRequest,
  ModelCapabilityUnsupportedError,
} from "../../domain/model/model-gateway.js";
import { ModelRouter } from "../../domain/model/model-router.js";
import { SecurityBoundaryEnforcer } from "../security/security-boundary-enforcer.js";
import { ProviderFactory } from "../../infrastructure/model/provider-factory.js";
import { SecurityContext } from "../../domain/security/security.js";

export interface DefaultModelGatewayOptions {
  readonly router: ModelRouter;
  readonly providerFactory: ProviderFactory;
  readonly enforcer?: SecurityBoundaryEnforcer | undefined;
  readonly maxRetries?: number | undefined;
  readonly retryBackoffMs?: number | undefined;
  readonly defaultTimeoutMs?: number | undefined;
}

export class DefaultModelGateway implements ModelGateway {
  private readonly router: ModelRouter;
  private readonly providerFactory: ProviderFactory;
  private readonly enforcer?: SecurityBoundaryEnforcer | undefined;
  private readonly maxRetries: number;
  private readonly retryBackoffMs: number;
  private readonly defaultTimeoutMs: number;

  constructor(options: DefaultModelGatewayOptions) {
    this.router = options.router;
    this.providerFactory = options.providerFactory;
    this.enforcer = options.enforcer;
    this.maxRetries = options.maxRetries ?? 2;
    this.retryBackoffMs = options.retryBackoffMs ?? 50;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 30000;
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    validateModelRequest(request);

    // Extract SecurityContext from request.metadata if passed
    const securityContext = request.metadata?.securityContext instanceof SecurityContext
      ? (request.metadata.securityContext as SecurityContext)
      : undefined;

    // 1. Model Routing & Capability Pre-check
    const decision = await this.router.route({
      modelRequest: request,
      securityContext,
      preferredProvider: typeof request.metadata?.preferredProvider === "string" ? request.metadata.preferredProvider : undefined,
      fallbackAllowed: request.metadata?.fallbackAllowed !== false,
      fallbackChain: Array.isArray(request.metadata?.fallbackChain) ? request.metadata.fallbackChain as string[] : ["stub"],
    });

    // 2. Primary Execution with Retries
    const primaryProviderId = decision.providerId;
    let lastError: unknown = null;

    try {
      return await this.executeWithRetry(primaryProviderId, request);
    } catch (err) {
      lastError = err;

      // Fail-closed: Never fallback on authentication, validation, or authorization errors
      if (
        err instanceof ModelAuthenticationError ||
        err instanceof ModelValidationError ||
        (err instanceof Error && err.message.includes("Security boundary rejected"))
      ) {
        throw err;
      }

      // 3. Fallback execution if eligible
      for (const fallbackProvider of decision.fallbackChain) {
        if (fallbackProvider.toLowerCase() === primaryProviderId.toLowerCase()) continue;
        if (!this.providerFactory.hasProvider(fallbackProvider)) continue;

        try {
          const fallbackAdapter = this.providerFactory.resolveProvider(fallbackProvider);
          const response = await fallbackAdapter.generate(request);
          return {
            ...response,
            metadata: {
              ...response.metadata,
              fallbackApplied: true,
              originalProvider: primaryProviderId,
              fallbackProvider,
            },
          };
        } catch {
          // Continue to next in fallback chain
        }
      }

      // If all fallbacks exhausted, rethrow original classified error
      throw lastError;
    }
  }

  private async executeWithRetry(providerId: string, request: ModelRequest): Promise<ModelResponse> {
    const adapter = this.providerFactory.resolveProvider(providerId);
    let attempt = 0;

    while (attempt <= this.maxRetries) {
      try {
        return await adapter.generate(request);
      } catch (err) {
        attempt++;
        const isTransient =
          err instanceof ModelRateLimitError ||
          err instanceof ModelTimeoutError ||
          err instanceof ModelUnavailableError;

        if (!isTransient || attempt > this.maxRetries) {
          throw err;
        }

        // Bounded exponential backoff
        const backoff = Math.min(this.retryBackoffMs * Math.pow(2, attempt - 1), 500);
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }

    throw new ModelUnavailableError(providerId, "Max retry attempts exceeded");
  }

  async generateStructured<T = Record<string, unknown>>(
    request: ModelRequest,
    schema: Readonly<Record<string, unknown>>
  ): Promise<StructuredResult<T>> {
    // Enforce structured request format
    const structuredReq: ModelRequest = {
      ...request,
      requestedFormat: "json_schema",
      jsonSchema: schema,
    };

    const rawResponse = await this.generate(structuredReq);
    let parsed: unknown = rawResponse.output;

    if (typeof rawResponse.content === "string" && rawResponse.content.trim() !== "") {
      try {
        parsed = JSON.parse(rawResponse.content);
      } catch {
        // use output if raw content parse fails
      }
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new ModelStructuredOutputError("Model output failed structured object validation", rawResponse.content);
    }

    // Validate required fields if specified in schema
    if (schema && Array.isArray(schema.required)) {
      const obj = parsed as Record<string, unknown>;
      for (const reqField of schema.required) {
        if (typeof reqField === "string" && !(reqField in obj)) {
          throw new ModelStructuredOutputError(
            `Structured output missing required schema property: '${reqField}'`,
            rawResponse.content
          );
        }
      }
    }

    return {
      output: parsed as T,
      raw: rawResponse,
    };
  }

  async getModel(modelId: string): Promise<ModelDefinition | undefined> {
    for (const providerId of this.providerFactory.listProviders()) {
      const adapter = this.providerFactory.resolveProvider(providerId);
      const models = await adapter.listSupportedModels();
      const match = models.find((m) => m.id === modelId);
      if (match) return match;
    }
    return undefined;
  }

  async listModels(): Promise<readonly ModelDefinition[]> {
    const list: ModelDefinition[] = [];
    for (const providerId of this.providerFactory.listProviders()) {
      const adapter = this.providerFactory.resolveProvider(providerId);
      const models = await adapter.listSupportedModels();
      list.push(...models);
    }
    return list;
  }

  async getCapabilities(modelId: string): Promise<readonly ModelCapability[]> {
    const model = await this.getModel(modelId);
    return model ? model.capabilities : [];
  }

  async supports(modelId: string, capability: ModelCapability): Promise<boolean> {
    const caps = await this.getCapabilities(modelId);
    return caps.includes(capability);
  }
}

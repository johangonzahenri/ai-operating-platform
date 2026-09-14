import { SecurityContext } from "../../domain/security/security.js";
import {
  ModelCapability,
  ModelDefinition,
  ModelNotFoundError,
} from "../../domain/model/model-gateway.js";
import {
  ModelRouter,
  ModelRoutingDecision,
  ModelRoutingRequest,
} from "../../domain/model/model-router.js";
import { SecurityBoundaryEnforcer } from "../security/security-boundary-enforcer.js";

export interface DefaultModelRouterOptions {
  readonly models?: readonly ModelDefinition[] | undefined;
  readonly defaultProvider?: string | undefined;
  readonly enforcer?: SecurityBoundaryEnforcer | undefined;
}

export class DefaultModelRouter implements ModelRouter {
  private readonly models: Map<string, ModelDefinition>;
  private readonly defaultProvider: string;
  private readonly enforcer?: SecurityBoundaryEnforcer | undefined;

  constructor(options: DefaultModelRouterOptions = {}) {
    this.models = new Map();
    this.defaultProvider = options.defaultProvider ?? "stub";
    this.enforcer = options.enforcer;

    if (options.models) {
      for (const m of options.models) {
        this.models.set(m.id, m);
      }
    }
  }

  registerModel(model: ModelDefinition): void {
    this.models.set(model.id, model);
  }

  async route(request: ModelRoutingRequest): Promise<ModelRoutingDecision> {
    const requestedModelId = request.modelRequest.model;
    let selectedModel = this.models.get(requestedModelId);

    // If not registered by explicit ID, synthesize definition or search provider defaults
    if (!selectedModel) {
      if (requestedModelId === "stub-model") {
        selectedModel = {
          id: "stub-model",
          provider: "stub",
          name: "Stub Model",
          capabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT", "TOOL_CALLING"],
        };
      } else if (requestedModelId.startsWith("gpt-") || requestedModelId.startsWith("o1-")) {
        selectedModel = {
          id: requestedModelId,
          provider: "openai",
          name: requestedModelId,
          capabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT", "TOOL_CALLING"],
        };
      } else if (requestedModelId.startsWith("claude-")) {
        selectedModel = {
          id: requestedModelId,
          provider: "anthropic",
          name: requestedModelId,
          capabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT", "TOOL_CALLING"],
        };
      } else if (requestedModelId.startsWith("llama") || requestedModelId.startsWith("mistral")) {
        selectedModel = {
          id: requestedModelId,
          provider: "ollama",
          name: requestedModelId,
          capabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT", "TOOL_CALLING"],
        };
      } else {
        // Fallback default model
        selectedModel = {
          id: requestedModelId,
          provider: request.preferredProvider ?? this.defaultProvider,
          name: requestedModelId,
          capabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT"],
        };
      }
    }

    const providerId = request.preferredProvider ?? selectedModel.provider;

    // Security boundary enforcement check if SecurityContext provided
    if (request.securityContext && this.enforcer) {
      const decision = await this.enforcer.enforceModelBoundary({
        context: request.securityContext,
        modelId: selectedModel.id,
        providerId,
        input: request.modelRequest.input,
        correlationId: request.modelRequest.traceId,
      });

      if (!decision.allowed) {
        throw new Error(
          `Security boundary rejected model routing for '${selectedModel.id}' (provider '${providerId}'): ${decision.reason}`
        );
      }
    }

    // Capability verification
    if (request.requiredCapabilities && request.requiredCapabilities.length > 0) {
      for (const cap of request.requiredCapabilities) {
        if (!selectedModel.capabilities.includes(cap)) {
          throw new Error(
            `Selected model '${selectedModel.id}' does not satisfy required capability '${cap}'`
          );
        }
      }
    }

    const fallbackChain = request.fallbackAllowed && request.fallbackChain
      ? request.fallbackChain
      : ["stub"];

    return {
      selectedModel,
      providerId,
      fallbackChain,
      reason: `Routed to ${providerId}/${selectedModel.id} based on request configuration`,
    };
  }
}

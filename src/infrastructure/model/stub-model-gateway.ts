import {
  ModelCapability,
  ModelDefinition,
  ModelGateway,
  ModelRequest,
  ModelResponse,
  ModelUnavailableError,
  StructuredResult,
  validateModelRequest,
  ModelStructuredOutputError,
} from "../../domain/model/model-gateway.js";
import { ModelProviderAdapter } from "../../application/ports/model-provider-port.js";

export class StubModelGateway implements ModelGateway, ModelProviderAdapter {
  readonly providerId = "stub";
  private readonly models: readonly ModelDefinition[] = [
    {
      id: "stub-model",
      provider: "stub",
      name: "Deterministic Stub Model",
      capabilities: [
        "TEXT_GENERATION",
        "STRUCTURED_OUTPUT",
        "TOOL_CALLING",
      ],
      contextWindow: 4096,
      maxOutputTokens: 2048,
    },
    {
      id: "default-planner-model",
      provider: "stub",
      name: "Deterministic Planner Model",
      capabilities: [
        "TEXT_GENERATION",
        "STRUCTURED_OUTPUT",
      ],
      contextWindow: 4096,
      maxOutputTokens: 2048,
    },
  ];

  constructor(private readonly failure?: Error) {}

  async generate(request: ModelRequest): Promise<ModelResponse> {
    validateModelRequest(request);
    if (this.failure) throw new ModelUnavailableError("stub", this.failure.message);

    if (request.input.capability === "product.discovery") {
      const rawQuery = typeof request.input.userMessage === "string" ? request.input.userMessage : "";
      const ignored = new Set(["quiero", "unas", "unos", "una", "un", "para", "que", "busco", "buscar", "necesito", "por", "favor"]);
      const terms = rawQuery
        .toLocaleLowerCase("es")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .split(/[^a-z0-9]+/)
        .filter((term) => term.length > 2 && !ignored.has(term));
      return {
        provider: "stub",
        model: request.model,
        content: "deterministic product discovery intent",
        output: {
          capability: "product.discovery",
          query: rawQuery,
          intent: { terms },
          candidates: [],
          products: [],
          count: 0,
        },
        metadata: { deterministic: true },
        finishReason: "stop",
      };
    }

    if (request.input.capability === "product.recommendation") {
      const preferences = typeof request.input.preferences === "string" ? request.input.preferences : "";
      const candidates = Array.isArray(request.input.candidates) ? request.input.candidates : [];
      const history = Array.isArray(request.input.history) ? request.input.history : [];
      const recommendations = candidates.map((item: Record<string, unknown>, index: number) => ({
        ...item,
        score: Math.max(0.7, 0.99 - index * 0.05),
        reasoning: `Matches preference for ${preferences || "style"} based on profile matching`,
      }));
      return {
        provider: "stub",
        model: request.model,
        content: "deterministic product recommendation",
        output: {
          capability: "product.recommendation",
          preferences,
          history,
          recommendations,
          count: recommendations.length,
        },
        metadata: { deterministic: true },
        finishReason: "stop",
      };
    }

    if (request.input.capability === "product.compare") {
      const products = Array.isArray(request.input.products) ? request.input.products : [];
      const comparisonMatrix = products.map((prod: Record<string, unknown>) => ({
        id: prod.id ?? "unknown",
        name: prod.name ?? "Product",
        price: prod.price ?? 0,
        category: prod.category ?? "General",
        color: prod.color ?? "Standard",
        material: prod.material ?? "Synthetic",
        fit: prod.fit ?? "Regular",
      }));
      return {
        provider: "stub",
        model: request.model,
        content: "deterministic product comparison",
        output: {
          capability: "product.compare",
          matrix: comparisonMatrix,
          differentiators: ["price", "material", "fit"],
          count: comparisonMatrix.length,
        },
        metadata: { deterministic: true },
        finishReason: "stop",
      };
    }

    if (request.input.capability === "cart.assistance") {
      const cart = (request.input.cart && typeof request.input.cart === "object" ? request.input.cart : { items: [], subtotal: 0, currency: "EUR" }) as { items: readonly unknown[]; subtotal: number; currency: string };
      const action = typeof request.input.action === "string" ? request.input.action : "evaluate";
      const freeShippingThreshold = 100;
      const subtotal = Number(cart.subtotal) || 0;
      const missingForFreeShipping = Math.max(0, freeShippingThreshold - subtotal);
      return {
        provider: "stub",
        model: request.model,
        content: "deterministic cart assistance",
        output: {
          capability: "cart.assistance",
          action,
          itemCount: Array.isArray(cart.items) ? cart.items.length : 0,
          subtotal,
          freeShippingThreshold,
          missingForFreeShipping,
          qualifiesForFreeShipping: missingForFreeShipping === 0,
          suggestedAddons: missingForFreeShipping > 0 ? [{ id: "socks-running-01", name: "Calcetines Running Pro", price: 15 }] : [],
        },
        metadata: { deterministic: true },
        finishReason: "stop",
      };
    }

    if (request.input.capability === "ar.fitting_room") {
      const profile = typeof request.input.profile === "string" ? request.input.profile : "Sora";
      const productId = typeof request.input.productId === "string" ? request.input.productId : "";
      const assetUrn = typeof request.input.assetUrn === "string" ? request.input.assetUrn : `urn:tentaciones:ar:apparel:${productId}`;
      return {
        provider: "stub",
        model: request.model,
        content: "deterministic ar fitting room resolution",
        output: {
          capability: "ar.fitting_room",
          productId,
          profile,
          assetUrn,
          status: "AR_AVAILABLE",
          previewUrl: `https://ar.tentaciones.com/preview/${encodeURIComponent(assetUrn)}?profile=${profile}`,
          version: "v1.0.0",
        },
        metadata: { deterministic: true },
        finishReason: "stop",
      };
    }

    return {
      provider: "stub",
      model: request.model,
      content: "stub response",
      output: { echoedInput: request.input, model: request.model },
      metadata: { deterministic: true },
      finishReason: "stop",
    };
  }

  async generateStructured<T = Record<string, unknown>>(
    request: ModelRequest,
    _schema: Readonly<Record<string, unknown>>
  ): Promise<StructuredResult<T>> {
    const raw = await this.generate(request);
    let output: unknown = raw.output;
    if (typeof raw.content === "string") {
      try {
        output = JSON.parse(raw.content);
      } catch {
        // use output directly if already parsed
      }
    }
    if (!output || typeof output !== "object") {
      throw new ModelStructuredOutputError("Failed to produce structured output", raw.content);
    }
    return { output: output as T, raw };
  }

  async getModel(modelId: string): Promise<ModelDefinition | undefined> {
    return this.models.find((m) => m.id === modelId);
  }

  async listModels(): Promise<readonly ModelDefinition[]> {
    return this.models;
  }

  async listSupportedModels(): Promise<readonly ModelDefinition[]> {
    return this.models;
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

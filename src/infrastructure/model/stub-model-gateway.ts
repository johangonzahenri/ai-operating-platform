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

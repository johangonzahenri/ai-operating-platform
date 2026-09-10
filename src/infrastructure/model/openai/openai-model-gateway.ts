import {
  ModelGateway,
  ModelRequest,
  ModelResponse,
  ModelAuthenticationError,
  ModelRateLimitError,
  ModelTimeoutError,
  ModelInvalidRequestError,
  ModelProviderError,
  validateModelRequest,
} from "../../../domain/model/model-gateway.js";
import { ModelProviderConfig, validateProviderConfig } from "../model-provider-config.js";

export class OpenAIModelGateway implements ModelGateway {
  readonly provider = "openai";
  private readonly config: ModelProviderConfig;

  constructor(config: ModelProviderConfig) {
    validateProviderConfig(config);
    this.config = config;
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    validateModelRequest(request);

    if (!this.config.apiKey && this.config.provider === "openai") {
      throw new ModelAuthenticationError(this.provider, "OpenAI API key is missing from provider configuration");
    }

    // Boundary contract verification: simulates normalized provider mapping without external I/O
    const startTime = Date.now();
    const model = request.model || this.config.defaultModel;

    return {
      provider: this.provider,
      model,
      content: `[OpenAI:${model}] Response generated for trace ${request.traceId}`,
      output: {
        raw: `[OpenAI:${model}] Response generated for trace ${request.traceId}`,
        echoedInput: request.input,
      },
      usage: {
        inputTokens: 10,
        outputTokens: 15,
        totalTokens: 25,
      },
      latencyMs: Date.now() - startTime,
      finishReason: "stop",
      metadata: {
        provider: "openai",
        model,
      },
    };
  }
}

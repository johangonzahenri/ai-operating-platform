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

export class AnthropicModelGateway implements ModelGateway {
  readonly provider = "anthropic";
  private readonly config: ModelProviderConfig;

  constructor(config: ModelProviderConfig) {
    validateProviderConfig(config);
    this.config = config;
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    validateModelRequest(request);

    if (!this.config.apiKey && this.config.provider === "anthropic") {
      throw new ModelAuthenticationError(this.provider, "Anthropic API key is missing from provider configuration");
    }

    const startTime = Date.now();
    const model = request.model || this.config.defaultModel;

    return {
      provider: this.provider,
      model,
      content: `[Anthropic:${model}] Response generated for trace ${request.traceId}`,
      output: {
        raw: `[Anthropic:${model}] Response generated for trace ${request.traceId}`,
        echoedInput: request.input,
      },
      usage: {
        inputTokens: 12,
        outputTokens: 18,
        totalTokens: 30,
      },
      latencyMs: Date.now() - startTime,
      finishReason: "stop",
      metadata: {
        provider: "anthropic",
        model,
      },
    };
  }
}

import {
  ModelCapability,
  ModelDefinition,
  ModelGateway,
  ModelRequest,
  ModelResponse,
  ModelStreamChunk,
  ModelAuthenticationError,
  ModelRateLimitError,
  ModelTimeoutError,
  ModelInvalidRequestError,
  ModelProviderError,
  ModelInvalidResponseError,
  ModelUnavailableError,
  ModelStructuredOutputError,
  StructuredResult,
  validateModelRequest,
} from "../../../domain/model/model-gateway.js";
import { ModelProviderAdapter } from "../../../application/ports/model-provider-port.js";
import { ModelProviderConfig, validateProviderConfig } from "../model-provider-config.js";

export type GeminiFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

function toJsonSchema(schema: unknown): Record<string, unknown> {
  if (schema && typeof schema === "object") {
    return schema as Record<string, unknown>;
  }
  return { type: "object", properties: {} };
}

export class GeminiModelGateway implements ModelGateway, ModelProviderAdapter {
  readonly provider = "gemini";
  readonly providerId = "gemini";
  private readonly config: ModelProviderConfig;

  private readonly knownModels: readonly ModelDefinition[] = [
    {
      id: "gemini-1.5-pro",
      provider: "gemini",
      name: "Gemini 1.5 Pro",
      capabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT", "TOOL_CALLING", "VISION", "STREAMING"],
      contextWindow: 2000000,
      maxOutputTokens: 8192,
    },
    {
      id: "gemini-1.5-flash",
      provider: "gemini",
      name: "Gemini 1.5 Flash",
      capabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT", "TOOL_CALLING", "VISION", "STREAMING"],
      contextWindow: 1000000,
      maxOutputTokens: 8192,
    },
    {
      id: "gemini-2.0-flash",
      provider: "gemini",
      name: "Gemini 2.0 Flash",
      capabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT", "TOOL_CALLING", "VISION", "STREAMING"],
      contextWindow: 1000000,
      maxOutputTokens: 8192,
    },
  ];

  constructor(
    config: ModelProviderConfig,
    private readonly fetchFn: GeminiFetch = globalThis.fetch.bind(globalThis)
  ) {
    validateProviderConfig(config);
    this.config = config;
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    validateModelRequest(request);

    if (!this.config.apiKey && this.config.provider === "gemini") {
      throw new ModelAuthenticationError(this.provider, "Gemini API key is missing from provider configuration");
    }

    const baseUrl = (this.config.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, "");
    const model = request.model === "stub-model" ? this.config.defaultModel : request.model;
    const controller = new AbortController();
    const timeoutMs = this.config.timeoutMs ?? 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const contents: Array<{ role: string; parts: Array<Record<string, unknown>> }> = [];

    if (request.messages && request.messages.length > 0) {
      for (const msg of request.messages) {
        if (msg.role === "system") {
          continue; // systemInstruction handled separately
        }
        if (msg.role === "tool") {
          contents.push({
            role: "function",
            parts: [
              {
                functionResponse: {
                  name: msg.toolResult.toolCallId,
                  response: msg.toolResult.output,
                },
              },
            ],
          });
        } else if (msg.role === "assistant") {
          const parts: Array<Record<string, unknown>> = [];
          if (msg.content) {
            parts.push({ text: msg.content });
          }
          if (msg.toolCalls) {
            for (const call of msg.toolCalls) {
              parts.push({
                functionCall: {
                  name: call.name,
                  args: call.arguments,
                },
              });
            }
          }
          contents.push({ role: "model", parts });
        } else {
          contents.push({
            role: "user",
            parts: [{ text: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content) }],
          });
        }
      }
    } else {
      contents.push({
        role: "user",
        parts: [{ text: request.objective ?? JSON.stringify(request.input ?? {}) }],
      });
    }

    const generationConfig: Record<string, unknown> = {};
    if (request.temperature !== undefined) {
      generationConfig.temperature = request.temperature;
    }
    if (request.maxTokens !== undefined) {
      generationConfig.maxOutputTokens = request.maxTokens;
    }
    if (request.requestedFormat === "json_object") {
      generationConfig.responseMimeType = "application/json";
    }

    const bodyPayload: Record<string, unknown> = {
      contents,
      generationConfig,
    };

    if (request.systemInstruction) {
      bodyPayload.systemInstruction = {
        parts: [{ text: request.systemInstruction }],
      };
    }

    if (request.tools && request.tools.length > 0) {
      bodyPayload.tools = [
        {
          functionDeclarations: request.tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            parameters: toJsonSchema(tool.inputSchema),
          })),
        },
      ];
    }

    const url = `${baseUrl}/models/${model}:generateContent?key=${this.config.apiKey ?? ""}`;
    const startTime = Date.now();
    let response: Response;

    try {
      response = await this.fetchFn(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(bodyPayload),
        signal: controller.signal,
      });
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === "AbortError") {
        throw new ModelTimeoutError(this.provider, timeoutMs);
      }
      throw new ModelUnavailableError(this.provider, err instanceof Error ? err.message : "Network error");
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      let errorData: any;
      try {
        errorData = await response.json();
      } catch {
        errorData = { error: { message: response.statusText } };
      }
      const msg = errorData?.error?.message ?? response.statusText;
      if (response.status === 401 || response.status === 403) {
        throw new ModelAuthenticationError(this.provider, msg);
      }
      if (response.status === 429) {
        throw new ModelRateLimitError(this.provider, msg);
      }
      if (response.status === 400) {
        throw new ModelInvalidRequestError(this.provider, msg);
      }
      if (response.status === 503 || response.status === 504) {
        throw new ModelUnavailableError(this.provider, msg);
      }
      throw new ModelProviderError(this.provider, `Gemini API returned ${response.status}: ${msg}`);
    }

    let body: any;
    try {
      body = await response.json();
    } catch {
      throw new ModelInvalidResponseError(this.provider, "Gemini returned invalid non-JSON response");
    }

    const candidate = body.candidates?.[0];
    const candidateParts = candidate?.content?.parts ?? [];
    let content = "";
    const toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }> = [];

    for (let i = 0; i < candidateParts.length; i++) {
      const part = candidateParts[i];
      if (part.text) {
        content += part.text;
      }
      if (part.functionCall) {
        toolCalls.push({
          id: `call_${part.functionCall.name}_${i}`,
          name: part.functionCall.name,
          arguments: part.functionCall.args ?? {},
        });
      }
    }

    let output: unknown = content;
    if (request.requestedFormat === "json_object" && content) {
      try {
        output = JSON.parse(content);
      } catch {
        throw new ModelInvalidResponseError(this.provider, "Gemini returned invalid structured JSON");
      }
    }

    const usageMetadata = body.usageMetadata;
    const inputTokens = typeof usageMetadata?.promptTokenCount === "number" ? usageMetadata.promptTokenCount : 0;
    const outputTokens = typeof usageMetadata?.candidatesTokenCount === "number" ? usageMetadata.candidatesTokenCount : 0;

    return {
      provider: this.provider,
      model,
      content,
      output,
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
      metadata: { provider: this.provider, model },
      finishReason: candidate?.finishReason ?? "STOP",
      latencyMs: Date.now() - startTime,
    };
  }

  async generateStructured<T = Record<string, unknown>>(
    request: ModelRequest,
    _schema: Readonly<Record<string, unknown>>
  ): Promise<StructuredResult<T>> {
    const raw = await this.generate({ ...request, requestedFormat: "json_object" });
    let output: unknown = raw.output;
    if (typeof raw.content === "string") {
      try {
        output = JSON.parse(raw.content);
      } catch {
        // preserve output
      }
    }
    if (!output || typeof output !== "object") {
      throw new ModelStructuredOutputError("Gemini output failed structured schema parsing", raw.content);
    }
    return { output: output as T, raw };
  }

  async *generateStream(request: ModelRequest): AsyncIterable<ModelStreamChunk> {
    const raw = await this.generate(request);
    yield {
      content: raw.content,
      isFinal: true,
      finishReason: raw.finishReason,
    };
  }

  async getModel(modelId: string): Promise<ModelDefinition | undefined> {
    return this.knownModels.find((m) => m.id === modelId);
  }

  async listModels(): Promise<readonly ModelDefinition[]> {
    return this.knownModels;
  }

  async listSupportedModels(): Promise<readonly ModelDefinition[]> {
    return this.knownModels;
  }

  async getCapabilities(modelId: string): Promise<readonly ModelCapability[]> {
    const model = await this.getModel(modelId);
    return model ? model.capabilities : ["TEXT_GENERATION"];
  }

  async supports(modelId: string, capability: ModelCapability): Promise<boolean> {
    const caps = await this.getCapabilities(modelId);
    return caps.includes(capability);
  }
}

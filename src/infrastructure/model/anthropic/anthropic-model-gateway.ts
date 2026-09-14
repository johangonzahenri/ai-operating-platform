import {
  ModelCapability,
  ModelDefinition,
  ModelGateway,
  ModelRequest,
  ModelResponse,
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

export type AnthropicFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export class AnthropicModelGateway implements ModelGateway, ModelProviderAdapter {
  readonly provider = "anthropic";
  readonly providerId = "anthropic";
  private readonly config: ModelProviderConfig;

  private readonly knownModels: readonly ModelDefinition[] = [
    {
      id: "claude-3-5-sonnet-20241022",
      provider: "anthropic",
      name: "Claude 3.5 Sonnet",
      capabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT", "TOOL_CALLING", "VISION", "STREAMING"],
      contextWindow: 200000,
      maxOutputTokens: 8192,
    },
    {
      id: "claude-3-5-haiku-latest",
      provider: "anthropic",
      name: "Claude 3.5 Haiku",
      capabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT", "TOOL_CALLING", "STREAMING"],
      contextWindow: 200000,
      maxOutputTokens: 8192,
    },
  ];

  constructor(config: ModelProviderConfig, private readonly fetchFn: AnthropicFetch = globalThis.fetch.bind(globalThis)) {
    validateProviderConfig(config);
    this.config = config;
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    validateModelRequest(request);

    if (!this.config.apiKey && this.config.provider === "anthropic") {
      throw new ModelAuthenticationError(this.provider, "Anthropic API key is missing from provider configuration");
    }

    const baseUrl = (this.config.baseUrl ?? "https://api.anthropic.com").replace(/\/+$/, "");
    const model = request.model === "stub-model" ? this.config.defaultModel : request.model;
    const controller = new AbortController();
    const timeoutMs = this.config.timeoutMs ?? 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    const startTime = Date.now();
    try {
      response = await this.fetchFn(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.config.apiKey ?? "",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: request.maxTokens ?? 2048,
          temperature: request.temperature,
          system: request.systemInstruction,
          ...(request.tools
            ? { tools: request.tools.map((tool) => ({ name: tool.name, description: tool.description, input_schema: toJsonSchema(tool.inputSchema) })) }
            : {}),
          messages: request.messages
            ? request.messages
                .filter((item) => item.role !== "system")
                .map((item) =>
                  item.role === "tool"
                    ? { role: "user", content: [{ type: "tool_result", tool_use_id: item.toolResult.toolCallId, content: JSON.stringify(item.toolResult.output) }] }
                    : {
                        role: item.role,
                        content:
                          item.role === "assistant"
                            ? [
                                ...(item.content ? [{ type: "text", text: item.content }] : []),
                                ...(item.toolCalls ?? []).map((call) => ({ type: "tool_use", id: call.id, name: call.name, input: call.arguments })),
                              ]
                            : item.content,
                      }
                )
            : [{ role: "user", content: request.objective ?? JSON.stringify(request.input) }],
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new ModelTimeoutError(this.provider, `Anthropic request timed out after ${timeoutMs}ms`);
      }
      throw new ModelUnavailableError(this.provider, error instanceof Error ? error.message : String(error));
    } finally {
      clearTimeout(timeoutId);
    }

    function toJsonSchema(schema: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
      if ("properties" in schema && "required" in schema) {
        return { type: "object", properties: schema.properties, required: schema.required, additionalProperties: false };
      }
      return schema;
    }

    const body = (await response.json().catch(() => undefined)) as Record<string, unknown> | undefined;
    if (!body) throw new ModelInvalidResponseError(this.provider, "Anthropic returned invalid JSON");
    if (!response.ok) {
      const message = String((body?.error as Record<string, unknown> | undefined)?.message ?? `Anthropic HTTP ${response.status}`);
      if (response.status === 401 || response.status === 403) throw new ModelAuthenticationError(this.provider, message);
      if (response.status === 429) throw new ModelRateLimitError(this.provider, message);
      if (response.status >= 500) throw new ModelProviderError(this.provider, message);
      throw new ModelInvalidRequestError(this.provider, message);
    }

    const contentBlocks = Array.isArray(body?.content) ? body.content : [];
    const toolCalls = contentBlocks
      .filter((block) => (block as Record<string, unknown>).type === "tool_use")
      .map((block) => {
        const item = block as Record<string, unknown>;
        return {
          id: String(item.id ?? ""),
          name: String(item.name ?? ""),
          arguments: (item.input && typeof item.input === "object" ? item.input : {}) as Record<string, unknown>,
        };
      });
    const content = contentBlocks
      .map((block) => (typeof (block as Record<string, unknown>).text === "string" ? (block as Record<string, unknown>).text : ""))
      .join("");
    if (!content && toolCalls.length === 0) throw new ModelInvalidResponseError(this.provider, "Anthropic returned an empty response");

    let output: Readonly<Record<string, unknown>> = { raw: content };
    if (request.requestedFormat === "json_object" || request.requestedFormat === "json_schema") {
      try {
        output = JSON.parse(content) as Record<string, unknown>;
      } catch {
        throw new ModelInvalidResponseError(this.provider, "Anthropic returned invalid structured JSON");
      }
    }

    const usage = body.usage as Record<string, unknown> | undefined;
    const inputTokens = typeof usage?.input_tokens === "number" ? usage.input_tokens : 0;
    const outputTokens = typeof usage?.output_tokens === "number" ? usage.output_tokens : 0;

    return {
      provider: this.provider,
      model,
      content,
      output,
      toolCalls,
      usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
      metadata: { provider: this.provider, model },
      finishReason: typeof body.stop_reason === "string" ? body.stop_reason : "stop",
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
        // use output
      }
    }
    if (!output || typeof output !== "object") {
      throw new ModelStructuredOutputError("Anthropic output failed structured schema parsing", raw.content);
    }
    return { output: output as T, raw };
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

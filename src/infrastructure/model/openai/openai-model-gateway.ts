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

export type OpenAIFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export class OpenAIModelGateway implements ModelGateway, ModelProviderAdapter {
  readonly provider = "openai";
  readonly providerId = "openai";
  private readonly config: ModelProviderConfig;

  private readonly knownModels: readonly ModelDefinition[] = [
    {
      id: "gpt-4o",
      provider: "openai",
      name: "GPT-4o",
      capabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT", "TOOL_CALLING", "VISION", "STREAMING"],
      contextWindow: 128000,
      maxOutputTokens: 4096,
    },
    {
      id: "gpt-4o-mini",
      provider: "openai",
      name: "GPT-4o Mini",
      capabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT", "TOOL_CALLING", "STREAMING"],
      contextWindow: 128000,
      maxOutputTokens: 4096,
    },
    {
      id: "o1-mini",
      provider: "openai",
      name: "O1 Mini",
      capabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT"],
      contextWindow: 128000,
      maxOutputTokens: 65536,
    },
  ];

  constructor(config: ModelProviderConfig, private readonly fetchFn: OpenAIFetch = globalThis.fetch.bind(globalThis)) {
    validateProviderConfig(config);
    this.config = config;
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    validateModelRequest(request);

    if (!this.config.apiKey && this.config.provider === "openai") {
      throw new ModelAuthenticationError(this.provider, "OpenAI API key is missing from provider configuration");
    }

    const baseUrl = (this.config.baseUrl ?? "https://api.openai.com/v1").replace(/\/+$/, "");
    const model = request.model === "stub-model" ? this.config.defaultModel : request.model;
    const controller = new AbortController();
    const timeoutMs = this.config.timeoutMs ?? 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const messages = [
      ...(request.systemInstruction ? [{ role: "system", content: request.systemInstruction }] : []),
      { role: "user", content: request.objective ?? JSON.stringify(request.input) },
    ];
    const startTime = Date.now();
    let response: Response;
    try {
      response = await this.fetchFn(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.config.apiKey}` },
        body: JSON.stringify({
          model,
          messages: request.messages
            ? request.messages.map((item) => {
                if (item.role === "tool") {
                  return {
                    role: "tool",
                    tool_call_id: item.toolResult.toolCallId,
                    content: JSON.stringify(item.toolResult.output),
                  };
                }
                if (item.role === "assistant") {
                  return {
                    role: "assistant",
                    ...(item.content !== undefined ? { content: item.content } : {}),
                    ...(item.toolCalls
                      ? {
                          tool_calls: item.toolCalls.map((call) => ({
                            id: call.id,
                            type: "function",
                            function: { name: call.name, arguments: JSON.stringify(call.arguments) },
                          })),
                        }
                      : {}),
                  };
                }
                return { role: item.role, content: item.content };
              })
            : messages,
          temperature: request.temperature,
          max_tokens: request.maxTokens,
          ...(request.requestedFormat
            ? { response_format: { type: request.requestedFormat === "json_schema" ? "json_object" : request.requestedFormat } }
            : {}),
          ...(request.tools
            ? {
                tools: request.tools.map((tool) => ({
                  type: "function",
                  function: { name: tool.name, description: tool.description, parameters: toJsonSchema(tool.inputSchema) },
                })),
              }
            : {}),
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new ModelTimeoutError(this.provider, `OpenAI request timed out after ${timeoutMs}ms`);
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
    if (!response.ok) {
      const errorBody = body?.error as Record<string, unknown> | undefined;
      if (response.status === 401 || response.status === 403) {
        throw new ModelAuthenticationError(this.provider, String(errorBody?.message ?? "OpenAI authentication failed"));
      }
      if (response.status === 429) {
        throw new ModelRateLimitError(this.provider, String(errorBody?.message ?? "OpenAI rate limit exceeded"));
      }
      if (response.status >= 500) {
        throw new ModelProviderError(this.provider, String(errorBody?.message ?? `OpenAI HTTP ${response.status}`));
      }
      throw new ModelInvalidRequestError(this.provider, String(errorBody?.message ?? `OpenAI HTTP ${response.status}`));
    }

    const choices = Array.isArray(body?.choices) ? body.choices : [];
    const first = choices[0] as Record<string, unknown> | undefined;
    const message = first?.message as Record<string, unknown> | undefined;
    const content = typeof message?.content === "string" ? message.content : "";
    const toolCalls = Array.isArray(message?.tool_calls)
      ? message.tool_calls.map((call) => {
          const item = call as Record<string, unknown>;
          const fn = item.function as Record<string, unknown>;
          let args: Readonly<Record<string, unknown>> = {};
          try {
            args = JSON.parse(typeof fn?.arguments === "string" ? fn.arguments : "{}");
          } catch {
            throw new ModelInvalidResponseError(this.provider, "OpenAI returned invalid tool arguments");
          }
          return { id: String(item.id ?? ""), name: String(fn?.name ?? ""), arguments: args };
        })
      : [];

    if (!body || !message || (content === "" && toolCalls.length === 0)) {
      throw new ModelInvalidResponseError(this.provider, "OpenAI returned an empty response");
    }

    let output: Readonly<Record<string, unknown>> = { raw: content };
    if (request.requestedFormat === "json_object" || request.requestedFormat === "json_schema") {
      try {
        output = JSON.parse(content) as Record<string, unknown>;
      } catch {
        throw new ModelInvalidResponseError(this.provider, "OpenAI returned invalid structured JSON");
      }
    }

    const usage = body.usage as Record<string, unknown> | undefined;
    const inputTokens = typeof usage?.prompt_tokens === "number" ? usage.prompt_tokens : 0;
    const outputTokens = typeof usage?.completion_tokens === "number" ? usage.completion_tokens : 0;

    return {
      provider: this.provider,
      model,
      content,
      output,
      toolCalls,
      usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
      latencyMs: Date.now() - startTime,
      finishReason: typeof first?.finish_reason === "string" ? first.finish_reason : "stop",
      metadata: { provider: this.provider, model },
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
      throw new ModelStructuredOutputError("OpenAI output failed structured schema parsing", raw.content);
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

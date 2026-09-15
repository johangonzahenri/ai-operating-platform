import {
  ModelGateway,
  ModelRequest,
  ModelResponse,
  ModelDefinition,
  ModelCapability,
  StructuredResult,
  ModelAuthenticationError,
  ModelRateLimitError,
  ModelTimeoutError,
  ModelInvalidRequestError,
  ModelUnavailableError,
  ModelProviderError,
  validateModelRequest,
} from "../../domain/model/model-gateway.js";

export interface ProviderNetworkConfig {
  readonly apiKey?: string | undefined;
  readonly baseUrl?: string | undefined;
  readonly timeoutMs?: number | undefined;
  readonly organizationId?: string | undefined;
  readonly fetchFn?: typeof fetch | undefined;
}

export class OpenAIModelGateway implements ModelGateway {
  readonly provider = "openai";
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  private static readonly SUPPORTED_MODELS: readonly ModelDefinition[] = [
    {
      id: "gpt-4o",
      provider: "openai",
      name: "GPT-4o Omnimodel",
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
  ];

  constructor(config?: ProviderNetworkConfig) {
    this.apiKey = config?.apiKey || process.env.OPENAI_API_KEY || "";
    this.baseUrl = (config?.baseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
    this.timeoutMs = config?.timeoutMs ?? 30000;
    this.fetchFn = config?.fetchFn || globalThis.fetch;
  }

  async getModel(modelId: string): Promise<ModelDefinition | undefined> {
    return OpenAIModelGateway.SUPPORTED_MODELS.find((m) => m.id === modelId);
  }

  async listModels(): Promise<readonly ModelDefinition[]> {
    return [...OpenAIModelGateway.SUPPORTED_MODELS];
  }

  async getCapabilities(modelId: string): Promise<readonly ModelCapability[]> {
    const model = await this.getModel(modelId);
    return model?.capabilities ?? [];
  }

  async supports(modelId: string, capability: ModelCapability): Promise<boolean> {
    const caps = await this.getCapabilities(modelId);
    return caps.includes(capability);
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    validateModelRequest(request);

    if (!this.apiKey) {
      throw new ModelAuthenticationError("openai", "OpenAI API key is missing or empty in configuration/environment");
    }

    const startTime = Date.now();
    const messages: Array<{ role: string; content: string }> = [];

    if (request.systemInstruction) {
      messages.push({ role: "system", content: request.systemInstruction });
    }

    if (request.messages && request.messages.length > 0) {
      for (const m of request.messages) {
        if (m.role === "system" || m.role === "user") {
          messages.push({ role: m.role, content: m.content });
        } else if (m.role === "assistant") {
          messages.push({ role: "assistant", content: m.content || "" });
        }
      }
    } else {
      messages.push({ role: "user", content: JSON.stringify(request.input) });
    }

    const payload: Record<string, unknown> = {
      model: request.model,
      messages,
      temperature: request.temperature ?? 0.2,
      max_tokens: request.maxTokens ?? 2048,
    };

    if (request.requestedFormat === "json_object" || request.requestedFormat === "json_schema") {
      if (request.jsonSchema) {
        payload.response_format = {
          type: "json_schema",
          json_schema: {
            name: "response_schema",
            strict: true,
            schema: request.jsonSchema,
          },
        };
      } else {
        payload.response_format = { type: "json_object" };
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        if (response.status === 401 || response.status === 403) {
          throw new ModelAuthenticationError("openai", `OpenAI Authentication Error (HTTP ${response.status}): ${errorText}`);
        }
        if (response.status === 429) {
          throw new ModelRateLimitError("openai", `OpenAI Rate Limit Exceeded: ${errorText}`);
        }
        if (response.status >= 500) {
          throw new ModelUnavailableError("openai", `OpenAI Server Unavailable (HTTP ${response.status}): ${errorText}`);
        }
        throw new ModelProviderError("openai", `OpenAI Request Failed with status ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as any;
      const latencyMs = Date.now() - startTime;
      const choice = data?.choices?.[0];
      const messageContent = choice?.message?.content ?? "";

      let parsedOutput: Record<string, unknown>;
      try {
        parsedOutput = JSON.parse(messageContent);
      } catch {
        parsedOutput = { text: messageContent };
      }

      return {
        output: parsedOutput,
        provider: "openai",
        model: request.model,
        content: messageContent,
        usage: {
          inputTokens: data?.usage?.prompt_tokens ?? 0,
          outputTokens: data?.usage?.completion_tokens ?? 0,
          totalTokens: data?.usage?.total_tokens ?? 0,
        },
        latencyMs,
        finishReason: choice?.finish_reason ?? "stop",
        metadata: {
          id: data?.id,
          system_fingerprint: data?.system_fingerprint,
        },
      };
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === "AbortError") {
        throw new ModelTimeoutError("openai", `OpenAI request timed out after ${this.timeoutMs}ms`);
      }
      if (err instanceof ModelAuthenticationError || err instanceof ModelRateLimitError || err instanceof ModelUnavailableError || err instanceof ModelProviderError) {
        throw err;
      }
      throw new ModelProviderError("openai", `OpenAI network error: ${err.message || String(err)}`);
    }
  }

  async generateStructured<T = Record<string, unknown>>(
    request: ModelRequest,
    schema: Readonly<Record<string, unknown>>
  ): Promise<StructuredResult<T>> {
    const structuredReq: ModelRequest = {
      ...request,
      requestedFormat: "json_schema",
      jsonSchema: schema,
    };
    const response = await this.generate(structuredReq);
    return {
      output: response.output as T,
      raw: response,
    };
  }
}

export class AnthropicModelGateway implements ModelGateway {
  readonly provider = "anthropic";
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  private static readonly SUPPORTED_MODELS: readonly ModelDefinition[] = [
    {
      id: "claude-3-5-sonnet-20241022",
      provider: "anthropic",
      name: "Claude 3.5 Sonnet",
      capabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT", "TOOL_CALLING", "VISION", "STREAMING"],
      contextWindow: 200000,
      maxOutputTokens: 8192,
    },
    {
      id: "claude-3-haiku-20240307",
      provider: "anthropic",
      name: "Claude 3 Haiku",
      capabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT", "TOOL_CALLING", "STREAMING"],
      contextWindow: 200000,
      maxOutputTokens: 4096,
    },
  ];

  constructor(config?: ProviderNetworkConfig) {
    this.apiKey = config?.apiKey || process.env.ANTHROPIC_API_KEY || "";
    this.baseUrl = (config?.baseUrl || process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com/v1").replace(/\/+$/, "");
    this.timeoutMs = config?.timeoutMs ?? 30000;
    this.fetchFn = config?.fetchFn || globalThis.fetch;
  }

  async getModel(modelId: string): Promise<ModelDefinition | undefined> {
    return AnthropicModelGateway.SUPPORTED_MODELS.find((m) => m.id === modelId);
  }

  async listModels(): Promise<readonly ModelDefinition[]> {
    return [...AnthropicModelGateway.SUPPORTED_MODELS];
  }

  async getCapabilities(modelId: string): Promise<readonly ModelCapability[]> {
    const model = await this.getModel(modelId);
    return model?.capabilities ?? [];
  }

  async supports(modelId: string, capability: ModelCapability): Promise<boolean> {
    const caps = await this.getCapabilities(modelId);
    return caps.includes(capability);
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    validateModelRequest(request);

    if (!this.apiKey) {
      throw new ModelAuthenticationError("anthropic", "Anthropic API key is missing or empty in configuration/environment");
    }

    const startTime = Date.now();
    const messages: Array<{ role: string; content: string }> = [];

    if (request.messages && request.messages.length > 0) {
      for (const m of request.messages) {
        if (m.role === "user" || m.role === "assistant") {
          messages.push({ role: m.role, content: m.content || "" });
        }
      }
    } else {
      messages.push({ role: "user", content: JSON.stringify(request.input) });
    }

    const payload: Record<string, unknown> = {
      model: request.model,
      messages,
      max_tokens: request.maxTokens ?? 2048,
      temperature: request.temperature ?? 0.2,
    };

    if (request.systemInstruction) {
      payload.system = request.systemInstruction;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchFn(`${this.baseUrl}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        if (response.status === 401 || response.status === 403) {
          throw new ModelAuthenticationError("anthropic", `Anthropic Auth Error (HTTP ${response.status}): ${errorText}`);
        }
        if (response.status === 429) {
          throw new ModelRateLimitError("anthropic", `Anthropic Rate Limit Exceeded: ${errorText}`);
        }
        if (response.status >= 500) {
          throw new ModelUnavailableError("anthropic", `Anthropic Service Unavailable (HTTP ${response.status}): ${errorText}`);
        }
        throw new ModelProviderError("anthropic", `Anthropic Request Failed (HTTP ${response.status}): ${errorText}`);
      }

      const data = (await response.json()) as any;
      const latencyMs = Date.now() - startTime;
      const textBlock = data?.content?.find((c: any) => c.type === "text");
      const messageContent = textBlock?.text ?? "";

      let parsedOutput: Record<string, unknown>;
      try {
        parsedOutput = JSON.parse(messageContent);
      } catch {
        parsedOutput = { text: messageContent };
      }

      return {
        output: parsedOutput,
        provider: "anthropic",
        model: request.model,
        content: messageContent,
        usage: {
          inputTokens: data?.usage?.input_tokens ?? 0,
          outputTokens: data?.usage?.output_tokens ?? 0,
          totalTokens: (data?.usage?.input_tokens ?? 0) + (data?.usage?.output_tokens ?? 0),
        },
        latencyMs,
        finishReason: data?.stop_reason ?? "stop",
        metadata: {
          id: data?.id,
          model: data?.model,
        },
      };
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === "AbortError") {
        throw new ModelTimeoutError("anthropic", `Anthropic request timed out after ${this.timeoutMs}ms`);
      }
      if (err instanceof ModelAuthenticationError || err instanceof ModelRateLimitError || err instanceof ModelUnavailableError || err instanceof ModelProviderError) {
        throw err;
      }
      throw new ModelProviderError("anthropic", `Anthropic network error: ${err.message || String(err)}`);
    }
  }
}

export class OllamaModelGateway implements ModelGateway {
  readonly provider = "ollama";
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  private static readonly SUPPORTED_MODELS: readonly ModelDefinition[] = [
    {
      id: "llama3.2",
      provider: "ollama",
      name: "Llama 3.2 Local (8B/3B)",
      capabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT", "STREAMING"],
      contextWindow: 128000,
      maxOutputTokens: 4096,
    },
    {
      id: "mistral",
      provider: "ollama",
      name: "Mistral 7B Local",
      capabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT", "STREAMING"],
      contextWindow: 32768,
      maxOutputTokens: 4096,
    },
  ];

  constructor(config?: ProviderNetworkConfig) {
    this.baseUrl = (config?.baseUrl || process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/+$/, "");
    this.timeoutMs = config?.timeoutMs ?? 60000;
    this.fetchFn = config?.fetchFn || globalThis.fetch;
  }

  async getModel(modelId: string): Promise<ModelDefinition | undefined> {
    return OllamaModelGateway.SUPPORTED_MODELS.find((m) => m.id === modelId);
  }

  async listModels(): Promise<readonly ModelDefinition[]> {
    return [...OllamaModelGateway.SUPPORTED_MODELS];
  }

  async getCapabilities(modelId: string): Promise<readonly ModelCapability[]> {
    const model = await this.getModel(modelId);
    return model?.capabilities ?? [];
  }

  async supports(modelId: string, capability: ModelCapability): Promise<boolean> {
    const caps = await this.getCapabilities(modelId);
    return caps.includes(capability);
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    validateModelRequest(request);

    const startTime = Date.now();
    const messages: Array<{ role: string; content: string }> = [];

    if (request.systemInstruction) {
      messages.push({ role: "system", content: request.systemInstruction });
    }

    if (request.messages && request.messages.length > 0) {
      for (const m of request.messages) {
        if (m.role === "user" || m.role === "assistant" || m.role === "system") {
          messages.push({ role: m.role, content: m.content || "" });
        }
      }
    } else {
      messages.push({ role: "user", content: JSON.stringify(request.input) });
    }

    const payload: Record<string, unknown> = {
      model: request.model,
      messages,
      stream: false,
      options: {
        temperature: request.temperature ?? 0.2,
      },
    };

    if (request.requestedFormat === "json_object" || request.requestedFormat === "json_schema") {
      payload.format = "json";
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchFn(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        if (response.status === 404) {
          throw new ModelInvalidRequestError("ollama", `Ollama model '${request.model}' not found locally. Run: ollama pull ${request.model}`);
        }
        throw new ModelProviderError("ollama", `Ollama request failed (HTTP ${response.status}): ${errorText}`);
      }

      const data = (await response.json()) as any;
      const latencyMs = Date.now() - startTime;
      const messageContent = data?.message?.content ?? "";

      let parsedOutput: Record<string, unknown>;
      try {
        parsedOutput = JSON.parse(messageContent);
      } catch {
        parsedOutput = { text: messageContent };
      }

      return {
        output: parsedOutput,
        provider: "ollama",
        model: request.model,
        content: messageContent,
        usage: {
          inputTokens: data?.prompt_eval_count ?? 0,
          outputTokens: data?.eval_count ?? 0,
          totalTokens: (data?.prompt_eval_count ?? 0) + (data?.eval_count ?? 0),
        },
        latencyMs,
        finishReason: data?.done ? "stop" : "length",
        metadata: {
          total_duration: data?.total_duration,
          load_duration: data?.load_duration,
        },
      };
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === "AbortError") {
        throw new ModelTimeoutError("ollama", `Ollama request timed out after ${this.timeoutMs}ms`);
      }
      if (err instanceof ModelInvalidRequestError || err instanceof ModelProviderError) {
        throw err;
      }
      throw new ModelUnavailableError("ollama", `Ollama daemon is not reachable at ${this.baseUrl}: ${err.message || String(err)}`);
    }
  }
}

import {
  ModelCapability,
  ModelDefinition,
  ModelGateway,
  ModelRequest,
  ModelResponse,
  ModelTimeoutError,
  ModelUnavailableError,
  ModelInvalidRequestError,
  ModelInvalidResponseError,
  ModelProviderError,
  ModelStructuredOutputError,
  StructuredResult,
  validateModelRequest,
} from "../../../domain/model/model-gateway.js";
import { ModelProviderAdapter } from "../../../application/ports/model-provider-port.js";
import { ModelProviderConfig, validateProviderConfig } from "../model-provider-config.js";

export type HttpFetchFn = (
  input: string | URL,
  init?: RequestInit
) => Promise<Response>;

function toJsonSchema(schema: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  if ("properties" in schema && "required" in schema) {
    return { type: "object", properties: schema.properties, required: schema.required, additionalProperties: false };
  }
  return schema;
}

export class OllamaModelGateway implements ModelGateway, ModelProviderAdapter {
  readonly provider = "ollama";
  readonly providerId = "ollama";
  private readonly config: ModelProviderConfig;
  private readonly fetchFn: HttpFetchFn;

  private readonly knownModels: readonly ModelDefinition[] = [
    {
      id: "llama3",
      provider: "ollama",
      name: "Llama 3",
      capabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT", "TOOL_CALLING"],
      contextWindow: 8192,
      maxOutputTokens: 4096,
    },
    {
      id: "mistral",
      provider: "ollama",
      name: "Mistral",
      capabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT", "TOOL_CALLING"],
      contextWindow: 32768,
      maxOutputTokens: 4096,
    },
    {
      id: "qwen2.5",
      provider: "ollama",
      name: "Qwen 2.5",
      capabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT", "TOOL_CALLING"],
      contextWindow: 32768,
      maxOutputTokens: 8192,
    },
  ];

  constructor(config: ModelProviderConfig, customFetch?: HttpFetchFn) {
    validateProviderConfig(config);
    this.config = config;
    this.fetchFn = customFetch ?? (globalThis.fetch.bind(globalThis) as HttpFetchFn);
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    validateModelRequest(request);

    const baseUrl = (this.config.baseUrl ?? "http://127.0.0.1:11434").replace(/\/+$/, "");
    const model = request.model || this.config.defaultModel || "llama3";
    const timeoutMs = this.config.timeoutMs ?? 30000;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const isStructured =
      request.requestedFormat === "json_schema" ||
      request.requestedFormat === "json_object" ||
      request.jsonSchema !== undefined;

    // Construct user prompt representation from request.input or request.objective
    let promptText = "";
    if (request.objective) {
      promptText += `Objective: ${request.objective}\n\n`;
    }
    if (typeof request.input.prompt === "string") {
      promptText += request.input.prompt;
    } else {
      promptText += JSON.stringify(request.input);
    }

    const payload: Record<string, unknown> = {
      model,
      prompt: promptText,
      ...(request.messages ? { messages: request.messages.map((item) => item.role === "tool"
        ? { role: "tool", content: JSON.stringify(item.toolResult.output) }
        : { role: item.role, content: item.content ?? "" }) } : {}),
      stream: false,
      options: {
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        ...(request.maxTokens !== undefined ? { num_predict: request.maxTokens } : {}),
      },
      ...(request.tools ? { tools: request.tools } : {}),
    };

    if (request.systemInstruction) {
      payload.system = request.systemInstruction;
    }

    if (isStructured) {
      payload.format = "json";
    }
    if (request.tools) {
      payload.tools = request.tools.map((tool) => ({
        type: "function",
        function: { name: tool.name, description: tool.description, parameters: toJsonSchema(tool.inputSchema) },
      }));
    }

    const startTime = Date.now();
    let response: Response;

    try {
      response = await this.fetchFn(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if (err instanceof Error) {
        if (err.name === "AbortError") {
          throw new ModelTimeoutError(
            this.provider,
            `Ollama request timed out after ${timeoutMs}ms`
          );
        }

        if (
          "code" in err &&
          (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND" || err.code === "EHOSTUNREACH")
        ) {
          throw new ModelUnavailableError(
            this.provider,
            `Failed to connect to Ollama at ${baseUrl}: ${err.message}`
          );
        }
        if (err.message.includes("fetch failed") || err.message.includes("ECONNREFUSED")) {
          throw new ModelUnavailableError(
            this.provider,
            `Failed to connect to Ollama at ${baseUrl}: ${err.message}`
          );
        }
      }

      throw new ModelProviderError(
        this.provider,
        `Ollama network request failed: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      clearTimeout(timeoutId);
    }

    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      if (response.status === 400 || response.status === 404) {
        throw new ModelInvalidRequestError(
          this.provider,
          `Ollama returned HTTP ${response.status}: ${errorText || response.statusText}`
        );
      }
      if (response.status >= 500) {
        throw new ModelProviderError(
          this.provider,
          `Ollama server error HTTP ${response.status}: ${errorText || response.statusText}`
        );
      }
      throw new ModelProviderError(
        this.provider,
        `Ollama HTTP ${response.status}: ${errorText || response.statusText}`
      );
    }

    let responseData: unknown;
    try {
      responseData = await response.json();
    } catch {
      throw new ModelInvalidResponseError(
        this.provider,
        "Ollama returned invalid non-JSON HTTP response body"
      );
    }

    if (!responseData || typeof responseData !== "object") {
      throw new ModelInvalidResponseError(
        this.provider,
        "Ollama response payload must be a non-null object"
      );
    }

    const data = responseData as Record<string, unknown>;
    const message = data.message as Record<string, unknown> | undefined;
    const rawContent = typeof message?.content === "string" ? message.content : (typeof data.response === "string" ? data.response : "");
    const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls.map((call) => {
      const item = call as Record<string, unknown>;
      return { id: String(item.id ?? ""), name: String(item.name ?? ""), arguments: (item.arguments && typeof item.arguments === "object" ? item.arguments : {}) as Record<string, unknown> };
    }) : [];

    let structuredOutput: Readonly<Record<string, unknown>>;
    if (isStructured) {
      try {
        const parsed = JSON.parse(rawContent.trim());
        if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
          structuredOutput = Object.freeze(parsed as Record<string, unknown>);
        } else {
          structuredOutput = Object.freeze({ data: parsed });
        }
      } catch (parseErr) {
        throw new ModelInvalidResponseError(
          this.provider,
          `Failed to parse structured JSON from Ollama response: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`
        );
      }
    } else {
      structuredOutput = Object.freeze({
        raw: rawContent,
        echoedInput: request.input,
      });
    }

    const promptTokens = typeof data.prompt_eval_count === "number" ? Math.max(0, data.prompt_eval_count) : 0;
    const completionTokens = typeof data.eval_count === "number" ? Math.max(0, data.eval_count) : 0;
    const totalTokens = promptTokens + completionTokens;

    const reportedDuration = typeof data.total_duration === "number" ? Math.round(data.total_duration / 1e6) : latencyMs;
    const finishReason = typeof data.done_reason === "string" ? data.done_reason : (data.done ? "stop" : "unknown");

    return {
      provider: this.provider,
      model,
      content: rawContent,
      output: structuredOutput,
      toolCalls,
      usage: {
        inputTokens: promptTokens,
        outputTokens: completionTokens,
        totalTokens,
      },
      latencyMs: reportedDuration,
      finishReason,
      metadata: {
        provider: "ollama",
        endpoint: baseUrl,
        model,
        done: Boolean(data.done),
        createdAt: data.created_at,
      },
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
      throw new ModelStructuredOutputError("Ollama output failed structured schema parsing", raw.content);
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


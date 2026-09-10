import {
  ModelGateway,
  ModelRequest,
  ModelResponse,
  ModelTimeoutError,
  ModelUnavailableError,
  ModelInvalidRequestError,
  ModelInvalidResponseError,
  ModelProviderError,
  validateModelRequest,
} from "../../../domain/model/model-gateway.js";
import { ModelProviderConfig, validateProviderConfig } from "../model-provider-config.js";

export type HttpFetchFn = (
  input: string | URL,
  init?: RequestInit
) => Promise<Response>;

export class OllamaModelGateway implements ModelGateway {
  readonly provider = "ollama";
  private readonly config: ModelProviderConfig;
  private readonly fetchFn: HttpFetchFn;

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
      stream: false,
      options: {
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        ...(request.maxTokens !== undefined ? { num_predict: request.maxTokens } : {}),
      },
    };

    if (request.systemInstruction) {
      payload.system = request.systemInstruction;
    }

    if (isStructured) {
      payload.format = "json";
    }

    const startTime = Date.now();
    let response: Response;

    try {
      response = await this.fetchFn(`${baseUrl}/api/generate`, {
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
    const rawContent = typeof data.response === "string" ? data.response : "";

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
}

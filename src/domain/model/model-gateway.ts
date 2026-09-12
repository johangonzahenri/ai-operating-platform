export interface ModelUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
}

export type ModelMessage =
  | { readonly role: "system" | "user"; readonly content: string }
  | { readonly role: "assistant"; readonly content?: string | undefined; readonly toolCalls?: readonly ModelToolCall[] | undefined }
  | { readonly role: "tool"; readonly toolResult: ModelToolResult };

export type ModelFinishReason = "stop" | "length" | "tool_calls" | "content_filter" | "error" | string;

export interface ModelRequest {
  readonly traceId: string;
  readonly model: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly systemInstruction?: string | undefined;
  readonly objective?: string | undefined;
  readonly temperature?: number | undefined;
  readonly maxTokens?: number | undefined;
  readonly requestedFormat?: "text" | "json_schema" | "json_object" | undefined;
  readonly jsonSchema?: Readonly<Record<string, unknown>> | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
  readonly tools?: readonly ModelToolDefinition[] | undefined;
  readonly toolResults?: readonly ModelToolResult[] | undefined;
  readonly messages?: readonly ModelMessage[] | undefined;
}

export interface ModelToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
}

export interface ModelToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: Readonly<Record<string, unknown>>;
}

export interface ModelToolResult {
  readonly toolCallId: string;
  readonly name: string;
  readonly output: Readonly<Record<string, unknown>>;
  readonly success: boolean;
}

export interface ModelResponse {
  readonly output: Readonly<Record<string, unknown>>;
  readonly provider: string;
  readonly model: string;
  readonly content?: string | undefined;
  readonly usage?: ModelUsage | undefined;
  readonly latencyMs?: number | undefined;
  readonly finishReason?: ModelFinishReason | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
  readonly toolCalls?: readonly ModelToolCall[] | undefined;
}

// --- Standardized Model Error Hierarchy (v0.9.3) ---

export class ModelValidationError extends Error {
  readonly code = "MODEL_INVALID_REQUEST";
  constructor(message: string) {
    super(message);
    this.name = "ModelValidationError";
  }
}

export class ModelExecutionError extends Error {
  readonly code: string = "MODEL_PROVIDER_ERROR";
  constructor(readonly provider: string, message: string) {
    super(message);
    this.name = "ModelExecutionError";
  }
}

export class ModelAuthenticationError extends ModelExecutionError {
  override readonly code = "MODEL_AUTHENTICATION_ERROR";
  constructor(provider: string, message = "Model provider authentication failed") {
    super(provider, message);
    this.name = "ModelAuthenticationError";
  }
}

export class ModelRateLimitError extends ModelExecutionError {
  override readonly code = "MODEL_RATE_LIMIT_ERROR";
  constructor(provider: string, message = "Model provider rate limit exceeded", readonly retryAfterMs?: number | undefined) {
    super(provider, message);
    this.name = "ModelRateLimitError";
  }
}

export class ModelTimeoutError extends ModelExecutionError {
  override readonly code = "MODEL_TIMEOUT_ERROR";
  constructor(provider: string, message = "Model provider request timed out") {
    super(provider, message);
    this.name = "ModelTimeoutError";
  }
}

export class ModelInvalidRequestError extends ModelExecutionError {
  override readonly code = "MODEL_INVALID_REQUEST";
  constructor(provider: string, message = "Invalid model request parameters") {
    super(provider, message);
    this.name = "ModelInvalidRequestError";
  }
}

export class ModelInvalidResponseError extends ModelExecutionError {
  override readonly code = "MODEL_INVALID_RESPONSE";
  constructor(provider: string, message = "Model provider returned an invalid or unparseable response") {
    super(provider, message);
    this.name = "ModelInvalidResponseError";
  }
}

export class ModelUnavailableError extends ModelExecutionError {
  override readonly code = "MODEL_UNAVAILABLE";
  constructor(provider: string, message = "Model provider service is unavailable") {
    super(provider, message);
    this.name = "ModelUnavailableError";
  }
}

export class ModelProviderError extends ModelExecutionError {
  override readonly code = "MODEL_PROVIDER_ERROR";
  constructor(provider: string, message: string) {
    super(provider, message);
    this.name = "ModelProviderError";
  }
}

export const validateModelRequest = (request: ModelRequest): void => {
  if (typeof request?.traceId !== "string" || request.traceId.trim() === "") {
    throw new ModelValidationError("Model request requires a trace id");
  }
  if (typeof request.model !== "string" || request.model.trim() === "") {
    throw new ModelValidationError("Model request requires a model");
  }
  if (request.input === null || typeof request.input !== "object" || Object.keys(request.input).length === 0) {
    throw new ModelValidationError("Model request requires non-empty input");
  }
};

export interface ModelGateway {
  generate(request: ModelRequest): Promise<ModelResponse>;
}

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

export type ModelCapability =
  | "TEXT_GENERATION"
  | "STRUCTURED_OUTPUT"
  | "TOOL_CALLING"
  | "VISION"
  | "EMBEDDINGS"
  | "STREAMING";

export interface ModelDefinition {
  readonly id: string;
  readonly provider: string;
  readonly name: string;
  readonly capabilities: readonly ModelCapability[];
  readonly contextWindow?: number | undefined;
  readonly maxOutputTokens?: number | undefined;
}

export interface ModelStreamEvent {
  readonly type: "token" | "tool_call" | "finish" | "error";
  readonly delta?: string | undefined;
  readonly toolCall?: ModelToolCall | undefined;
  readonly finishReason?: ModelFinishReason | undefined;
  readonly error?: string | undefined;
}

export class ModelCapabilityUnsupportedError extends Error {
  readonly code = "CAPABILITY_UNSUPPORTED";
  constructor(readonly modelId: string, readonly capability: ModelCapability) {
    super(`Model '${modelId}' does not support required capability '${capability}'`);
    this.name = "ModelCapabilityUnsupportedError";
  }
}

export class ModelNotFoundError extends Error {
  readonly code = "MODEL_NOT_FOUND";
  constructor(readonly modelId: string) {
    super(`Model '${modelId}' was not found in registry`);
    this.name = "ModelNotFoundError";
  }
}

export class ModelSecurityViolationError extends Error {
  readonly code = "SECURITY_MODEL_VIOLATION";
  constructor(message: string) {
    super(message);
    this.name = "ModelSecurityViolationError";
  }
}

export class ModelStructuredOutputError extends Error {
  readonly code = "OUTPUT_INVALID";
  constructor(message: string, readonly rawContent?: string | undefined) {
    super(message);
    this.name = "ModelStructuredOutputError";
  }
}

export const validateModelRequest = (request: ModelRequest): void => {
  if (!request || typeof request !== "object") {
    throw new ModelValidationError("Model request must be a valid object");
  }
  if (typeof request.traceId !== "string" || request.traceId.trim() === "") {
    throw new ModelValidationError("Model request requires a trace id");
  }
  if (typeof request.model !== "string" || request.model.trim() === "") {
    throw new ModelValidationError("Model request requires a model");
  }
  if (request.input === null || typeof request.input !== "object" || Object.keys(request.input).length === 0) {
    throw new ModelValidationError("Model request requires non-empty input");
  }
  // Bounded check for excessive payload size (1MB limit)
  const estimatedSize = JSON.stringify(request.input).length;
  if (estimatedSize > 1048576) {
    throw new ModelValidationError("Model request payload exceeds 1MB limit");
  }
};

export interface StructuredResult<T> {
  readonly output: T;
  readonly raw: ModelResponse;
}

export interface ModelGateway {
  generate(request: ModelRequest): Promise<ModelResponse>;
  generateStructured?<T = Record<string, unknown>>(
    request: ModelRequest,
    schema: Readonly<Record<string, unknown>>
  ): Promise<StructuredResult<T>>;
  getModel?(modelId: string): Promise<ModelDefinition | undefined>;
  listModels?(): Promise<readonly ModelDefinition[]>;
  getCapabilities?(modelId: string): Promise<readonly ModelCapability[]>;
  supports?(modelId: string, capability: ModelCapability): Promise<boolean>;
  stream?(request: ModelRequest): AsyncIterable<ModelStreamEvent>;
}

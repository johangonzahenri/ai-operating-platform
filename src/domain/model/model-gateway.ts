export interface ModelRequest {
  readonly traceId: string;
  readonly model: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export class ModelValidationError extends Error { constructor(message: string) { super(message); this.name = "ModelValidationError"; } }
export class ModelExecutionError extends Error { constructor(readonly provider: string, message: string) { super(message); this.name = "ModelExecutionError"; } }
export class ModelUnavailableError extends ModelExecutionError { constructor(provider: string, message: string) { super(provider, message); this.name = "ModelUnavailableError"; } }
export const validateModelRequest = (request: ModelRequest): void => {
  if (typeof request?.traceId !== "string" || request.traceId.trim() === "") throw new ModelValidationError("Model request requires a trace id");
  if (typeof request.model !== "string" || request.model.trim() === "") throw new ModelValidationError("Model request requires a model");
  if (request.input === null || typeof request.input !== "object" || Object.keys(request.input).length === 0) throw new ModelValidationError("Model request requires non-empty input");
};

export interface ModelUsage { readonly inputTokens?: number; readonly outputTokens?: number; }
export class ModelProviderError extends ModelExecutionError {
  constructor(provider: string, message: string) { super(provider, message); this.name = "ModelProviderError"; }
}

export interface ModelResponse {
  readonly output: Readonly<Record<string, unknown>>;
  readonly provider: string;
  readonly model: string;
  readonly content?: string;
  readonly usage?: ModelUsage;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly finishReason?: string;
}

export interface ModelGateway {
  generate(request: ModelRequest): Promise<ModelResponse>;
}

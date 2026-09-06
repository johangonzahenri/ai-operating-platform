export interface ModelRequest {
  readonly traceId: string;
  readonly model: string;
  readonly input: Readonly<Record<string, unknown>>;
}

export interface ModelResponse {
  readonly output: Readonly<Record<string, unknown>>;
  readonly provider: string;
}

export interface ModelGateway {
  generate(request: ModelRequest): Promise<ModelResponse>;
}

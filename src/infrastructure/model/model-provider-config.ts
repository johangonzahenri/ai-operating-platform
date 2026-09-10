export type SupportedModelProvider = "stub" | "openai" | "anthropic" | "ollama";

export interface ModelProviderConfig {
  readonly provider: SupportedModelProvider;
  readonly defaultModel: string;
  readonly baseUrl?: string | undefined;
  readonly apiKey?: string | undefined;
  readonly timeoutMs?: number | undefined;
  readonly maxRetries?: number | undefined;
}

export class ModelConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelConfigError";
  }
}

export function validateProviderConfig(config: ModelProviderConfig): void {
  if (!config || typeof config !== "object") {
    throw new ModelConfigError("Provider configuration must be a valid object");
  }
  const validProviders: SupportedModelProvider[] = ["stub", "openai", "anthropic", "ollama"];
  if (!validProviders.includes(config.provider)) {
    throw new ModelConfigError(`Unsupported model provider: '${config.provider}'`);
  }
  if (typeof config.defaultModel !== "string" || config.defaultModel.trim() === "") {
    throw new ModelConfigError("defaultModel is required and cannot be empty");
  }
  if (config.timeoutMs !== undefined && (typeof config.timeoutMs !== "number" || config.timeoutMs <= 0)) {
    throw new ModelConfigError("timeoutMs must be a positive integer");
  }
}

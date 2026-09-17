export type SupportedModelProvider = "stub" | "openai" | "anthropic" | "ollama" | "gemini";

export interface ModelProviderConfig {
  readonly provider: SupportedModelProvider;
  readonly defaultModel: string;
  readonly baseUrl?: string | undefined;
  readonly apiKey?: string | undefined;
  readonly timeoutMs?: number | undefined;
  readonly maxRetries?: number | undefined;
}

export interface ModelEnvironment {
  readonly MODEL_PROVIDER?: string;
  readonly MODEL_NAME?: string;
  readonly MODEL_REQUEST_TIMEOUT_MS?: string;
  readonly MODEL_MAX_RETRIES?: string;
  readonly OPENAI_API_KEY?: string;
  readonly OPENAI_MODEL?: string;
  readonly OPENAI_BASE_URL?: string;
  readonly ANTHROPIC_API_KEY?: string;
  readonly ANTHROPIC_MODEL?: string;
  readonly ANTHROPIC_BASE_URL?: string;
  readonly OLLAMA_MODEL?: string;
  readonly OLLAMA_BASE_URL?: string;
  readonly GEMINI_API_KEY?: string;
  readonly GEMINI_MODEL?: string;
  readonly GEMINI_BASE_URL?: string;
}

export class ModelConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelConfigError";
  }
}

export function validateProviderConfig(config: ModelProviderConfig): void {
  if (!config || typeof config !== "object") throw new ModelConfigError("Provider configuration must be a valid object");
  if (!["stub", "openai", "anthropic", "ollama", "gemini"].includes(config.provider)) {
    throw new ModelConfigError(`Unsupported model provider: '${config.provider}'`);
  }
  if (typeof config.defaultModel !== "string" || config.defaultModel.trim() === "") {
    throw new ModelConfigError("defaultModel is required and cannot be empty");
  }
  if (config.timeoutMs !== undefined && (!Number.isInteger(config.timeoutMs) || config.timeoutMs <= 0)) {
    throw new ModelConfigError("timeoutMs must be a positive integer");
  }
  if (config.maxRetries !== undefined && (!Number.isInteger(config.maxRetries) || config.maxRetries < 0)) {
    throw new ModelConfigError("maxRetries must be a non-negative integer");
  }
}

export function modelProviderConfigFromEnvironment(environment: ModelEnvironment = process.env): ModelProviderConfig {
  const provider = (environment.MODEL_PROVIDER ?? "stub").trim().toLowerCase() as SupportedModelProvider;
  const defaults: Record<SupportedModelProvider, string> = {
    stub: "stub-model",
    openai: environment.OPENAI_MODEL ?? environment.MODEL_NAME ?? "gpt-4o-mini",
    anthropic: environment.ANTHROPIC_MODEL ?? environment.MODEL_NAME ?? "claude-3-5-haiku-latest",
    ollama: environment.OLLAMA_MODEL ?? environment.MODEL_NAME ?? "llama3",
    gemini: environment.GEMINI_MODEL ?? environment.MODEL_NAME ?? "gemini-1.5-flash",
  };
  const timeoutMs = environment.MODEL_REQUEST_TIMEOUT_MS === undefined ? undefined : Number(environment.MODEL_REQUEST_TIMEOUT_MS);
  const maxRetries = environment.MODEL_MAX_RETRIES === undefined ? undefined : Number(environment.MODEL_MAX_RETRIES);
  const config: ModelProviderConfig = {
    provider,
    defaultModel: defaults[provider] ?? defaults.stub,
    ...(provider === "openai" ? { apiKey: environment.OPENAI_API_KEY, baseUrl: environment.OPENAI_BASE_URL ?? "https://api.openai.com/v1" } : {}),
    ...(provider === "anthropic" ? { apiKey: environment.ANTHROPIC_API_KEY, baseUrl: environment.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com" } : {}),
    ...(provider === "ollama" ? { baseUrl: environment.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434" } : {}),
    ...(provider === "gemini" ? { apiKey: environment.GEMINI_API_KEY, baseUrl: environment.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta" } : {}),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    ...(maxRetries !== undefined ? { maxRetries } : {}),
  };
  validateProviderConfig(config);
  return config;
}

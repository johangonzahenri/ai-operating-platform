import {
  ModelCapability,
  ModelDefinition,
  ModelGateway,
  ModelRequest,
  ModelResponse,
  ModelStreamEvent,
  StructuredResult,
} from "../../domain/model/model-gateway.js";
import { ModelProviderAdapter } from "../../application/ports/model-provider-port.js";
import { AnthropicModelGateway } from "./anthropic/anthropic-model-gateway.js";
import { modelProviderConfigFromEnvironment, ModelEnvironment, ModelProviderConfig } from "./model-provider-config.js";
import { OllamaModelGateway } from "./ollama/ollama-model-gateway.js";
import { OpenAIModelGateway } from "./openai/openai-model-gateway.js";
import { StubModelGateway } from "./stub-model-gateway.js";

export class ProviderFactory {
  private readonly adapters = new Map<string, ModelProviderAdapter>();

  constructor(adapters: readonly ModelProviderAdapter[] = []) {
    for (const adapter of adapters) {
      this.registerAdapter(adapter);
    }
  }

  registerAdapter(adapter: ModelProviderAdapter): void {
    this.adapters.set(adapter.providerId.toLowerCase(), adapter);
  }

  resolveProvider(providerId: string): ModelProviderAdapter {
    const key = (providerId || "").trim().toLowerCase();
    const adapter = this.adapters.get(key);
    if (!adapter) {
      throw new Error(`Model provider '${providerId}' is unknown or not configured`);
    }
    return adapter;
  }

  listProviders(): readonly string[] {
    return Array.from(this.adapters.keys());
  }

  hasProvider(providerId: string): boolean {
    return this.adapters.has((providerId || "").trim().toLowerCase());
  }
}

export function createDefaultProviderFactory(environment?: ModelEnvironment): ProviderFactory {
  const config = modelProviderConfigFromEnvironment(environment);
  const factory = new ProviderFactory();

  // Always register deterministic stub for testing and fallback
  factory.registerAdapter(new StubModelGateway());

  // Register OpenAI adapter
  const openAiConfig: ModelProviderConfig = {
    provider: "openai",
    defaultModel: config.provider === "openai" ? config.defaultModel : "gpt-4o-mini",
    apiKey: environment?.OPENAI_API_KEY,
    baseUrl: environment?.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    timeoutMs: config.timeoutMs,
    maxRetries: config.maxRetries,
  };
  factory.registerAdapter(new OpenAIModelGateway(openAiConfig));

  // Register Anthropic adapter
  const anthropicConfig: ModelProviderConfig = {
    provider: "anthropic",
    defaultModel: config.provider === "anthropic" ? config.defaultModel : "claude-3-5-haiku-latest",
    apiKey: environment?.ANTHROPIC_API_KEY,
    baseUrl: environment?.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com",
    timeoutMs: config.timeoutMs,
    maxRetries: config.maxRetries,
  };
  factory.registerAdapter(new AnthropicModelGateway(anthropicConfig));

  // Register Ollama adapter
  const ollamaConfig: ModelProviderConfig = {
    provider: "ollama",
    defaultModel: config.provider === "ollama" ? config.defaultModel : "llama3",
    baseUrl: environment?.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434",
    timeoutMs: config.timeoutMs,
    maxRetries: config.maxRetries,
  };
  factory.registerAdapter(new OllamaModelGateway(ollamaConfig));

  return factory;
}

export function createModelGateway(environment?: ModelEnvironment): ModelGateway {
  const config = modelProviderConfigFromEnvironment(environment);
  switch (config.provider) {
    case "openai": return new OpenAIModelGateway(config);
    case "anthropic": return new AnthropicModelGateway(config);
    case "ollama": return new OllamaModelGateway(config);
    case "stub":
    default: return new StubModelGateway();
  }
}

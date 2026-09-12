import { ModelGateway } from "../../domain/model/model-gateway.js";
import { AnthropicModelGateway } from "./anthropic/anthropic-model-gateway.js";
import { modelProviderConfigFromEnvironment, ModelEnvironment } from "./model-provider-config.js";
import { OllamaModelGateway } from "./ollama/ollama-model-gateway.js";
import { OpenAIModelGateway } from "./openai/openai-model-gateway.js";
import { StubModelGateway } from "./stub-model-gateway.js";

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

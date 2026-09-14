import {
  ModelCapability,
  ModelDefinition,
  ModelRequest,
  ModelResponse,
  ModelStreamEvent,
} from "../../domain/model/model-gateway.js";

export interface ModelProviderAdapter {
  readonly providerId: string;
  generate(request: ModelRequest): Promise<ModelResponse>;
  listSupportedModels(): Promise<readonly ModelDefinition[]>;
  supports(modelId: string, capability: ModelCapability): Promise<boolean>;
  stream?(request: ModelRequest): AsyncIterable<ModelStreamEvent>;
}

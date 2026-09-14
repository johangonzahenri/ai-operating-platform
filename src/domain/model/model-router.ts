import { SecurityContext } from "../security/security.js";
import { ModelCapability, ModelDefinition, ModelRequest } from "./model-gateway.js";

export interface ModelRoutingRequest {
  readonly modelRequest: ModelRequest;
  readonly securityContext?: SecurityContext | undefined;
  readonly requiredCapabilities?: readonly ModelCapability[] | undefined;
  readonly preferredProvider?: string | undefined;
  readonly fallbackAllowed?: boolean | undefined;
  readonly fallbackChain?: readonly string[] | undefined;
}

export interface ModelRoutingDecision {
  readonly selectedModel: ModelDefinition;
  readonly providerId: string;
  readonly fallbackChain: readonly string[];
  readonly reason: string;
}

export interface ModelRouter {
  route(request: ModelRoutingRequest): Promise<ModelRoutingDecision>;
}

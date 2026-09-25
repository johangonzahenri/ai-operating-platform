import {
  ModelGateway,
  ModelRequest,
  ModelResponse,
  ModelDefinition,
  ModelSecurityViolationError,
  ModelExecutionError,
} from "../../domain/model/model-gateway.js";
import {
  ModelRouter,
  ModelRoutingRequest,
  ModelRoutingDecision,
} from "../../domain/model/model-router.js";
import { StubModelGateway } from "../../infrastructure/model/stub-model-gateway.js";
import { TaintedValue } from "../../domain/security/taint-tracking.js";

export interface GovernedModelRouterOptions {
  readonly primaryGateway?: ModelGateway;
  readonly fallbackGateways?: readonly ModelGateway[];
  readonly maxPromptLength?: number;
  readonly blockedPatterns?: readonly RegExp[];
}

export class GovernedModelRouter implements ModelRouter {
  private readonly primaryGateway: ModelGateway;
  private readonly fallbackGateways: readonly ModelGateway[];
  private readonly maxPromptLength: number;
  private readonly blockedPatterns: readonly RegExp[];
  private readonly registeredGateways: Map<string, ModelGateway> = new Map();

  constructor(options?: GovernedModelRouterOptions) {
    this.primaryGateway = options?.primaryGateway ?? new StubModelGateway();
    this.fallbackGateways = options?.fallbackGateways ?? [new StubModelGateway()];
    this.maxPromptLength = options?.maxPromptLength ?? 50000;
    this.blockedPatterns = options?.blockedPatterns ?? [
      /ignore\s+all\s+previous\s+instructions/i,
      /disregard\s+system\s+prompt/i,
      /reveal\s+system\s+credentials/i,
      /dump_environment_keys/i,
    ];

    this.registerGateway(this.primaryGateway);
    for (const gw of this.fallbackGateways) {
      this.registerGateway(gw);
    }
  }

  private getGatewayProviderName(gw: ModelGateway): string {
    return (gw as any).provider || (gw as any).providerId || "stub";
  }

  registerGateway(gw: ModelGateway): void {
    const providerName = this.getGatewayProviderName(gw);
    this.registeredGateways.set(providerName, gw);
  }

  async route(request: ModelRoutingRequest): Promise<ModelRoutingDecision> {
    // GAP-01: Isolate untrusted input into explicit data envelope if passed as TaintedValue
    const inputPayload = formatModelInputWithTaintEnvelopes(request.modelRequest.input);
    const rawPrompt = JSON.stringify(inputPayload);

    // 1. Guardrail: Max prompt length check
    if (rawPrompt.length > this.maxPromptLength) {
      throw new ModelSecurityViolationError(
        `Prompt size (${rawPrompt.length} chars) exceeds maximum safety limit of ${this.maxPromptLength} chars`
      );
    }

    // 2. Guardrail: Prompt injection detection
    for (const pattern of this.blockedPatterns) {
      if (pattern.test(rawPrompt)) {
        throw new ModelSecurityViolationError(
          `Security Guardrail: Input matches prohibited adversarial pattern: ${pattern.source}`
        );
      }
    }

    const preferred = request.preferredProvider;
    let targetGateway = this.primaryGateway;
    let reason = "Default primary gateway selected";

    if (preferred && this.registeredGateways.has(preferred)) {
      targetGateway = this.registeredGateways.get(preferred)!;
      reason = `User preferred provider '${preferred}' selected`;
    }

    const providerId = this.getGatewayProviderName(targetGateway);
    const selectedModel: ModelDefinition = {
      id: request.modelRequest.model,
      provider: providerId,
      name: `${providerId}-${request.modelRequest.model}`,
      capabilities: request.requiredCapabilities ?? ["TEXT_GENERATION"],
    };

    const fallbackChain = this.fallbackGateways
      .map((g) => this.getGatewayProviderName(g))
      .filter((p) => p !== providerId);

    return {
      selectedModel,
      providerId,
      fallbackChain,
      reason,
    };
  }

  async executeWithGovernance(
    request: ModelRequest,
    preferredProvider?: string
  ): Promise<ModelResponse> {
    const routingDecision = await this.route({
      modelRequest: request,
      preferredProvider,
    });

    const gatewaysToTry: ModelGateway[] = [];
    const targetGateway = this.registeredGateways.get(routingDecision.providerId) || this.primaryGateway;
    gatewaysToTry.push(targetGateway);

    for (const fbProvider of routingDecision.fallbackChain) {
      const fbGateway = this.registeredGateways.get(fbProvider);
      if (fbGateway && !gatewaysToTry.includes(fbGateway)) {
        gatewaysToTry.push(fbGateway);
      }
    }

    // Also include any fallbackGateways that were passed into constructor
    for (const fbGateway of this.fallbackGateways) {
      if (!gatewaysToTry.includes(fbGateway)) {
        gatewaysToTry.push(fbGateway);
      }
    }

    let lastError: Error | undefined;
    for (const gw of gatewaysToTry) {
      try {
        const res = await gw.generate(request);
        return res;
      } catch (err: any) {
        lastError = err;
        // If security violation, never fallback, fail closed immediately
        if (err instanceof ModelSecurityViolationError) {
          throw err;
        }
        // Continue to fallback on execution or provider errors
      }
    }

    throw lastError || new ModelExecutionError("governed-router", "All model gateways in fallback chain failed");
  }
}

/**
 * Transforms any TaintedValue instances in model inputs into explicit tagged envelopes:
 * `<untrusted_content provenance="..." status="...">...</untrusted_content>`
 * This informs LLMs that the contained text is strictly data, preventing prompt confusion.
 */
export function formatModelInputWithTaintEnvelopes(val: unknown): unknown {
  if (val === null || typeof val !== "object") {
    return val;
  }

  if (val instanceof TaintedValue) {
    if (val.isTainted) {
      return {
        _untrusted_content_envelope: {
          provenance: val.provenance.originId,
          sourceKind: val.provenance.sourceKind,
          trustStatus: val.trustStatus,
          data: formatModelInputWithTaintEnvelopes(val.value),
        },
      };
    }
    return formatModelInputWithTaintEnvelopes(val.value);
  }

  if (Array.isArray(val)) {
    return val.map((item) => formatModelInputWithTaintEnvelopes(item));
  }

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(val as Record<string, unknown>)) {
    result[key] = formatModelInputWithTaintEnvelopes(item);
  }
  return result;
}

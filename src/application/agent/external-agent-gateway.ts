import {
  ExternalAgentProviderAdapter,
  ExternalAgentProviderDefinition,
  ExternalAgentInvocationRequest,
  ExternalAgentInvocationResult,
  ExternalAgentProviderNotFoundError,
  ExternalAgentProviderUnavailableError,
} from "../../domain/agent/external-agent-provider.js";
import { PolicyGateway } from "../../domain/policy/policy.js";
import { EventPublisher, event } from "../../domain/events/events.js";

export interface ExternalAgentGatewayOptions {
  readonly policyGateway?: PolicyGateway | undefined;
  readonly events: EventPublisher;
  readonly now?: (() => Date) | undefined;
}

export class ExternalAgentGateway {
  private readonly providers: Map<string, ExternalAgentProviderAdapter> = new Map();
  private readonly policyGateway?: PolicyGateway | undefined;
  private readonly events: EventPublisher;
  private readonly now: () => Date;

  constructor(options: ExternalAgentGatewayOptions) {
    this.policyGateway = options.policyGateway;
    this.events = options.events;
    this.now = options.now ?? (() => new Date());
  }

  registerProvider(adapter: ExternalAgentProviderAdapter): void {
    this.providers.set(adapter.definition.providerId, adapter);
  }

  unregisterProvider(providerId: string): boolean {
    return this.providers.delete(providerId);
  }

  getProvider(providerId: string): ExternalAgentProviderAdapter | undefined {
    return this.providers.get(providerId);
  }

  listProviders(): readonly ExternalAgentProviderDefinition[] {
    return Array.from(this.providers.values()).map((p) => p.definition);
  }

  async invokeExternalAgent(request: ExternalAgentInvocationRequest): Promise<ExternalAgentInvocationResult> {
    const startedAt = this.now();
    const adapter = this.providers.get(request.providerId);
    if (!adapter) {
      throw new ExternalAgentProviderNotFoundError(request.providerId);
    }

    if (adapter.definition.status !== "READY" && adapter.definition.status !== "DEGRADED") {
      throw new ExternalAgentProviderUnavailableError(
        request.providerId,
        `Provider status is '${adapter.definition.status}'`
      );
    }

    // Policy Gateway preflight check
    if (this.policyGateway) {
      const decision = await this.policyGateway.evaluate({
        traceId: request.traceId,
        taskId: request.taskId,
        operationType: "MODEL",
        resourceId: request.providerId,
        agentId: request.agentId,
        action: "external.agent.invoke",
        input: request.input,
      });

      if (!decision.allowed) {
        this.events.publish(
          event("external_agent.rejected", request.traceId, request.providerId, {
            providerId: request.providerId,
            agentId: request.agentId,
            reason: decision.reason,
          }, undefined, this.now(), { taskId: request.taskId })
        );
        return {
          providerId: request.providerId,
          agentId: request.agentId,
          status: "POLICY_REJECTED",
          output: {},
          error: { code: "POLICY_REJECTED", message: decision.reason ?? "Policy denied external agent execution" },
          executionTimeMs: Math.max(0, this.now().getTime() - startedAt.getTime()),
        };
      }
    }

    this.events.publish(
      event("external_agent.dispatched", request.traceId, request.providerId, {
        providerId: request.providerId,
        agentId: request.agentId,
        type: adapter.definition.type,
      }, undefined, this.now(), { taskId: request.taskId })
    );

    try {
      const result = await adapter.invoke(request);
      this.events.publish(
        event("external_agent.completed", request.traceId, request.providerId, {
          providerId: request.providerId,
          agentId: request.agentId,
          status: result.status,
          executionTimeMs: result.executionTimeMs,
        }, undefined, this.now(), { taskId: request.taskId })
      );
      return result;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unknown external agent execution failure";
      this.events.publish(
        event("external_agent.failed", request.traceId, request.providerId, {
          providerId: request.providerId,
          agentId: request.agentId,
          error: message,
        }, undefined, this.now(), { taskId: request.taskId })
      );
      return {
        providerId: request.providerId,
        agentId: request.agentId,
        status: "FAILED",
        output: {},
        error: { code: "EXTERNAL_EXECUTION_ERROR", message },
        executionTimeMs: Math.max(0, this.now().getTime() - startedAt.getTime()),
      };
    }
  }
}

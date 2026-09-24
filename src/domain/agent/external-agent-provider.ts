import { AgentTaxonomyType } from "./agent-taxonomy.js";

export type AgentProviderType =
  | "NATIVE"
  | "LOCAL"
  | "EXTERNAL"
  | "REMOTE"
  | "CLI"
  | "SANDBOXED";

export type AgentProviderStatus = "READY" | "DEGRADED" | "UNAVAILABLE" | "DISABLED";

export interface ExternalAgentProviderDefinition {
  readonly providerId: string;
  readonly name: string;
  readonly type: AgentProviderType;
  readonly version: string;
  readonly supportedTaxonomies: readonly AgentTaxonomyType[];
  readonly capabilities: readonly string[];
  readonly status: AgentProviderStatus;
  readonly sandboxed: boolean;
  readonly requiresAuthentication: boolean;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export interface ExternalAgentInvocationRequest {
  readonly providerId: string;
  readonly agentId: string;
  readonly traceId: string;
  readonly taskId: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly timeoutMs?: number | undefined;
  readonly sandboxConstraints?: Readonly<{
    readonly allowNetwork?: boolean;
    readonly allowFileSystem?: boolean;
    readonly maxMemoryMb?: number;
  }> | undefined;
}

export interface ExternalAgentInvocationResult {
  readonly providerId: string;
  readonly agentId: string;
  readonly status: "COMPLETED" | "FAILED" | "TIMEOUT" | "POLICY_REJECTED";
  readonly output: Readonly<Record<string, unknown>>;
  readonly error?: Readonly<{ code: string; message: string }> | undefined;
  readonly executionTimeMs: number;
  readonly evidenceTokens?: readonly string[] | undefined;
}

export interface ExternalAgentProviderAdapter {
  readonly definition: ExternalAgentProviderDefinition;
  invoke(request: ExternalAgentInvocationRequest): Promise<ExternalAgentInvocationResult>;
  healthCheck?(): Promise<{ healthy: boolean; latencyMs: number; message?: string }>;
}

export class ExternalAgentProviderNotFoundError extends Error {
  readonly code = "EXTERNAL_AGENT_PROVIDER_NOT_FOUND";
  constructor(readonly providerId: string) {
    super(`External agent provider not found: '${providerId}'`);
    this.name = "ExternalAgentProviderNotFoundError";
  }
}

export class ExternalAgentProviderUnavailableError extends Error {
  readonly code = "EXTERNAL_AGENT_PROVIDER_UNAVAILABLE";
  constructor(readonly providerId: string, message: string) {
    super(`External agent provider '${providerId}' is unavailable: ${message}`);
    this.name = "ExternalAgentProviderUnavailableError";
  }
}

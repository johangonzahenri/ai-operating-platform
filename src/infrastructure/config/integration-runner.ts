import {
  IntegrationTruthEngine,
  IntegrationEngineConfig,
  IntegrationTruthRecord,
} from "./integration-truth-engine.js";

export type IntegrationStatus =
  | "NOT_CONFIGURED"
  | "CONFIGURED_OFFLINE"
  | "OPERATIONAL"
  | "DESIGNED"
  | "CONNECTED"
  | "HEALTHY";

export interface IntegrationCheckResult {
  readonly integration: string;
  readonly status: IntegrationStatus;
  readonly latencyMs?: number | undefined;
  readonly error?: string | undefined;
  readonly details: Readonly<Record<string, unknown>>;
}

export type IntegrationRunnerConfig = IntegrationEngineConfig;

export class IntegrationRunner {
  private readonly truthEngine: IntegrationTruthEngine;
  private readonly config: IntegrationRunnerConfig;

  constructor(config: IntegrationRunnerConfig = {}) {
    this.config = config;
    this.truthEngine = new IntegrationTruthEngine(config);
  }

  getTruthEngine(): IntegrationTruthEngine {
    return this.truthEngine;
  }

  async checkOpenAi(): Promise<IntegrationCheckResult> {
    const record = await this.truthEngine.verifyOpenAi();
    let status: IntegrationStatus = "NOT_CONFIGURED";
    if (record.runtime === "OPERATIONAL") status = "OPERATIONAL";
    else if (record.configuration === "CONFIGURED") status = "CONFIGURED_OFFLINE";

    return {
      integration: "OpenAI",
      status,
      latencyMs: record.latencyMs,
      error: record.error,
      details: record.evidence?.metadata ?? (record.error ? { reason: record.error } : {}),
    };
  }

  async checkAnthropic(): Promise<IntegrationCheckResult> {
    const record = await this.truthEngine.verifyAnthropic();
    let status: IntegrationStatus = "NOT_CONFIGURED";
    if (record.runtime === "OPERATIONAL") status = "OPERATIONAL";
    else if (record.configuration === "CONFIGURED") status = "CONFIGURED_OFFLINE";

    return {
      integration: "Anthropic",
      status,
      latencyMs: record.latencyMs,
      error: record.error,
      details: record.evidence?.metadata ?? (record.error ? { reason: record.error } : {}),
    };
  }

  async checkOllama(): Promise<IntegrationCheckResult> {
    const record = await this.truthEngine.verifyOllama();
    let status: IntegrationStatus = "NOT_CONFIGURED";
    if (record.runtime === "OPERATIONAL") status = "OPERATIONAL";
    else if (record.connectivity === "NOT_RUNNING") status = "NOT_CONFIGURED";
    else if (record.configuration === "CONFIGURED") status = "CONFIGURED_OFFLINE";

    return {
      integration: "Ollama",
      status,
      latencyMs: record.latencyMs,
      error: record.error,
      details: record.evidence?.metadata ?? { baseUrl: this.config.ollamaBaseUrl || "http://localhost:11434" },
    };
  }

  async checkN8n(): Promise<IntegrationCheckResult> {
    const record = await this.truthEngine.verifyN8n();
    let status: IntegrationStatus = "DESIGNED";
    if (record.runtime === "OPERATIONAL") status = "OPERATIONAL";
    else if (record.configuration === "NOT_CONFIGURED") status = "DESIGNED";

    return {
      integration: "n8n",
      status,
      latencyMs: record.latencyMs,
      error: record.error,
      details: record.evidence?.metadata ?? { manifestVersion: "1.1.0", connectorStatus: "Manifest Registered" },
    };
  }

  async checkAll(): Promise<readonly IntegrationCheckResult[]> {
    return Promise.all([
      this.checkOpenAi(),
      this.checkAnthropic(),
      this.checkOllama(),
      this.checkN8n(),
    ]);
  }
}

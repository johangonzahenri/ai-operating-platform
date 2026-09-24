import { AgentEvaluation, EvaluationType } from "../../domain/agent/agent-evaluation.js";
import { AgentLifecycleService } from "./agent-lifecycle-service.js";
import { AgentProfileRepositoryPort } from "../ports/agent-profile-repository-port.js";
import { ToolInvocationRuntime } from "../tools/tool-invocation-runtime.js";

export interface BenchmarkScenario {
  readonly id: string;
  readonly name: string;
  readonly evaluationType: EvaluationType;
  readonly targetTaxonomy: string;
  readonly requiredCapabilities: readonly string[];
  readonly inputPayload: Readonly<Record<string, unknown>>;
  readonly expectedSchemaKeys: readonly string[];
  readonly maxAllowedLatencyMs: number;
  readonly criteriaReference: string;
}

export interface ScenarioExecutionResult {
  readonly scenarioId: string;
  readonly pass: boolean;
  readonly taskSuccess: boolean;
  readonly schemaCorrectness: boolean;
  readonly evidenceCompleteness: boolean;
  readonly latencyMs: number;
  readonly score: number; // 0.0 to 1.0
  readonly details: Readonly<Record<string, unknown>>;
}

export interface AgentBenchmarkReport {
  readonly agentId: string;
  readonly tenantId: string;
  readonly profileVersion: number;
  readonly overallVerdict: "PASS" | "FAIL";
  readonly totalScenarios: number;
  readonly passedScenarios: number;
  readonly averageScore: number;
  readonly averageLatencyMs: number;
  readonly results: readonly ScenarioExecutionResult[];
  readonly generatedEvaluationId?: string | undefined;
}

export class AgentEvaluationHarness {
  constructor(
    private readonly lifecycleService: AgentLifecycleService,
    private readonly profileRepo: AgentProfileRepositoryPort,
    private readonly toolRuntime?: ToolInvocationRuntime | undefined
  ) {}

  async runScenario(
    agentId: string,
    scenario: BenchmarkScenario,
    executor: (input: Readonly<Record<string, unknown>>) => Promise<Readonly<Record<string, unknown>>>
  ): Promise<ScenarioExecutionResult> {
    const started = Date.now();
    let taskSuccess = false;
    let schemaCorrectness = false;
    let evidenceCompleteness = false;
    let output: Readonly<Record<string, unknown>> = {};

    try {
      output = await executor(scenario.inputPayload);
      taskSuccess = true;
      const keys = Object.keys(output);
      schemaCorrectness = scenario.expectedSchemaKeys.every((k) => keys.includes(k));
      evidenceCompleteness = Boolean(output.evidence || output.evidenceClaims || output.results || output.output);
    } catch (err) {
      taskSuccess = false;
    }

    const latencyMs = Math.max(1, Date.now() - started);
    const latencyPass = latencyMs <= scenario.maxAllowedLatencyMs;
    const pass = taskSuccess && schemaCorrectness && latencyPass;

    let score = 0;
    if (taskSuccess) score += 0.4;
    if (schemaCorrectness) score += 0.3;
    if (evidenceCompleteness) score += 0.2;
    if (latencyPass) score += 0.1;

    return Object.freeze({
      scenarioId: scenario.id,
      pass,
      taskSuccess,
      schemaCorrectness,
      evidenceCompleteness,
      latencyMs,
      score: Number(score.toFixed(2)),
      details: Object.freeze({ output, latencyPass }),
    });
  }

  async evaluateAgentComprehensive(
    agentId: string,
    tenantId: string,
    evaluatorPrincipalId: string,
    scenarios: readonly BenchmarkScenario[],
    executor: (input: Readonly<Record<string, unknown>>) => Promise<Readonly<Record<string, unknown>>>
  ): Promise<AgentBenchmarkReport> {
    const profile = await this.profileRepo.findByAgentId(agentId);
    if (!profile) {
      throw new Error(`Cannot benchmark agent '${agentId}': Profile not found`);
    }

    const results: ScenarioExecutionResult[] = [];
    for (const sc of scenarios) {
      const res = await this.runScenario(agentId, sc, executor);
      results.push(res);
    }

    const totalScenarios = results.length;
    const passedScenarios = results.filter((r) => r.pass).length;
    const averageScore = totalScenarios > 0 ? results.reduce((acc, r) => acc + r.score, 0) / totalScenarios : 0;
    const averageLatencyMs = totalScenarios > 0 ? results.reduce((acc, r) => acc + r.latencyMs, 0) / totalScenarios : 0;
    const overallVerdict: "PASS" | "FAIL" = passedScenarios === totalScenarios && totalScenarios > 0 ? "PASS" : "FAIL";

    const evalRecord = await this.lifecycleService.evaluateAgent({
      tenantId,
      agentId,
      evaluatorPrincipalId,
      evaluationType: "REGRESSION_CHECK",
      criteriaReference: "AOP-AGENT-BENCHMARK-V1",
      verdict: overallVerdict,
      evidence: {
        totalScenarios,
        passedScenarios,
        averageScore: Number(averageScore.toFixed(2)),
        averageLatencyMs: Math.round(averageLatencyMs),
        results,
      },
    });

    return Object.freeze({
      agentId,
      tenantId,
      profileVersion: profile.version,
      overallVerdict,
      totalScenarios,
      passedScenarios,
      averageScore: Number(averageScore.toFixed(2)),
      averageLatencyMs: Math.round(averageLatencyMs),
      results: Object.freeze(results),
      generatedEvaluationId: evalRecord.id,
    });
  }
}

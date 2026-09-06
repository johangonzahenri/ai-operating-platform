import { AgentDefinition } from "../../domain/agent/agent.js";
import { ExecutionCancelledError } from "../../domain/execution/execution.js";
import { ExecutionContext } from "../../domain/execution/execution-context.js";
import { ExecutionStrategy, ExecutionStrategyResult } from "../../domain/execution/execution-strategy.js";
import { OrchestrationRequest, Orchestrator } from "../../domain/orchestration/orchestration.js";
import { Task } from "../../domain/task/task.js";

export type OrchestrationPlan = (context: ExecutionContext, task: Task, agent: AgentDefinition) => OrchestrationRequest;
/** Bridges the v0.2 runtime strategy port to a declared v0.4 orchestration plan. */
export class OrchestratedExecutionStrategy implements ExecutionStrategy {
  constructor(private readonly orchestrator: Orchestrator, private readonly plan: OrchestrationPlan) {}
  async execute(context: ExecutionContext, task: Task, agent: AgentDefinition): Promise<ExecutionStrategyResult> {
    const result = await this.orchestrator.execute(this.plan(context, task, agent));
    if (result.status === "CANCELLED") throw new ExecutionCancelledError();
    if (result.status === "FAILED") throw result.operations.at(-1)?.error ?? new Error("Orchestration failed");
    return { output: result.output ?? {}, metadata: { operationCount: result.operations.length } };
  }
}

import { Plan, PlanStep } from "../../domain/autonomy/plan.js";
import { ToolGateway, ToolResult } from "../../domain/tools/tool-registry.js";
import { ExecutionContext } from "../../domain/execution/execution-context.js";
import { SecurityContext } from "../../domain/security/security.js";
import { EventPublisher, event } from "../../domain/events/events.js";
import { ToolInvocationRuntime, CancellationToken } from "../tools/tool-invocation-runtime.js";

export type StepExecutionStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "SKIPPED"
  | "CANCELLED";

export interface StepExecutionRecord {
  readonly stepId: string;
  readonly order: number;
  readonly action: string;
  readonly status: StepExecutionStatus;
  readonly output?: Readonly<Record<string, unknown>> | undefined;
  readonly error?: { readonly code: string; readonly message: string } | undefined;
  readonly startedAt?: Date | undefined;
  readonly completedAt?: Date | undefined;
  readonly durationMs?: number | undefined;
}

export interface PlanExecutionOptions {
  readonly plan: Plan;
  readonly toolGateway: ToolGateway;
  readonly context: ExecutionContext;
  readonly securityContext?: SecurityContext | undefined;
  readonly agentId?: string | undefined;
  readonly events?: EventPublisher | undefined;
  readonly cancellationToken?: CancellationToken | undefined;
  readonly allowPartialBranchFailure?: boolean | undefined;
  readonly now?: (() => Date) | undefined;
}

export interface PlanExecutionReport {
  readonly planId: string;
  readonly operationId: string;
  readonly status: "COMPLETED" | "FAILED" | "CANCELLED" | "PARTIALLY_FAILED";
  readonly steps: readonly StepExecutionRecord[];
  readonly outputs: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly totalSteps: number;
  readonly completedSteps: number;
  readonly failedSteps: number;
  readonly skippedSteps: number;
  readonly durationMs: number;
  readonly error?: { readonly code: string; readonly message: string } | undefined;
}

/**
 * PlanExecutionEngine executes a DAG-validated Plan step-by-step.
 *
 * Invariants:
 * 1. Executes steps strictly in topological order only when all declared dependencies have SUCCEEDED.
 * 2. If a dependency FAILS, dependent steps are marked SKIPPED (Failure Propagation).
 * 3. Independent branches can continue if allowPartialBranchFailure is enabled.
 * 4. Step outputs are bound and propagated to dependent step inputs.
 * 5. Cancellation tokens immediately stop subsequent steps and mark pending ones as CANCELLED.
 */
export class PlanExecutionEngine {
  private readonly now: () => Date;

  constructor(options?: { now?: () => Date }) {
    this.now = options?.now ?? (() => new Date());
  }

  async executePlan(options: PlanExecutionOptions): Promise<PlanExecutionReport> {
    const {
      plan,
      toolGateway,
      context,
      securityContext,
      agentId,
      events,
      cancellationToken,
      allowPartialBranchFailure = false,
    } = options;

    const startTime = this.now();
    const stepRecords = new Map<string, StepExecutionRecord>();
    const stepOutputs = new Map<string, Readonly<Record<string, unknown>>>();

    // Initialize all steps as PENDING
    for (const step of plan.steps) {
      stepRecords.set(step.id, {
        stepId: step.id,
        order: step.order,
        action: step.action,
        status: "PENDING",
      });
    }

    events?.publish(
      event("plan.execution_started", context.traceId, plan.id, {
        planId: plan.id,
        operationId: plan.operationId,
        totalSteps: plan.totalSteps,
      }, undefined, startTime, { taskId: context.taskId, executionId: context.executionId })
    );

    let planFailed = false;
    let planCancelled = false;
    let firstError: { code: string; message: string } | undefined;

    // Execute in topological step order
    for (const step of plan.steps) {
      // 1. Cancellation check
      if (cancellationToken?.isCancelled || planCancelled) {
        planCancelled = true;
        const reason = cancellationToken?.reason ?? "Plan execution was cancelled";
        stepRecords.set(step.id, {
          stepId: step.id,
          order: step.order,
          action: step.action,
          status: "CANCELLED",
          error: { code: "PLAN_CANCELLED", message: reason },
        });
        continue;
      }

      // 2. Check dependencies status
      let canRun = true;
      let skippedReason = "";

      for (const depId of step.dependencies) {
        const depRecord = stepRecords.get(depId);
        if (!depRecord || depRecord.status !== "COMPLETED") {
          canRun = false;
          skippedReason = `Dependency step '${depId}' status is '${depRecord?.status ?? "UNKNOWN"}'`;
          break;
        }
      }

      if (!canRun) {
        stepRecords.set(step.id, {
          stepId: step.id,
          order: step.order,
          action: step.action,
          status: "SKIPPED",
          error: { code: "DEPENDENCY_NOT_SATISFIED", message: skippedReason },
        });
        continue;
      }

      // 3. Prepare bound input (merge prior dependency outputs if available)
      const boundInput: Record<string, unknown> = { ...step.input };
      for (const depId of step.dependencies) {
        const depOutput = stepOutputs.get(depId);
        if (depOutput) {
          boundInput[`_dep_${depId}`] = depOutput;
        }
      }

      // 4. Execute Step
      const stepStart = this.now();
      stepRecords.set(step.id, {
        stepId: step.id,
        order: step.order,
        action: step.action,
        status: "RUNNING",
        startedAt: stepStart,
      });

      try {
        const toolTarget = step.toolId ?? (step.action.startsWith("tool.") ? step.action.replace(/^tool\./, "") : step.action);
        
        let toolResult: ToolResult;
        if (toolGateway instanceof ToolInvocationRuntime) {
          const secureResult = await toolGateway.invokeSecurely({
            request: {
              toolId: toolTarget,
              version: step.toolVersion,
              input: boundInput,
            },
            context,
            securityContext,
            agentId,
            cancellationToken,
          });
          toolResult = secureResult;
        } else {
          toolResult = await toolGateway.execute(toolTarget, boundInput, context, step.toolVersion);
        }

        const stepEnd = this.now();
        const durationMs = Math.max(0, stepEnd.getTime() - stepStart.getTime());

        stepRecords.set(step.id, {
          stepId: step.id,
          order: step.order,
          action: step.action,
          status: "COMPLETED",
          output: toolResult.output,
          startedAt: stepStart,
          completedAt: stepEnd,
          durationMs,
        });
        stepOutputs.set(step.id, toolResult.output);
      } catch (err) {
        const stepEnd = this.now();
        const durationMs = Math.max(0, stepEnd.getTime() - stepStart.getTime());
        const code = (err as { code?: string })?.code ?? "TOOL_EXECUTION_FAILED";
        const message = err instanceof Error ? err.message : String(err);

        stepRecords.set(step.id, {
          stepId: step.id,
          order: step.order,
          action: step.action,
          status: "FAILED",
          error: { code, message },
          startedAt: stepStart,
          completedAt: stepEnd,
          durationMs,
        });

        planFailed = true;
        if (!firstError) {
          firstError = { code, message };
        }

        if (!allowPartialBranchFailure) {
          // In standard mode, mark subsequent pending steps as SKIPPED due to step failure
          for (const remainingStep of plan.steps) {
            if (stepRecords.get(remainingStep.id)?.status === "PENDING") {
              stepRecords.set(remainingStep.id, {
                stepId: remainingStep.id,
                order: remainingStep.order,
                action: remainingStep.action,
                status: "SKIPPED",
                error: { code: "PREVIOUS_STEP_FAILED", message: `Step '${step.id}' failed` },
              });
            }
          }
          break;
        }
      }
    }

    const records = Array.from(stepRecords.values());
    const completedCount = records.filter((r) => r.status === "COMPLETED").length;
    const failedCount = records.filter((r) => r.status === "FAILED").length;
    const skippedCount = records.filter((r) => r.status === "SKIPPED").length;

    let finalStatus: "COMPLETED" | "FAILED" | "CANCELLED" | "PARTIALLY_FAILED";
    if (planCancelled) {
      finalStatus = "CANCELLED";
    } else if (failedCount === 0 && skippedCount === 0) {
      finalStatus = "COMPLETED";
    } else if (completedCount > 0 && failedCount > 0) {
      finalStatus = "PARTIALLY_FAILED";
    } else {
      finalStatus = "FAILED";
    }

    const durationMs = Math.max(0, this.now().getTime() - startTime.getTime());

    return Object.freeze({
      planId: plan.id,
      operationId: plan.operationId,
      status: finalStatus,
      steps: Object.freeze(records),
      outputs: Object.freeze(Object.fromEntries(stepOutputs.entries())),
      totalSteps: plan.totalSteps,
      completedSteps: completedCount,
      failedSteps: failedCount,
      skippedSteps: skippedCount,
      durationMs,
      error: firstError,
    });
  }
}

import { Plan, PlanStep } from "../../domain/autonomy/plan.js";
import {
  ToolGateway,
  ToolResult,
  CompensableTool,
  isCompensableTool,
} from "../../domain/tools/tool-registry.js";
import { ExecutionContext } from "../../domain/execution/execution-context.js";
import { SecurityContext } from "../../domain/security/security.js";
import { EventPublisher, event } from "../../domain/events/events.js";
import { ToolInvocationRuntime, CancellationToken } from "../tools/tool-invocation-runtime.js";
import {
  SagaExecution,
  SagaSnapshot,
  StepCompensationRecord,
} from "../../domain/autonomy/saga-execution.js";
import {
  TaintedValue,
  assertNoTaintedControlKeys,
  UntrustedControlDataError,
} from "../../domain/security/taint-tracking.js";

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
  readonly isTainted?: boolean | undefined;
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
  readonly enableSagaCompensation?: boolean | undefined;
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
  readonly saga?: SagaSnapshot | undefined;
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
 * 6. GAP-01: Validates that inputs do not inject tainted data into control-plane boundaries.
 * 7. GAP-05: When enableSagaCompensation is true and a forward step fails, coordinates
 *    reverse LIFO compensation of all completed compensable steps, preserving forward & backward errors.
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
      enableSagaCompensation = false,
    } = options;

    const startTime = this.now();
    const stepRecords = new Map<string, StepExecutionRecord>();
    const stepOutputs = new Map<string, Readonly<Record<string, unknown>>>();
    const stepTainted = new Map<string, boolean>();

    let saga: SagaExecution | undefined;
    if (enableSagaCompensation) {
      saga = new SagaExecution(`saga_${plan.id}`, plan.id, plan.operationId, startTime);
      saga.start();
      events?.publish(
        event("saga.started", context.traceId, saga.sagaId, {
          sagaId: saga.sagaId,
          planId: plan.id,
          operationId: plan.operationId,
        }, undefined, startTime, { taskId: context.taskId, executionId: context.executionId })
      );
    }

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
      let stepInputTainted = false;

      for (const depId of step.dependencies) {
        const depOutput = stepOutputs.get(depId);
        if (depOutput) {
          boundInput[`_dep_${depId}`] = depOutput;
        }
        if (stepTainted.get(depId)) {
          stepInputTainted = true;
        }
      }

      // GAP-01: Control plane taint check on step inputs
      try {
        assertNoTaintedControlKeys(boundInput);
      } catch (err) {
        if (err instanceof UntrustedControlDataError) {
          events?.publish(
            event("taint.boundary_violation", context.traceId, step.id, {
              stepId: step.id,
              action: step.action,
              field: err.fieldName,
              message: err.message,
            }, undefined, this.now())
          );
        }
        const stepEnd = this.now();
        const durationMs = Math.max(0, stepEnd.getTime() - startTime.getTime());
        const code = (err as { code?: string })?.code ?? "TAINT_BOUNDARY_VIOLATION";
        const message = err instanceof Error ? err.message : String(err);

        stepRecords.set(step.id, {
          stepId: step.id,
          order: step.order,
          action: step.action,
          status: "FAILED",
          error: { code, message },
          startedAt: startTime,
          completedAt: stepEnd,
          durationMs,
        });

        planFailed = true;
        firstError = { code, message };
        break;
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
        const toolTarget =
          step.toolId ??
          (step.action.startsWith("tool.") ? step.action.replace(/^tool\./, "") : step.action);

        let toolResult: ToolResult;
        let isResultTainted = stepInputTainted;

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
          if (secureResult.taintedOutput) {
            isResultTainted = true;
          }
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
          isTainted: isResultTainted,
        });

        stepOutputs.set(step.id, toolResult.output);
        stepTainted.set(step.id, isResultTainted);

        // GAP-05: If Saga is enabled, register completed step
        if (saga) {
          const toolInstance =
            toolGateway.findTool?.(toolTarget, step.toolVersion) ??
            (toolGateway as any)?.registry?.find?.(toolTarget, step.toolVersion) ??
            (toolGateway as any)?.toolRegistry?.find?.(toolTarget, step.toolVersion);
          const toolDef = toolGateway.definition?.(toolTarget, step.toolVersion) ?? toolInstance?.definition;
          const isCompensableInstance = toolInstance && isCompensableTool(toolInstance);

          const isReadOnly =
            toolDef?.executionHints?.readOnlyHint === true ||
            toolDef?.readOnlyHint === true ||
            (!isCompensableInstance && toolDef?.executionMode === "READ_ONLY");

          const isCompensable =
            !isReadOnly &&
            (
              (step.metadata?.compensable === true) ||
              Boolean(isCompensableInstance) ||
              (step.metadata?.compensationAction !== undefined)
            );

          saga.registerCompletedStep({
            stepId: step.id,
            action: step.action,
            toolId: toolTarget,
            toolVersion: step.toolVersion,
            status: isCompensable ? "PENDING" : (isReadOnly ? "READ_ONLY" : "NOT_COMPENSABLE"),
            isSideEffecting: !isReadOnly,
            forwardOutput: toolResult.output,
            startedAt: stepStart,
            completedAt: stepEnd,
            durationMs,
          });

          events?.publish(
            event("saga.step.completed", context.traceId, saga.sagaId, {
              sagaId: saga.sagaId,
              stepId: step.id,
              action: step.action,
              isCompensable,
            }, undefined, stepEnd, { taskId: context.taskId, executionId: context.executionId })
          );
        }
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

        if (saga) {
          saga.failForward({ code, message });
          events?.publish(
            event("saga.forward.failed", context.traceId, saga.sagaId, {
              sagaId: saga.sagaId,
              failedStepId: step.id,
              code,
              message,
            }, undefined, stepEnd, { taskId: context.taskId, executionId: context.executionId })
          );
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

    // GAP-05: Compensation Execution in Reverse Order (LIFO) if Plan Failed
    if (saga && planFailed) {
      saga.startCompensation();
      events?.publish(
        event("saga.compensation.started", context.traceId, saga.sagaId, {
          sagaId: saga.sagaId,
          planId: plan.id,
        }, undefined, this.now(), { taskId: context.taskId, executionId: context.executionId })
      );

      // Extract stack in reverse order
      const completedSteps = [...saga.compensationStack].reverse();

      for (const compRecord of completedSteps) {
        if (compRecord.status === "NOT_COMPENSABLE" || compRecord.status === "READ_ONLY") {
          // Non-compensable or read-only step: Nothing to revert
          continue;
        }

        const compStart = this.now();
        saga.updateCompensationStep(compRecord.stepId, {
          status: "RUNNING",
          startedAt: compStart,
        });

        try {
          const toolTarget = compRecord.toolId ?? compRecord.action.replace(/^tool\./, "");
          const toolInstance =
            toolGateway.findTool?.(toolTarget, compRecord.toolVersion) ??
            (toolGateway as any)?.registry?.find?.(toolTarget, compRecord.toolVersion) ??
            (toolGateway as any)?.toolRegistry?.find?.(toolTarget, compRecord.toolVersion);

          let compensationOutput: Record<string, unknown> | undefined;

          if (toolInstance && isCompensableTool(toolInstance)) {
            // Invokes explicit compensate() handler
            const compensationInput = {
              originalInput: boundInputForStep(plan, compRecord.stepId),
              originalOutput: compRecord.forwardOutput,
            };
            const compResult = await toolInstance.compensate(
              compensationInput,
              context,
              compRecord.forwardOutput
            );
            compensationOutput = compResult.output as Record<string, unknown>;
          } else {
            // Look for explicit compensation tool declared in step metadata
            const stepDef = plan.getStepById(compRecord.stepId);
            const compAction = stepDef?.metadata?.compensationAction as string | undefined;

            if (compAction) {
              const compToolTarget = compAction.startsWith("tool.") ? compAction.replace(/^tool\./, "") : compAction;
              const compInput = {
                forwardStepId: compRecord.stepId,
                forwardOutput: compRecord.forwardOutput,
              };

              let compResult: ToolResult;
              if (toolGateway instanceof ToolInvocationRuntime) {
                compResult = await toolGateway.invokeSecurely({
                  request: {
                    toolId: compToolTarget,
                    input: compInput,
                    idempotencyKey: `saga:${saga.sagaId}:${compRecord.stepId}:compensate`,
                  },
                  context,
                  securityContext,
                  agentId,
                });
              } else {
                compResult = await toolGateway.execute(compToolTarget, compInput, context);
              }
              compensationOutput = compResult.output as Record<string, unknown>;
            } else {
              // No compensation capability found: Mark as IN_DOUBT / FAILED
              throw new Error(`Step '${compRecord.stepId}' marked compensable but lacks compensation handler`);
            }
          }

          const compEnd = this.now();
          const compDuration = Math.max(0, compEnd.getTime() - compStart.getTime());

          saga.updateCompensationStep(compRecord.stepId, {
            status: "COMPENSATED",
            compensationOutput,
            completedAt: compEnd,
            durationMs: compDuration,
          });

          events?.publish(
            event("saga.step.completed", context.traceId, saga.sagaId, {
              sagaId: saga.sagaId,
              stepId: compRecord.stepId,
              status: "COMPENSATED",
            }, undefined, compEnd, { taskId: context.taskId, executionId: context.executionId })
          );
        } catch (compErr) {
          const compEnd = this.now();
          const compDuration = Math.max(0, compEnd.getTime() - compStart.getTime());
          const compCode = (compErr as { code?: string })?.code ?? "COMPENSATION_ERROR";
          const compMessage = compErr instanceof Error ? compErr.message : String(compErr);

          const isTimeoutOrNetwork =
            compCode === "TOOL_TIMEOUT" ||
            compMessage.toLowerCase().includes("timeout") ||
            compMessage.toLowerCase().includes("unknown");

          const finalCompStatus = isTimeoutOrNetwork ? "IN_DOUBT" : "FAILED";

          saga.updateCompensationStep(compRecord.stepId, {
            status: finalCompStatus,
            error: { code: compCode, message: compMessage },
            completedAt: compEnd,
            durationMs: compDuration,
          });

          events?.publish(
            event(finalCompStatus === "IN_DOUBT" ? "saga.in_doubt" : "saga.compensation.failed", context.traceId, saga.sagaId, {
              sagaId: saga.sagaId,
              stepId: compRecord.stepId,
              code: compCode,
              message: compMessage,
            }, undefined, compEnd, { taskId: context.taskId, executionId: context.executionId })
          );

          // Stop executing further compensations to prevent cascaded divergence
          break;
        }
      }

      const sagaFinalState = saga.finishCompensation();
      events?.publish(
        event(sagaFinalState === "COMPENSATED" ? "saga.completed" : "saga.compensation.failed", context.traceId, saga.sagaId, {
          sagaId: saga.sagaId,
          state: sagaFinalState,
        }, undefined, this.now(), { taskId: context.taskId, executionId: context.executionId })
      );
    } else if (saga && !planFailed) {
      saga.completeForward();
      events?.publish(
        event("saga.completed", context.traceId, saga.sagaId, {
          sagaId: saga.sagaId,
          state: "COMPLETED",
        }, undefined, this.now(), { taskId: context.taskId, executionId: context.executionId })
      );
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
    } else if (allowPartialBranchFailure && completedCount > 0 && failedCount > 0) {
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
      ...(saga ? { saga: saga.snapshot() } : {}),
    });
  }
}

function boundInputForStep(plan: Plan, stepId: string): Record<string, unknown> {
  const step = plan.getStepById(stepId);
  return step ? { ...step.input } : {};
}

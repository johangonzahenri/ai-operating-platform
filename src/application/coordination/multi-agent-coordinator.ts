import crypto from "node:crypto";
import { AgentLookup, AgentHandoff, CoordinationLimits, CoordinationRequest, CoordinationResult, DEFAULT_COORDINATION_LIMITS, evaluateVerificationOutput } from "../../domain/coordination/coordination.js";
import { EventPublisher, event } from "../../domain/events/events.js";
import { Runtime } from "../../domain/execution/runtime.js";
import { PolicyGateway } from "../../domain/policy/policy.js";
import { Task } from "../../domain/task/task.js";

export interface CoordinationCancellation {
  readonly isCancelled: boolean;
  readonly reason?: string;
}

export interface MultiAgentCoordinatorOptions {
  readonly now?: () => Date;
  readonly ids?: { next(): string };
  readonly limits?: CoordinationLimits;
}

export class MultiAgentCoordinator {
  private readonly now: () => Date;
  private readonly ids: { next(): string };
  private readonly limits: CoordinationLimits;

  constructor(
    private readonly runtime: Runtime,
    private readonly agents: AgentLookup,
    private readonly policy: PolicyGateway,
    private readonly events: EventPublisher,
    options: MultiAgentCoordinatorOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.ids = options.ids ?? { next: () => crypto.randomUUID() };
    this.limits = options.limits ?? DEFAULT_COORDINATION_LIMITS;
  }

  async run(request: CoordinationRequest, cancellation?: CoordinationCancellation): Promise<CoordinationResult> {
    const startedAt = this.now();
    const steps: CoordinationResult["steps"][number][] = [];
    const handoffs: AgentHandoff[] = [];
    let agentsExecuted = 0;
    let handoffsCreated = 0;

    // Check coordination depth limit at runtime
    if (request.depth >= this.limits.maxDepth) {
      return this.finish(request, steps, handoffs, "FAILED", undefined, {
        code: "RECURSIVE_COORDINATION_REJECTED",
        message: `Coordination depth ${request.depth} exceeds maximum allowed depth ${this.limits.maxDepth - 1}`,
      }, agentsExecuted, handoffsCreated);
    }

    this.events.publish(event(
      "coordination.started",
      request.correlationId,
      request.coordinationId,
      { coordinationId: request.coordinationId, stepCount: request.steps.length, maxHandoffs: request.maxHandoffs },
      undefined,
      startedAt,
      { taskId: request.taskId },
    ));

    let payload: Readonly<Record<string, unknown>> = { objective: request.objective, input: request.input };
    let sourceAgentId = "coordinator";
    let lastExecutionId = request.coordinationId;

    try {
      for (let index = 0; index < request.steps.length; index += 1) {
        // 1. Cancellation check before step
        if (cancellation?.isCancelled) {
          return this.finish(request, steps, handoffs, "CANCELLED", undefined, {
            code: "CANCELLED",
            message: cancellation.reason ?? "Coordination cancelled",
          }, agentsExecuted, handoffsCreated);
        }

        // 2. Timeout check before step
        if (this.now().getTime() - startedAt.getTime() > request.timeoutMs) {
          return this.finish(request, steps, handoffs, "TIMEOUT", undefined, {
            code: "TIMEOUT",
            message: "Coordination timeout exceeded",
          }, agentsExecuted, handoffsCreated);
        }

        // 3. Agent budget check
        if (agentsExecuted >= this.limits.maxAgents) {
          return this.finish(request, steps, handoffs, "FAILED", undefined, {
            code: "AGENT_BUDGET_EXCEEDED",
            message: `Execution exceeded maximum agents limit (${this.limits.maxAgents})`,
          }, agentsExecuted, handoffsCreated);
        }

        const step = request.steps[index];
        if (!step) {
          return this.finish(request, steps, handoffs, "FAILED", undefined, {
            code: "STEP_MISSING",
            message: "Coordination step is missing",
          }, agentsExecuted, handoffsCreated);
        }

        // 4. Agent lookup & validation
        const agent = this.agents.findById(step.agentId);
        if (!agent) {
          return this.finish(request, steps, handoffs, "FAILED", undefined, {
            code: "UNKNOWN_AGENT",
            message: `Unknown coordination agent '${step.agentId}'`,
          }, agentsExecuted, handoffsCreated);
        }
        if (agent.status !== "ACTIVE") {
          return this.finish(request, steps, handoffs, "FAILED", undefined, {
            code: "INACTIVE_AGENT",
            message: `Coordination agent '${step.agentId}' is inactive`,
          }, agentsExecuted, handoffsCreated);
        }

        // 5. Policy evaluation
        const decision = await this.policy.evaluate({
          traceId: request.correlationId,
          operationId: request.coordinationId,
          operationType: "MODEL",
          resourceId: agent.id,
          agentId: agent.id,
          action: "coordination.execute",
          metadata: { role: step.role, sourceAgentId, stepIndex: index },
        });

        if (!decision.allowed) {
          return this.finish(request, steps, handoffs, "POLICY_DENIED", undefined, {
            code: "POLICY_DENIED",
            message: decision.reason ?? `Coordination step '${step.role}' for agent '${agent.id}' denied by policy`,
          }, agentsExecuted, handoffsCreated);
        }

        this.events.publish(event(
          "coordination.agent.selected",
          request.correlationId,
          agent.id,
          { coordinationId: request.coordinationId, role: step.role, stepIndex: index },
          undefined,
          this.now(),
          { taskId: request.taskId },
        ));

        // 6. Child Task creation & execution
        const childTask = Task.create(this.ids.next(), request.correlationId, {
          agentId: agent.id,
          input: payload,
        });

        // Cancellation / Timeout check immediately before execution
        if (cancellation?.isCancelled) {
          return this.finish(request, steps, handoffs, "CANCELLED", undefined, {
            code: "CANCELLED",
            message: cancellation.reason ?? "Coordination cancelled before execution",
          }, agentsExecuted, handoffsCreated);
        }
        if (this.now().getTime() - startedAt.getTime() > request.timeoutMs) {
          return this.finish(request, steps, handoffs, "TIMEOUT", undefined, {
            code: "TIMEOUT",
            message: "Coordination timeout exceeded before execution",
          }, agentsExecuted, handoffsCreated);
        }

        const result = await this.runtime.execute(childTask, agent.toDefinition());
        agentsExecuted += 1;
        lastExecutionId = result.execution.id;

        const stepResult = {
          agentId: agent.id,
          role: step.role,
          status: result.execution.status,
          executionId: result.execution.id,
          ...(result.task.result ? { output: result.task.result.output } : {}),
        };
        steps.push(stepResult);

        // 7. Check child execution status
        if (result.execution.status !== "COMPLETED" || !result.task.result) {
          this.events.publish(event(
            "coordination.agent.failed",
            request.correlationId,
            agent.id,
            { coordinationId: request.coordinationId, status: result.execution.status, role: step.role },
            undefined,
            this.now(),
            { taskId: request.taskId, executionId: result.execution.id },
          ));
          return this.finish(request, steps, handoffs, "FAILED", undefined, {
            code: "AGENT_EXECUTION_FAILED",
            message: `Agent '${agent.id}' (${step.role}) did not complete successfully (status: ${result.execution.status})`,
          }, agentsExecuted, handoffsCreated);
        }

        this.events.publish(event(
          "coordination.agent.completed",
          request.correlationId,
          agent.id,
          { coordinationId: request.coordinationId, role: step.role },
          undefined,
          this.now(),
          { taskId: request.taskId, executionId: result.execution.id },
        ));

        // 8. If this is a VERIFICATION step, explicitly evaluate verification semantics
        if (step.role === "VERIFICATION") {
          const verificationResult = evaluateVerificationOutput(result.task.result.output);
          if (!verificationResult.pass) {
            return this.finish(
              request,
              steps,
              handoffs,
              "FAILED",
              result.task.result.output,
              verificationResult.error ?? { code: "VERIFICATION_FAILED", message: "Verification failed" },
              agentsExecuted,
              handoffsCreated,
            );
          }
        }

        // 9. Handoff to next agent if not the last step
        if (index < request.steps.length - 1) {
          if (cancellation?.isCancelled) {
            return this.finish(request, steps, handoffs, "CANCELLED", undefined, {
              code: "CANCELLED",
              message: cancellation.reason ?? "Coordination cancelled before handoff",
            }, agentsExecuted, handoffsCreated);
          }
          if (this.now().getTime() - startedAt.getTime() > request.timeoutMs) {
            return this.finish(request, steps, handoffs, "TIMEOUT", undefined, {
              code: "TIMEOUT",
              message: "Coordination timeout exceeded before handoff",
            }, agentsExecuted, handoffsCreated);
          }

          if (handoffsCreated >= request.maxHandoffs || handoffsCreated >= this.limits.maxHandoffs) {
            return this.finish(request, steps, handoffs, "FAILED", undefined, {
              code: "HANDOFF_BUDGET_EXCEEDED",
              message: `Coordination exceeded maximum allowed handoffs (${request.maxHandoffs})`,
            }, agentsExecuted, handoffsCreated);
          }

          const next = request.steps[index + 1];
          if (!next) {
            return this.finish(request, steps, handoffs, "FAILED", undefined, {
              code: "NEXT_STEP_MISSING",
              message: "Next coordination step is missing",
            }, agentsExecuted, handoffsCreated);
          }

          const targetAgent = this.agents.findById(next.agentId);
          if (!targetAgent || targetAgent.status !== "ACTIVE" || targetAgent.id === agent.id) {
            const rejectReason = !targetAgent
              ? `Target agent '${next.agentId}' not found`
              : targetAgent.status !== "ACTIVE"
              ? `Target agent '${next.agentId}' is inactive`
              : "Source and target agent cannot be the same";

            this.events.publish(event(
              "coordination.handoff.rejected",
              request.correlationId,
              request.coordinationId,
              { coordinationId: request.coordinationId, sourceAgentId: agent.id, targetAgentId: next.agentId, reason: rejectReason },
              undefined,
              this.now(),
              { taskId: request.taskId, executionId: result.execution.id },
            ));

            return this.finish(request, steps, handoffs, "FAILED", undefined, {
              code: "HANDOFF_REJECTED",
              message: rejectReason,
            }, agentsExecuted, handoffsCreated);
          }

          this.events.publish(event(
            "coordination.handoff.requested",
            request.correlationId,
            request.coordinationId,
            { coordinationId: request.coordinationId, sourceAgentId: agent.id, targetAgentId: next.agentId },
            undefined,
            this.now(),
            { taskId: request.taskId, executionId: result.execution.id },
          ));

          let handoff: AgentHandoff;
          try {
            handoff = AgentHandoff.create({
              correlationId: request.correlationId,
              taskId: request.taskId,
              executionId: result.execution.id,
              sourceAgentId: agent.id,
              targetAgentId: next.agentId,
              objective: request.objective,
              payload: result.task.result.output,
              metadata: { role: step.role, nextRole: next.role },
              status: "ACCEPTED",
              createdAt: this.now(),
              completedAt: this.now(),
            }, this.limits);
          } catch (handoffErr) {
            const rejectReason = handoffErr instanceof Error ? handoffErr.message : "Malformed handoff payload";
            this.events.publish(event(
              "coordination.handoff.rejected",
              request.correlationId,
              request.coordinationId,
              { coordinationId: request.coordinationId, sourceAgentId: agent.id, targetAgentId: next.agentId, reason: rejectReason },
              undefined,
              this.now(),
              { taskId: request.taskId, executionId: result.execution.id },
            ));
            return this.finish(request, steps, handoffs, "FAILED", undefined, {
              code: "HANDOFF_REJECTED",
              message: rejectReason,
            }, agentsExecuted, handoffsCreated);
          }

          handoffs.push(handoff);
          handoffsCreated += 1;

          this.events.publish(event(
            "coordination.handoff.accepted",
            request.correlationId,
            handoff.handoffId,
            { coordinationId: request.coordinationId, sourceAgentId: agent.id, targetAgentId: next.agentId },
            undefined,
            this.now(),
            { taskId: request.taskId, executionId: result.execution.id },
          ));

          // Next agent receives exclusively the bounded, sanitized handoff payload
          payload = handoff.payload;
          sourceAgentId = agent.id;
        }
      }

      // 10. Final output is the output of the terminal verification step without fabricated fields
      const finalStepOutput = steps.at(-1)?.output ?? {};
      return this.finish(request, steps, handoffs, "COMPLETED", finalStepOutput, undefined, agentsExecuted, handoffsCreated);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Coordination failed";
      return this.finish(request, steps, handoffs, "FAILED", undefined, {
        code: "COORDINATION_FAILED",
        message: `${message} (lastExecutionId=${lastExecutionId})`,
      }, agentsExecuted, handoffsCreated);
    }
  }

  private finish(
    request: CoordinationRequest,
    steps: CoordinationResult["steps"],
    handoffs: readonly AgentHandoff[],
    status: CoordinationResult["status"],
    output?: Readonly<Record<string, unknown>>,
    error?: Readonly<{ code: string; message: string }>,
    agentsExecuted?: number,
    handoffsCreated?: number,
  ): CoordinationResult {
    const result: CoordinationResult = {
      coordinationId: request.coordinationId,
      correlationId: request.correlationId,
      taskId: request.taskId,
      status,
      steps: Object.freeze([...steps]),
      handoffs: Object.freeze([...handoffs]),
      ...(output ? { output } : {}),
      ...(error ? { error } : {}),
      ...(agentsExecuted !== undefined ? { agentsExecuted } : {}),
      ...(handoffsCreated !== undefined ? { handoffsCreated } : {}),
    };

    this.events.publish(event(
      status === "COMPLETED" ? "coordination.completed" : "coordination.failed",
      request.correlationId,
      request.coordinationId,
      {
        coordinationId: request.coordinationId,
        status,
        stepCount: steps.length,
        handoffCount: handoffs.length,
        ...(error ? { code: error.code } : {}),
      },
      undefined,
      this.now(),
      { taskId: request.taskId },
    ));

    return Object.freeze(result);
  }
}

import crypto from "node:crypto";
import { AgentDefinition } from "../../domain/agent/agent.js";
import { EventPublisher, event } from "../../domain/events/events.js";
import { ExecutionContext } from "../../domain/execution/execution-context.js";
import { ExecutionStrategy, ExecutionStrategyResult } from "../../domain/execution/execution-strategy.js";
import { MemoryGateway, createMemoryItem } from "../../domain/memory/memory-gateway.js";
import { ModelGateway, ModelToolResult } from "../../domain/model/model-gateway.js";
import { ToolGateway } from "../../domain/tools/tool-registry.js";
import { PolicyDeniedError, PolicyEvaluationError, PolicyGateway } from "../../domain/policy/policy.js";
import { Task } from "../../domain/task/task.js";
import { ModelMessage } from "../../domain/model/model-gateway.js";
import { executionLimitsFromEnvironment } from "./execution-limits.js";
import { TaskContext } from "../../domain/context/task-context.js";

const SENSITIVE_KEY = /(authorization|api[_-]?key|token|secret|password|cookie|credential|header|env|private[_-]?key)/i;
function safeToolValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 32).map((item) => safeToolValue(item, depth + 1));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).slice(0, 64).map(([key, item]) => [
    key,
    SENSITIVE_KEY.test(key) ? "[redacted]" : safeToolValue(item, depth + 1),
  ]));
}

export class AgentExecutionStrategy implements ExecutionStrategy {
  constructor(
    private readonly models: ModelGateway,
    private readonly tools: ToolGateway,
    private readonly memory: MemoryGateway,
    private readonly events: EventPublisher,
    private readonly policy: PolicyGateway
  ) {}

  async execute(context: ExecutionContext, task: Task, agent: AgentDefinition): Promise<ExecutionStrategyResult> {
    const refs = { taskId: task.id, executionId: context.executionId };

    // 1. Mandatory fail-closed governance check for Agent execution
    await this.authorize(context, task, agent);

    // 2. Memory Scope inspection (if agent declares memoryScope)
    let memoryContext: Record<string, unknown> | undefined = undefined;
    if (agent.memoryScope) {
      try {
        const item = await this.memory.retrieve(agent.memoryScope, "context");
        if (item) {
          memoryContext = item.value;
          this.events.publish(
            event("memory.retrieved", context.traceId, item.id, {
              scope: item.scope,
              key: item.key,
              agentId: agent.id,
            }, undefined, undefined, refs)
          );
        }
      } catch {
        // Non-fatal if memory scope item not found yet
      }
    }

    // 3. Tool authorization & execution check if input specifies a tool invocation
    const toolRequest = task.request.input.tool as string | undefined;
    if (toolRequest) {
      const allowedTools = agent.tools ?? [];
      if (!allowedTools.includes(toolRequest)) {
        const reason = `Tool '${toolRequest}' is not permitted for agent '${agent.id}'`;
        this.events.publish(
          event("policy.denied", context.traceId, context.executionId, {
            operationId: context.executionId,
            policyId: "agent-tool-authorization",
            reason,
            agentId: agent.id,
          }, undefined, undefined, refs)
        );
        throw new PolicyDeniedError("agent-tool-authorization", context.executionId, reason);
      }

      // Authorize tool with PolicyGateway
      const toolDecision = await this.policy.evaluate({
        traceId: context.traceId,
        executionId: context.executionId,
        taskId: task.id,
        operationId: context.executionId,
        operationType: "TOOL",
        resourceId: toolRequest,
        metadata: { agentId: agent.id, ...(task.request.input.toolInput as Record<string, unknown> ?? {}) },
      });

      if (!toolDecision.allowed) {
        const reason = toolDecision.reason ?? `Tool '${toolRequest}' denied by policy`;
        this.events.publish(
          event("policy.denied", context.traceId, context.executionId, {
            operationId: context.executionId,
            policyId: toolDecision.policyId,
            reason,
          }, undefined, undefined, refs)
        );
        throw new PolicyDeniedError(toolDecision.policyId, context.executionId, reason);
      }

      const toolResult = await this.tools.execute(
        toolRequest,
        (task.request.input.toolInput as Record<string, unknown>) ?? {},
        context
      );

      return {
        output: toolResult.output,
        metadata: { agentId: agent.id, tool: toolRequest, ...(toolResult.metadata ?? {}) },
      };
    }

    // 4. Model execution with Agent instructions and contextual enrichment
    const enrichedInput: Record<string, unknown> = {
      ...task.request.input,
      ...(agent.instructions ? { instructions: agent.instructions } : {}),
      ...(memoryContext ? { memory: memoryContext } : {}),
    };

    this.events.publish(
      event("model.requested", context.traceId, context.executionId, {
        model: agent.model,
        agentId: agent.id,
      }, undefined, undefined, refs)
    );

    try {
      const toolDefinitions = (agent.tools ?? [])
        .map((toolId) => this.tools.definition?.(toolId))
        .filter((definition): definition is NonNullable<typeof definition> => definition !== undefined)
        .map((definition) => ({
          name: definition.id,
          description: definition.description,
          inputSchema: definition.inputSchema as unknown as Record<string, unknown>,
        }));
      const toolResults: ModelToolResult[] = [];
      const limits = executionLimitsFromEnvironment();
      const loopStartedAt = Date.now();
      const messages: ModelMessage[] = [{ role: "user", content: typeof enrichedInput.objective === "string" ? enrichedInput.objective : JSON.stringify(enrichedInput) }];
      let taskContext = TaskContext.create({
        taskId: task.id,
        executionId: context.executionId,
        objective: typeof enrichedInput.objective === "string" ? enrichedInput.objective : JSON.stringify(enrichedInput),
        taskMetadata: typeof task.request.input.metadata === "object" && task.request.input.metadata !== null && !Array.isArray(task.request.input.metadata)
          ? task.request.input.metadata as Readonly<Record<string, unknown>>
          : undefined,
        executionStatus: "RUNNING",
        currentRound: 0,
        messages,
        suppliedContext: memoryContext,
      });
      let response = await this.models.generate({
        traceId: context.traceId,
        model: agent.model,
        input: { ...enrichedInput, taskContext: taskContext.snapshot({ includeMessages: false }) },
        messages,
        ...(toolDefinitions.length > 0 ? { tools: toolDefinitions } : {}),
      });
      let round = 0;
      let callCount = 0;
      while (response.toolCalls && response.toolCalls.length > 0) {
        round += 1;
        if (round > limits.maxToolRounds) throw new Error("TOOL_ROUND_LIMIT_EXCEEDED");
        messages.push({ role: "assistant", content: response.content, toolCalls: response.toolCalls });
        for (const call of response.toolCalls) {
          callCount += 1;
          if (callCount > limits.maxToolCalls) throw new Error("TOOL_CALL_LIMIT_EXCEEDED");
          if (Date.now() - loopStartedAt > limits.maxExecutionTimeMs) throw new Error("EXECUTION_TIMEOUT");
          this.events.publish(event("model.tool.call.requested", context.traceId, call.id, {
            toolCallId: call.id, toolName: call.name, round, arguments: safeToolValue(call.arguments),
          }, undefined, undefined, refs));
          if (!(agent.tools ?? []).includes(call.name)) {
            this.events.publish(event("model.tool.call.rejected", context.traceId, call.id, {
              toolCallId: call.id, toolName: call.name, round, reason: "Tool is not authorized for agent",
            }, undefined, undefined, refs));
            throw new PolicyDeniedError("agent-tool-authorization", call.id, `Tool '${call.name}' is not permitted`);
          }
          const decision = await this.policy.evaluate({
            traceId: context.traceId, executionId: context.executionId, taskId: task.id,
            operationId: call.id, operationType: "TOOL", resourceId: call.name,
            metadata: { round, toolCallId: call.id, ...call.arguments },
          });
          if (!decision.allowed) {
            this.events.publish(event("model.tool.call.rejected", context.traceId, call.id, {
              toolCallId: call.id, toolName: call.name, round, reason: decision.reason ?? "Policy denied",
            }, undefined, undefined, refs));
            throw new PolicyDeniedError(decision.policyId, call.id, decision.reason ?? "Tool denied");
          }
          this.events.publish(event("model.tool.call.authorized", context.traceId, call.id, {
            toolCallId: call.id, toolName: call.name, round,
          }, undefined, undefined, refs));
          try {
            const result = await this.tools.execute(call.name, call.arguments, context);
            const observation = { toolCallId: call.id, name: call.name, output: result.output, success: true };
            toolResults.push(observation);
            messages.push({ role: "tool", toolResult: observation });
            taskContext = TaskContext.create({
              taskId: task.id,
              executionId: context.executionId,
              objective: typeof enrichedInput.objective === "string" ? enrichedInput.objective : JSON.stringify(enrichedInput),
              taskMetadata: typeof task.request.input.metadata === "object" && task.request.input.metadata !== null && !Array.isArray(task.request.input.metadata)
                ? task.request.input.metadata as Readonly<Record<string, unknown>>
                : undefined,
              executionStatus: "RUNNING",
              currentRound: round,
              currentTool: call.name,
              observations: toolResults,
              messages,
              suppliedContext: memoryContext,
            });
            this.events.publish(event("model.tool.result.returned", context.traceId, call.id, {
              toolCallId: call.id, toolName: call.name, round, success: true, result: safeToolValue(result.output),
            }, undefined, undefined, refs));
          } catch (error) {
            const observation = { toolCallId: call.id, name: call.name, output: { error: error instanceof Error ? error.message : String(error) }, success: false };
            toolResults.push(observation);
            messages.push({ role: "tool", toolResult: observation });
            taskContext = TaskContext.create({
              taskId: task.id,
              executionId: context.executionId,
              objective: typeof enrichedInput.objective === "string" ? enrichedInput.objective : JSON.stringify(enrichedInput),
              taskMetadata: typeof task.request.input.metadata === "object" && task.request.input.metadata !== null && !Array.isArray(task.request.input.metadata)
                ? task.request.input.metadata as Readonly<Record<string, unknown>>
                : undefined,
              executionStatus: "RUNNING",
              currentRound: round,
              currentTool: call.name,
              observations: toolResults,
              messages,
              suppliedContext: memoryContext,
            });
            this.events.publish(event("model.tool.result.returned", context.traceId, call.id, {
              toolCallId: call.id, toolName: call.name, round, success: false,
              error: error instanceof Error ? error.message : String(error),
            }, undefined, undefined, refs));
          }
        }
        response = await this.models.generate({
          traceId: context.traceId, model: agent.model, input: { ...enrichedInput, taskContext: taskContext.snapshot({ includeMessages: false }) },
          tools: toolDefinitions, messages,
        });
      }
      this.events.publish(event("model.final.response", context.traceId, context.executionId, {
        provider: response.provider, model: response.model, rounds: round, toolCalls: callCount, result: response.output,
      }, undefined, undefined, refs));

      this.events.publish(
        event("model.completed", context.traceId, context.executionId, {
          provider: response.provider,
          agentId: agent.id,
        }, undefined, undefined, refs)
      );

      // 5. Update agent memory scope with execution record if configured
      if (agent.memoryScope) {
        try {
          const memId = crypto.randomUUID();
          const memItem = createMemoryItem(
            memId,
            agent.memoryScope,
            "last_execution",
            { executionId: context.executionId, taskId: task.id, output: response.output },
            { agentId: agent.id }
          );
          await this.memory.store(memItem);
          this.events.publish(
            event("memory.stored", context.traceId, memId, {
              scope: agent.memoryScope,
              key: "last_execution",
              agentId: agent.id,
            }, undefined, undefined, refs)
          );
        } catch {
          // Memory persistence failure does not fail the execution
        }
      }

      return {
        output: response.output,
        metadata: {
          provider: response.provider,
          model: agent.model,
          agentId: agent.id,
          memoryScope: agent.memoryScope,
          toolCalls: callCount,
          toolRounds: round,
          currentRound: round,
          finalResult: response.output,
        },
      };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unknown model failure";
      this.events.publish(
        event("model.failed", context.traceId, context.executionId, {
          message,
          agentId: agent.id,
        }, undefined, undefined, refs)
      );
      throw cause;
    }
  }

  private async authorize(context: ExecutionContext, task: Task, agent: AgentDefinition): Promise<void> {
    if (!this.policy || typeof this.policy.evaluate !== "function") {
      throw new PolicyEvaluationError("PolicyGateway is mandatory and must provide evaluate()");
    }
    const refs = { taskId: task.id, executionId: context.executionId };
    try {
      const decision = await this.policy.evaluate({
        traceId: context.traceId,
        executionId: context.executionId,
        taskId: task.id,
        operationId: context.executionId,
        operationType: "MODEL",
        resourceId: agent.model,
        metadata: { agentId: agent.id, ...task.request.input },
      });

      this.events.publish(
        event("policy.evaluated", context.traceId, context.executionId, {
          operationId: context.executionId,
          policyId: decision.policyId,
          allowed: decision.allowed,
          agentId: agent.id,
        }, undefined, undefined, refs)
      );

      if (!decision.allowed) {
        const reason = decision.reason ?? `Agent '${agent.id}' model execution denied by policy`;
        this.events.publish(
          event("policy.denied", context.traceId, context.executionId, {
            operationId: context.executionId,
            policyId: decision.policyId,
            reason,
            agentId: agent.id,
          }, undefined, undefined, refs)
        );
        throw new PolicyDeniedError(decision.policyId, context.executionId, reason);
      }

      this.events.publish(
        event("policy.allowed", context.traceId, context.executionId, {
          operationId: context.executionId,
          policyId: decision.policyId,
          agentId: agent.id,
        }, undefined, undefined, refs)
      );
    } catch (cause) {
      if (cause instanceof PolicyDeniedError) throw cause;
      throw new PolicyEvaluationError(
        "Policy evaluation unavailable; agent execution denied",
        cause instanceof Error ? cause : undefined
      );
    }
  }
}

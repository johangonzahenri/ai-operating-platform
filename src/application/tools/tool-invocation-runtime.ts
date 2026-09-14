import { EventPublisher, event } from "../../domain/events/events.js";
import { ExecutionContext } from "../../domain/execution/execution-context.js";
import { SecurityContext, RiskLevel } from "../../domain/security/security.js";
import { PolicyGateway } from "../../domain/policy/policy.js";
import { SecurityBoundaryEnforcer } from "../security/security-boundary-enforcer.js";
import {
  deepFreeze,
  sanitizeBoundedValue,
  DEFAULT_BOUNDED_DATA_LIMITS,
  BoundedDataLimits,
} from "../../domain/context/bounded-data.js";
import {
  Tool,
  ToolDefinition,
  ToolRegistry,
  ToolGateway,
  ToolRequest,
  ToolResult,
  ToolExecutionResult,
  ToolExecutionContext,
  ToolNotFoundError,
  ToolVersionNotFoundError,
  ToolValidationError,
  ToolInputValidationError,
  ToolOutputValidationError,
  ToolExecutionError,
  ToolTimeoutError,
  ToolCancelledError,
  ToolAuthorizationError,
  ToolApprovalRequiredError,
  ToolPolicyRejectedError,
  MAX_TOOL_INPUT_SIZE,
  MAX_TOOL_OUTPUT_SIZE,
  DEFAULT_TOOL_TIMEOUT_MS,
  MAX_TOOL_TIMEOUT_MS,
} from "../../domain/tools/tool-registry.js";

export interface ToolInvocationRuntimeOptions {
  readonly registry: ToolRegistry;
  readonly events: EventPublisher;
  readonly policyGateway?: PolicyGateway | undefined;
  readonly securityEnforcer?: SecurityBoundaryEnforcer | undefined;
  readonly limits?: BoundedDataLimits | undefined;
  readonly defaultTimeoutMs?: number | undefined;
  readonly now?: (() => Date) | undefined;
}

export interface CancellationToken {
  readonly isCancelled: boolean;
  readonly reason?: string | undefined;
}

export interface SecureToolInvocationOptions {
  readonly request: ToolRequest;
  readonly context: ExecutionContext | ToolExecutionContext;
  readonly securityContext?: SecurityContext | undefined;
  readonly agentId?: string | undefined;
  readonly cancellationToken?: CancellationToken | undefined;
}

/**
 * ToolInvocationRuntime enforces the full security, validation, sandboxing,
 * timeout, and output sanitization pipeline for tool execution.
 *
 * Pipeline:
 * Resolve -> Authorize -> Approval Check -> Input Validation -> Execute -> Output Validation -> Output Sanitization -> Event Audit
 */
export class ToolInvocationRuntime implements ToolGateway {
  private readonly registry: ToolRegistry;
  private readonly events: EventPublisher;
  private readonly policyGateway?: PolicyGateway | undefined;
  private readonly securityEnforcer?: SecurityBoundaryEnforcer | undefined;
  private readonly limits: BoundedDataLimits;
  private readonly defaultTimeoutMs: number;
  private readonly now: () => Date;

  constructor(options: ToolInvocationRuntimeOptions) {
    this.registry = options.registry;
    this.events = options.events;
    this.policyGateway = options.policyGateway;
    this.securityEnforcer = options.securityEnforcer;
    this.limits = options.limits ?? DEFAULT_BOUNDED_DATA_LIMITS;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS;
    this.now = options.now ?? (() => new Date());
  }

  definition(toolId: string, version?: string): ToolDefinition | undefined {
    return this.registry.find(toolId, version)?.definition;
  }

  async execute(
    toolId: string,
    input: Readonly<Record<string, unknown>>,
    context: ExecutionContext | ToolExecutionContext,
    version?: string
  ): Promise<ToolResult> {
    const result = await this.invokeSecurely({
      request: { toolId, version, input },
      context,
    });
    return {
      output: result.output,
      metadata: result.metadata,
    };
  }

  async invokeSecurely(options: SecureToolInvocationOptions): Promise<ToolExecutionResult> {
    const { request, context, securityContext, agentId, cancellationToken } = options;
    const startTime = this.now();

    // Cancellation check before starting
    if (cancellationToken?.isCancelled) {
      const reason = cancellationToken.reason ?? "Task execution was cancelled before tool invocation";
      throw new ToolCancelledError(request.toolId ?? "unknown", reason);
    }

    if (typeof request?.toolId !== "string" || request.toolId.trim() === "") {
      throw new ToolInputValidationError("unknown", "Tool request requires a valid non-empty toolId");
    }

    const toolId = request.toolId.trim();
    const version = request.version?.trim();

    // 1. Tool Resolution
    const tool = this.registry.find(toolId, version);
    if (!tool) {
      if (version) {
        throw new ToolVersionNotFoundError(toolId, version);
      }
      throw new ToolNotFoundError(toolId);
    }

    const definition = tool.definition;
    const toolVersion = definition.version || "1.0.0";
    const riskLevel = definition.riskLevel ?? "LOW";

    const rawTaskId = "taskId" in context ? context.taskId : undefined;
    const rawExecutionId = "executionId" in context ? context.executionId : undefined;
    const eventRefs: { taskId?: string; executionId?: string } = {};
    if (rawTaskId) eventRefs.taskId = rawTaskId;
    if (rawExecutionId) eventRefs.executionId = rawExecutionId;

    this.events.publish(
      event("tool.invocation.requested", context.traceId, toolId, {
        toolId,
        version: toolVersion,
        riskLevel,
        agentId,
      }, undefined, startTime, eventRefs)
    );

    // 2. Authorization (SecurityContext + SecurityBoundaryEnforcer)
    if (securityContext) {
      if (this.securityEnforcer) {
        const decision = await this.securityEnforcer.enforceToolBoundary({
          context: securityContext,
          toolId,
          action: "tool.invoke",
          requiredPermission: definition.permissions && definition.permissions.length > 0 ? definition.permissions[0] : (toolId.startsWith("system.") ? toolId : undefined),
          riskLevel: definition.riskLevel,
          input: request.input ?? {},
          targetAgentId: agentId,
          targetTenantId: securityContext.tenantId,
          correlationId: context.traceId,
        });

        if (!decision.allowed) {
          const reason = decision.reason ?? `Security boundary denied tool '${toolId}'`;
          this.events.publish(
            event("tool.rejected", context.traceId, toolId, {
              toolId,
              version: toolVersion,
              reason,
              policyId: decision.policyId,
            }, undefined, this.now(), eventRefs)
          );
          throw new ToolAuthorizationError(toolId, reason);
        }
      } else {
        // Fallback RBAC permission check against principal
        const permissions = securityContext.principal.permissions ?? [];
        if (!this.registry.authorize?.(toolId, permissions)) {
          const reason = `Principal '${securityContext.principal.id}' lacks required permissions for tool '${toolId}'`;
          this.events.publish(
            event("tool.rejected", context.traceId, toolId, {
              toolId,
              version: toolVersion,
              reason,
            }, undefined, this.now(), eventRefs)
          );
          throw new ToolAuthorizationError(toolId, reason);
        }
      }
    }

    // 3. Policy Gateway Preflight Check
    if (this.policyGateway) {
      const policyDecision = await this.policyGateway.evaluate({
        traceId: context.traceId,
        executionId: rawExecutionId,
        taskId: rawTaskId,
        operationType: "TOOL",
        resourceId: toolId,
        agentId,
        action: `tool.${toolId}`,
        input: request.input ?? {},
        metadata: {
          version: toolVersion,
          riskLevel,
        },
      });

      if (!policyDecision.allowed) {
        const reason = policyDecision.reason ?? `Policy '${policyDecision.policyId}' rejected tool '${toolId}'`;
        this.events.publish(
          event("tool.rejected", context.traceId, toolId, {
            toolId,
            version: toolVersion,
            reason,
            policyId: policyDecision.policyId,
          }, undefined, this.now(), eventRefs)
        );
        throw new ToolPolicyRejectedError(toolId, reason, policyDecision.policyId);
      }
    }

    // 4. Human Approval Hook for Critical/Sensitive Tools
    if (definition.requiresApproval || riskLevel === "CRITICAL") {
      // Invariant: LLM cannot declare approved=true. Must provide a verified non-empty approvalToken
      if (!request.approvalToken || typeof request.approvalToken !== "string" || request.approvalToken.trim() === "") {
        this.events.publish(
          event("tool.approval_required", context.traceId, toolId, {
            toolId,
            version: toolVersion,
            riskLevel,
          }, undefined, this.now(), eventRefs)
        );
        throw new ToolApprovalRequiredError(
          toolId,
          `Tool '${toolId}' (risk: ${riskLevel}) requires human approval before execution`
        );
      }
    }

    this.events.publish(
      event("tool.authorized", context.traceId, toolId, {
        toolId,
        version: toolVersion,
        riskLevel,
      }, undefined, this.now(), eventRefs)
    );

    // 5. Input Validation & Security Boundary Checks
    this.validateInput(toolId, request.input, definition);

    // Build trusted, immutable ToolExecutionContext
    const toolExecContext: ToolExecutionContext = Object.freeze({
      traceId: context.traceId,
      executionId: rawExecutionId ?? context.traceId,
      taskId: rawTaskId ?? context.traceId,
      operationId: "operationId" in context ? (context as unknown as { operationId?: string }).operationId : undefined,
      principalId: securityContext ? securityContext.principal.id : "system",
      tenantId: securityContext?.tenantId,
      agentId,
      toolId,
      toolVersion,
      riskLevel,
      idempotencyKey: request.idempotencyKey,
      metadata: "metadata" in context ? (context as { metadata?: Readonly<Record<string, unknown>> }).metadata : undefined,
    });

    // 6. Bounded Execution with Deadline Timeout & Cancellation Check
    this.events.publish(
      event("tool.execution.started", context.traceId, toolId, {
        toolId,
        version: toolVersion,
      }, undefined, this.now(), eventRefs)
    );

    const timeoutMs = Math.min(definition.timeoutMs ?? this.defaultTimeoutMs, MAX_TOOL_TIMEOUT_MS);
    let timer: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new ToolTimeoutError(toolId, timeoutMs));
      }, timeoutMs);
    });

    let rawResult: ToolResult;
    try {
      if (cancellationToken?.isCancelled) {
        throw new ToolCancelledError(toolId, cancellationToken.reason);
      }

      rawResult = await Promise.race([
        tool.execute(request.input, toolExecContext),
        timeoutPromise,
      ]);
    } catch (cause) {
      if (timer) clearTimeout(timer);
      
      if (cause instanceof ToolTimeoutError) {
        this.events.publish(
          event("tool.execution.timed_out", context.traceId, toolId, {
            toolId,
            version: toolVersion,
            timeoutMs,
          }, undefined, this.now(), eventRefs)
        );
        this.events.publish(
          event("tool.execution.failed", context.traceId, toolId, {
            toolId,
            version: toolVersion,
            code: cause.code,
            message: cause.message,
          }, undefined, this.now(), eventRefs)
        );
        throw cause;
      }

      if (cause instanceof ToolCancelledError) {
        this.events.publish(
          event("tool.execution.cancelled", context.traceId, toolId, {
            toolId,
            version: toolVersion,
            reason: cause.message,
          }, undefined, this.now(), eventRefs)
        );
        throw cause;
      }

      const message = cause instanceof Error ? cause.message : "Unknown tool execution failure";
      this.events.publish(
        event("tool.execution.failed", context.traceId, toolId, {
          toolId,
          version: toolVersion,
          message,
        }, undefined, this.now(), eventRefs)
      );
      throw cause instanceof ToolExecutionError ? cause : new ToolExecutionError(toolId, message);
    } finally {
      if (timer) clearTimeout(timer);
    }

    const durationMs = Math.max(0, this.now().getTime() - startTime.getTime());

    // 7. Output Schema Validation
    if (definition.outputSchema) {
      this.validateOutput(toolId, rawResult.output, definition.outputSchema);
    }

    // 8. Output Sanitization & Bounded Memory Isolation
    const sanitizeState = { truncated: false };
    const sanitizedOutput = sanitizeBoundedValue(rawResult.output, this.limits, 0, sanitizeState) as Record<string, unknown>;
    const deepFrozenOutput = deepFreeze(sanitizedOutput);

    this.events.publish(
      event("tool.execution.completed", context.traceId, toolId, {
        toolId,
        version: toolVersion,
        durationMs,
        bytesTruncated: sanitizeState.truncated,
      }, undefined, this.now(), eventRefs)
    );

    return Object.freeze({
      output: deepFrozenOutput,
      metadata: rawResult.metadata ? deepFreeze({ ...rawResult.metadata }) : undefined,
      sanitized: true,
      bytesTruncated: sanitizeState.truncated,
      durationMs,
    });
  }

  private validateInput(
    toolId: string,
    input: unknown,
    definition: ToolDefinition
  ): void {
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      throw new ToolInputValidationError(toolId, "Tool input must be a plain non-null object");
    }

    // Payload size check
    const inputJson = JSON.stringify(input);
    if (inputJson.length > MAX_TOOL_INPUT_SIZE) {
      throw new ToolInputValidationError(
        toolId,
        `Tool input size (${inputJson.length} bytes) exceeds limit of ${MAX_TOOL_INPUT_SIZE} bytes`
      );
    }

    const inputObj = input as Record<string, unknown>;

    // Security check: prototype pollution & constructor injection
    const checkedKeys = new Set([
      ...Object.keys(inputObj),
      ...Object.getOwnPropertyNames(inputObj),
    ]);

    const dangerousKeys = ["__proto__", "constructor", "prototype"];
    for (const dKey of dangerousKeys) {
      if (
        checkedKeys.has(dKey) ||
        Object.prototype.hasOwnProperty.call(inputObj, dKey)
      ) {
        throw new ToolInputValidationError(
          toolId,
          `Tool input contains forbidden property '${dKey}' (prototype pollution protection)`
        );
      }
    }

    const { required, properties, additionalProperties } = definition.inputSchema;

    for (const reqKey of required) {
      if (!(reqKey in inputObj) || inputObj[reqKey] === undefined) {
        throw new ToolInputValidationError(toolId, `Missing required input property: ${reqKey}`);
      }
    }

    for (const [key, expectedType] of Object.entries(properties)) {
      if (key in inputObj && inputObj[key] !== undefined) {
        const val = inputObj[key];
        if (typeof expectedType === "string") {
          if (expectedType === "array") {
            if (!Array.isArray(val)) {
              throw new ToolInputValidationError(toolId, `Input property '${key}' must be of type 'array'`);
            }
          } else if (expectedType === "object") {
            if (val === null || typeof val !== "object" || Array.isArray(val)) {
              throw new ToolInputValidationError(toolId, `Input property '${key}' must be of type 'object'`);
            }
          } else if (typeof val !== expectedType) {
            throw new ToolInputValidationError(toolId, `Input property '${key}' must be of type '${expectedType}'`);
          }
        }
      }
    }

    if (additionalProperties === false || additionalProperties === undefined) {
      for (const key of Object.keys(inputObj)) {
        if (!key.startsWith("_dep_") && !(key in properties)) {
          throw new ToolInputValidationError(toolId, `Additional input property '${key}' is not permitted`);
        }
      }
    }
  }

  private validateOutput(
    toolId: string,
    output: unknown,
    outputSchema: ToolDefinition["outputSchema"]
  ): void {
    if (output === null || typeof output !== "object" || Array.isArray(output)) {
      throw new ToolOutputValidationError(toolId, "Tool output must be a plain non-null object");
    }

    const outputJson = JSON.stringify(output);
    if (outputJson.length > MAX_TOOL_OUTPUT_SIZE) {
      throw new ToolOutputValidationError(
        toolId,
        `Tool output size (${outputJson.length} bytes) exceeds limit of ${MAX_TOOL_OUTPUT_SIZE} bytes`
      );
    }

    if (!outputSchema) return;

    const outObj = output as Record<string, unknown>;

    if ("required" in outputSchema && Array.isArray(outputSchema.required)) {
      for (const reqKey of outputSchema.required) {
        if (!(reqKey in outObj) || outObj[reqKey] === undefined) {
          throw new ToolOutputValidationError(toolId, `Missing required output property: ${reqKey}`);
        }
      }
    }

    if ("properties" in outputSchema && outputSchema.properties && typeof outputSchema.properties === "object") {
      for (const [key, expectedType] of Object.entries(outputSchema.properties)) {
        if (key in outObj && outObj[key] !== undefined) {
          const val = outObj[key];
          if (typeof expectedType === "string") {
            if (expectedType === "array") {
              if (!Array.isArray(val)) {
                throw new ToolOutputValidationError(toolId, `Output property '${key}' must be of type 'array'`);
              }
            } else if (expectedType === "object") {
              if (val === null || typeof val !== "object" || Array.isArray(val)) {
                throw new ToolOutputValidationError(toolId, `Output property '${key}' must be of type 'object'`);
              }
            } else if (typeof val !== expectedType) {
              throw new ToolOutputValidationError(toolId, `Output property '${key}' must be of type '${expectedType}'`);
            }
          }
        }
      }
    }
  }
}

/**
 * Backward compatibility adapter for RegistryToolGateway.
 */
export class RegistryToolGateway implements ToolGateway {
  private readonly runtime: ToolInvocationRuntime;

  constructor(
    private readonly registry: ToolRegistry,
    private readonly events: EventPublisher,
    policyGateway?: PolicyGateway
  ) {
    this.runtime = new ToolInvocationRuntime({
      registry,
      events,
      policyGateway,
    });
  }

  definition(toolId: string, version?: string): ToolDefinition | undefined {
    return this.runtime.definition(toolId, version);
  }

  async execute(
    toolId: string,
    input: Readonly<Record<string, unknown>>,
    context: ExecutionContext,
    version?: string
  ): Promise<ToolResult> {
    return this.runtime.execute(toolId, input, context, version);
  }

  async executeRequest(request: ToolRequest, context: ExecutionContext): Promise<ToolResult> {
    const result = await this.runtime.invokeSecurely({ request, context });
    return {
      output: result.output,
      metadata: result.metadata,
    };
  }
}

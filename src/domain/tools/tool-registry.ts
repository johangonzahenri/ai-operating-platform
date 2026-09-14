import { ExecutionContext } from "../execution/execution-context.js";
import { SecurityContext, RiskLevel } from "../security/security.js";
import { PolicyDeniedError } from "../policy/policy.js";

export type ToolValueType = "string" | "number" | "boolean" | "object" | "array";

export type ToolRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type ToolExecutionMode = "READ_ONLY" | "IDEMPOTENT" | "SIDE_EFFECTING" | "DESTRUCTIVE";

export interface ToolInputSchema {
  readonly required: readonly string[];
  readonly properties: Readonly<Record<string, ToolValueType | Readonly<Record<string, unknown>>>>;
  readonly additionalProperties?: boolean | undefined;
}

export interface ToolOutputSchema {
  readonly required?: readonly string[] | undefined;
  readonly properties?: Readonly<Record<string, ToolValueType | Readonly<Record<string, unknown>>>> | undefined;
  readonly schema?: Readonly<Record<string, unknown>> | undefined;
}

export interface ToolDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly version?: string | undefined;
  readonly inputSchema: ToolInputSchema;
  readonly outputSchema?: ToolOutputSchema | Readonly<Record<string, unknown>> | undefined;
  readonly permissions?: readonly string[] | undefined;
  readonly riskLevel?: ToolRiskLevel | undefined;
  readonly executionMode?: ToolExecutionMode | undefined;
  readonly timeoutMs?: number | undefined;
  readonly requiresApproval?: boolean | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export interface ToolRequest {
  readonly toolId: string;
  readonly version?: string | undefined;
  readonly input: Readonly<Record<string, unknown>>;
  readonly idempotencyKey?: string | undefined;
  readonly approvalToken?: string | undefined;
}

export interface ToolResult {
  readonly output: Readonly<Record<string, unknown>>;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export interface ToolExecutionContext {
  readonly traceId: string;
  readonly executionId: string;
  readonly taskId: string;
  readonly operationId?: string | undefined;
  readonly principalId: string;
  readonly tenantId?: string | undefined;
  readonly agentId?: string | undefined;
  readonly toolId: string;
  readonly toolVersion?: string | undefined;
  readonly riskLevel: ToolRiskLevel;
  readonly deadline?: Date | undefined;
  readonly idempotencyKey?: string | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export interface ToolExecutionResult {
  readonly output: Readonly<Record<string, unknown>>;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
  readonly sanitized: boolean;
  readonly bytesTruncated: boolean;
  readonly durationMs: number;
}

// Limits
export const MAX_TOOL_INPUT_SIZE = 65536; // 64KB
export const MAX_TOOL_OUTPUT_SIZE = 1048576; // 1MB
export const DEFAULT_TOOL_TIMEOUT_MS = 30000; // 30s
export const MAX_TOOL_TIMEOUT_MS = 300000; // 5min
export const MAX_CONCURRENT_TOOLS = 10;

// Standardized Domain Errors
export class ToolDefinitionError extends Error {
  readonly code = "TOOL_DEFINITION_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "ToolDefinitionError";
  }
}

export class ToolNotFoundError extends Error {
  readonly code = "TOOL_NOT_FOUND";
  constructor(readonly toolId: string) {
    super(`Tool not found: ${toolId}`);
    this.name = "ToolNotFoundError";
  }
}

export class ToolVersionNotFoundError extends Error {
  readonly code = "TOOL_VERSION_NOT_FOUND";
  constructor(readonly toolId: string, readonly version: string) {
    super(`Tool version not found: ${toolId}@${version}`);
    this.name = "ToolVersionNotFoundError";
  }
}

export class ToolValidationError extends Error {
  readonly code = "TOOL_INPUT_INVALID";
  constructor(readonly toolId: string, message: string) {
    super(message);
    this.name = "ToolValidationError";
  }
}

export class ToolInputValidationError extends ToolValidationError {
  constructor(toolId: string, message: string) {
    super(toolId, message);
    this.name = "ToolInputValidationError";
  }
}

export class ToolOutputValidationError extends Error {
  readonly code = "TOOL_OUTPUT_INVALID";
  constructor(readonly toolId: string, message: string) {
    super(message);
    this.name = "ToolOutputValidationError";
  }
}

export class ToolExecutionError extends Error {
  readonly code: string = "TOOL_EXECUTION_FAILED";
  constructor(readonly toolId: string, message: string) {
    super(message);
    this.name = "ToolExecutionError";
  }
}

export class ToolTimeoutError extends ToolExecutionError {
  override readonly code: string = "TOOL_TIMEOUT";
  constructor(toolId: string, timeoutMs: number) {
    super(toolId, `Tool '${toolId}' execution timed out after ${timeoutMs}ms`);
    this.name = "ToolTimeoutError";
  }
}

export class ToolCancelledError extends ToolExecutionError {
  override readonly code: string = "TOOL_CANCELLED";
  constructor(toolId: string, reason = "Tool execution cancelled") {
    super(toolId, reason);
    this.name = "ToolCancelledError";
  }
}

export class ToolRateLimitedError extends ToolExecutionError {
  override readonly code: string = "TOOL_RATE_LIMITED";
  constructor(toolId: string, message = "Tool rate limit exceeded") {
    super(toolId, message);
    this.name = "ToolRateLimitedError";
  }
}

export class ToolAuthorizationError extends Error {
  readonly code = "TOOL_UNAUTHORIZED";
  constructor(readonly toolId: string, message = `Tool '${toolId}' is not authorized for this context`) {
    super(message);
    this.name = "ToolAuthorizationError";
  }
}

export class ToolApprovalRequiredError extends Error {
  readonly code = "TOOL_APPROVAL_REQUIRED";
  constructor(readonly toolId: string, message = `Tool '${toolId}' requires explicit human approval before execution`) {
    super(message);
    this.name = "ToolApprovalRequiredError";
  }
}

export class ToolPolicyRejectedError extends PolicyDeniedError {
  readonly code = "TOOL_POLICY_REJECTED";
  constructor(readonly toolId: string, message: string, policyId = "tool-policy-rejected") {
    super(policyId, toolId, message);
    this.name = "ToolPolicyRejectedError";
  }
}

export interface Tool {
  readonly definition: ToolDefinition;
  execute(
    input: Readonly<Record<string, unknown>>,
    context: ExecutionContext | ToolExecutionContext
  ): Promise<ToolResult>;
}

export interface ToolDiscoveryOptions {
  readonly securityContext?: SecurityContext | undefined;
  readonly agentId?: string | undefined;
  readonly tenantId?: string | undefined;
}

export interface ToolRegistry {
  register(tool: Tool): void;
  unregister?(id: string, version?: string): boolean;
  find(id: string, version?: string): Tool | undefined;
  get?(id: string, version?: string): Tool;
  list(): readonly ToolDefinition[];
  listVersions?(id: string): readonly string[];
  validate?(id: string, input: Readonly<Record<string, unknown>>, version?: string): boolean;
  authorize?(toolId: string, permissions: readonly string[]): boolean;
  discoverSafeDefinitions?(options?: ToolDiscoveryOptions): readonly ToolDefinition[];
}

export interface ToolGateway {
  execute(
    toolId: string,
    input: Readonly<Record<string, unknown>>,
    context: ExecutionContext | ToolExecutionContext,
    version?: string
  ): Promise<ToolResult>;
  definition?(toolId: string, version?: string): ToolDefinition | undefined;
}

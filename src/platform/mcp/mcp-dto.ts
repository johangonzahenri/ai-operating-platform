/**
 * AI Operating Platform - MCP Protocol Specification Constants and DTOs
 * 
 * Formal DTO definitions and protocol constants conforming to the
 * Model Context Protocol (MCP) specification (2026-07-28 revision).
 * 
 * Invariants:
 * 1. Bounded JSON-RPC 2.0 structures.
 * 2. Zero leak of internal domain secrets, database models, or stack traces.
 * 3. Exact mapping of Tool Definition and Execution Results.
 * 4. Protocol version compatibility and negotiation (supported: "2026-07-28", "2024-11-05").
 */

export const MCP_PROTOCOL_VERSION = "2026-07-28";
export const MCP_SUPPORTED_PROTOCOL_VERSIONS: readonly string[] = Object.freeze([
  "2026-07-28",
  "2024-11-05",
]);

export const JSONRPC_VERSION = "2.0";

// Standard JSON-RPC and MCP Error Codes
export const McpErrorCodes = {
  // Standard JSON-RPC 2.0
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // MCP domain / governance codes
  UNAUTHENTICATED: -32001,
  UNAUTHORIZED: -32002,
  TENANT_MISMATCH: -32003,
  RATE_LIMITED: -32004,
  TOOL_NOT_FOUND: -32005,
  EXECUTION_FAILED: -32006,
  HITL_SUSPENDED: -32007,
  RESOURCE_NOT_FOUND: -32008,
  POLICY_DENIED: -32009,

  // PascalCase aliases
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  Unauthenticated: -32001,
  Unauthorized: -32002,
  Forbidden: -32002,
  TenantMismatch: -32003,
  RateLimited: -32004,
  ToolNotFound: -32005,
  ExecutionFailed: -32006,
  HitlSuspended: -32007,
  ResourceNotFound: -32008,
  PolicyDenied: -32009,
} as const;

export type McpErrorCode = typeof McpErrorCodes[keyof typeof McpErrorCodes];

export interface McpJsonRpcRequest<TParams = unknown> {
  readonly jsonrpc: "2.0";
  readonly id?: string | number | null | undefined;
  readonly method: string;
  readonly params?: TParams | undefined;
}

export type McpRequestDto<T = unknown> = McpJsonRpcRequest<T>;

export interface McpJsonRpcResponse<TResult = unknown> {
  readonly jsonrpc: "2.0";
  readonly id: string | number | null;
  readonly result?: TResult | undefined;
  readonly error?: McpErrorDto | undefined;
}

export type McpResponseDto<T = unknown> = McpJsonRpcResponse<T>;
export type McpInitializeResultDto = McpInitializeResult;
export type McpToolsListResultDto = McpListToolsResult;
export type McpCallToolResultDto = McpCallToolResult;
export type McpResourcesListResultDto = McpListResourcesResult;
export type McpResourceReadResultDto = McpReadResourceResult;
export type McpPromptsListResultDto = McpListPromptsResult;


export interface McpErrorDto {
  readonly code: number;
  readonly message: string;
  readonly data?: Readonly<Record<string, unknown>> | undefined;
}

export interface McpServerCapabilities {
  readonly tools?: {
    readonly listChanged?: boolean | undefined;
  } | undefined;
  readonly resources?: {
    readonly subscribe?: boolean | undefined;
    readonly listChanged?: boolean | undefined;
  } | undefined;
  readonly prompts?: {
    readonly listChanged?: boolean | undefined;
  } | undefined;
  readonly logging?: Readonly<Record<string, unknown>> | undefined;
}

export interface McpClientCapabilities {
  readonly roots?: {
    readonly listChanged?: boolean | undefined;
  } | undefined;
  readonly sampling?: Readonly<Record<string, unknown>> | undefined;
  readonly experimental?: Readonly<Record<string, unknown>> | undefined;
}

export interface McpImplementationInfo {
  readonly name: string;
  readonly version: string;
  readonly title?: string | undefined;
}

export interface McpInitializeParams {
  readonly protocolVersion: string;
  readonly capabilities: McpClientCapabilities;
  readonly clientInfo: McpImplementationInfo;
}

export interface McpInitializeResult {
  readonly protocolVersion: string;
  readonly capabilities: McpServerCapabilities;
  readonly serverInfo: McpImplementationInfo;
  readonly instructions?: string | undefined;
}

export interface McpToolExecutionHintsDto {
  readonly readOnlyHint?: boolean | undefined;
  readonly destructiveHint?: boolean | undefined;
  readonly idempotentHint?: boolean | undefined;
  readonly openWorldHint?: boolean | undefined;
}

export interface McpToolDefinitionDto {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
  readonly outputSchema?: Readonly<Record<string, unknown>> | undefined;
  readonly executionHints?: McpToolExecutionHintsDto | undefined;
  readonly schemaVersion?: string | undefined;
}

export interface McpListToolsResult {
  readonly tools: readonly McpToolDefinitionDto[];
  readonly nextCursor?: string | undefined;
}

export interface McpCallToolParams {
  readonly name: string;
  readonly arguments?: Readonly<Record<string, unknown>> | undefined;
  readonly toolVersion?: string | undefined;
  readonly idempotencyKey?: string | undefined;
  readonly approvalToken?: string | undefined;
}

export interface McpTextContent {
  readonly type: "text";
  readonly text: string;
}

export interface McpResourceContent {
  readonly type: "resource";
  readonly resource: {
    readonly uri: string;
    readonly mimeType?: string | undefined;
    readonly text?: string | undefined;
    readonly blob?: string | undefined;
  };
}

export type McpContentItem = McpTextContent | McpResourceContent;

export interface McpCallToolResult {
  readonly content: readonly McpContentItem[];
  readonly isError?: boolean | undefined;
  readonly structuredContent?: Readonly<Record<string, unknown>> | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export interface McpResourceDto {
  readonly uri: string;
  readonly name: string;
  readonly description?: string | undefined;
  readonly mimeType?: string | undefined;
}

export interface McpListResourcesResult {
  readonly resources: readonly McpResourceDto[];
  readonly nextCursor?: string | undefined;
}

export interface McpReadResourceParams {
  readonly uri: string;
}

export interface McpReadResourceResult {
  readonly contents: readonly {
    readonly uri: string;
    readonly mimeType?: string | undefined;
    readonly text?: string | undefined;
    readonly blob?: string | undefined;
  }[];
}

export interface McpPromptDto {
  readonly name: string;
  readonly description?: string | undefined;
  readonly arguments?: readonly {
    readonly name: string;
    readonly description?: string | undefined;
    readonly required?: boolean | undefined;
  }[] | undefined;
}

export interface McpListPromptsResult {
  readonly prompts: readonly McpPromptDto[];
  readonly nextCursor?: string | undefined;
}

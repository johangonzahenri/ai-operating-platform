/**
 * AI Operating Platform - MCP Error Mapping and Sanitization
 * 
 * Maps internal Platform, Domain, and Application errors to standard, safe MCP JSON-RPC errors.
 * 
 * Invariants:
 * 1. Zero leak of raw stack traces, file paths, SQL queries, or internal secrets.
 * 2. Stable, predictable error codes and human-readable explanations.
 * 3. Preserves trace correlation IDs for observability.
 */

import { McpErrorCodes, McpErrorDto } from "./mcp-dto.js";
import {
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
  ToolRateLimitedError,
  ToolIdempotencyConflictError,
  ToolConcurrentExecutionConflictError,
} from "../../domain/tools/tool-registry.js";
import {
  SelfApprovalError,
  ApprovalExpiredError,
} from "../../domain/workflow/approval-errors.js";
import {
  HITLInvalidTokenError,
  HITLSuspensionExpiredError,
  HITLSuspensionStateConflictError,
  HITLTenantMismatchError,
} from "../../domain/workflow/hitl-bridge.js";
import { UntrustedControlDataError } from "../../domain/security/taint-tracking.js";

export function mapToMcpError(err: unknown, traceId?: string): McpErrorDto {
  const correlationData = traceId ? { traceId } : undefined;

  if (err instanceof ToolNotFoundError || err instanceof ToolVersionNotFoundError) {
    return {
      code: McpErrorCodes.TOOL_NOT_FOUND,
      message: err.message,
      data: correlationData,
    };
  }

  if (err instanceof ToolInputValidationError || err instanceof ToolValidationError) {
    return {
      code: McpErrorCodes.INVALID_PARAMS,
      message: err.message,
      data: correlationData,
    };
  }

  if (err instanceof ToolAuthorizationError) {
    return {
      code: McpErrorCodes.UNAUTHORIZED,
      message: err.message,
      data: correlationData,
    };
  }

  if (err instanceof ToolPolicyRejectedError) {
    return {
      code: McpErrorCodes.POLICY_DENIED,
      message: err.message,
      data: correlationData ? { ...correlationData, policyId: err.policyId } : undefined,
    };
  }

  if (err instanceof ToolRateLimitedError) {
    return {
      code: McpErrorCodes.RATE_LIMITED,
      message: err.message,
      data: correlationData
        ? { ...correlationData, retryAfterMs: err.retryAfterMs }
        : err.retryAfterMs ? { retryAfterMs: err.retryAfterMs } : undefined,
    };
  }

  if (err instanceof ToolApprovalRequiredError) {
    return {
      code: McpErrorCodes.HITL_SUSPENDED,
      message: err.message,
      data: correlationData,
    };
  }

  if (err instanceof ToolIdempotencyConflictError || err instanceof ToolConcurrentExecutionConflictError) {
    return {
      code: McpErrorCodes.INVALID_PARAMS,
      message: err.message,
      data: correlationData,
    };
  }

  if (err instanceof SelfApprovalError) {
    return {
      code: McpErrorCodes.UNAUTHORIZED,
      message: err.message,
      data: correlationData ? { ...correlationData, approverId: err.approverId } : undefined,
    };
  }

  if (err instanceof HITLTenantMismatchError) {
    return {
      code: McpErrorCodes.TENANT_MISMATCH,
      message: err.message,
      data: correlationData,
    };
  }

  if (err instanceof HITLInvalidTokenError || err instanceof HITLSuspensionExpiredError || err instanceof HITLSuspensionStateConflictError) {
    return {
      code: McpErrorCodes.INVALID_PARAMS,
      message: err.message,
      data: correlationData,
    };
  }

  if (err instanceof UntrustedControlDataError) {
    return {
      code: McpErrorCodes.UNAUTHORIZED,
      message: `Taint boundary violation: ${err.message}`,
      data: correlationData ? { ...correlationData, field: err.fieldName } : undefined,
    };
  }

  if (err instanceof ToolTimeoutError) {
    return {
      code: McpErrorCodes.EXECUTION_FAILED,
      message: err.message,
      data: correlationData,
    };
  }

  if (err instanceof ToolCancelledError) {
    return {
      code: McpErrorCodes.EXECUTION_FAILED,
      message: err.message,
      data: correlationData,
    };
  }

  if (err instanceof ToolExecutionError) {
    return {
      code: McpErrorCodes.EXECUTION_FAILED,
      message: err.message,
      data: correlationData,
    };
  }

  // Name and code duck typing
  const errObj = (err && typeof err === "object") ? (err as Record<string, unknown>) : {};
  const errName = typeof errObj.name === "string" ? errObj.name : "";
  const errCode = typeof errObj.code === "string" ? errObj.code : "";
  const message = err instanceof Error ? err.message : String(err);

  if (errName === "AuthenticationError" || errCode === "UNAUTHENTICATED" || message.toLowerCase().includes("authentication required") || message.toLowerCase().includes("unauthenticated") || message.toLowerCase().includes("authentication failed")) {
    return {
      code: McpErrorCodes.UNAUTHENTICATED,
      message,
      data: correlationData,
    };
  }

  if (errName === "ToolAuthorizationError" || errCode === "TOOL_UNAUTHORIZED" || message.includes("not authorized") || message.includes("Access denied") || message.includes("lacks permissions")) {
    return {
      code: McpErrorCodes.UNAUTHORIZED,
      message,
      data: correlationData,
    };
  }

  if (errName === "ToolPolicyRejectedError" || errCode === "TOOL_POLICY_REJECTED" || message.includes("policy")) {
    return {
      code: McpErrorCodes.POLICY_DENIED,
      message,
      data: correlationData,
    };
  }

  if (errName === "ToolRateLimitedError" || errCode === "TOOL_RATE_LIMITED" || message.includes("rate limit")) {
    return {
      code: McpErrorCodes.RATE_LIMITED,
      message,
      data: correlationData,
    };
  }

  if (errName === "ToolNotFoundError" || errCode === "TOOL_NOT_FOUND" || message.includes("not found")) {
    if (message.includes("Resource '") || message.includes("resource")) {
      return {
        code: McpErrorCodes.RESOURCE_NOT_FOUND,
        message,
        data: correlationData,
      };
    }
    return {
      code: McpErrorCodes.TOOL_NOT_FOUND,
      message,
      data: correlationData,
    };
  }

  if (errName === "HITLTenantMismatchError" || message.includes("Tenant mismatch")) {
    return {
      code: McpErrorCodes.TENANT_MISMATCH,
      message,
      data: correlationData,
    };
  }

  // Generic fallback with zero secret leak
  return {
    code: McpErrorCodes.INTERNAL_ERROR,
    message: err instanceof Error ? err.message : "An internal error occurred during MCP request processing",
    data: correlationData,
  };
}

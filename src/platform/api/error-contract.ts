import { RequestContext } from "../../domain/context/request-context.js";

export type ApiErrorCode =
  | "VALIDATION"
  | "AUTHENTICATION"
  | "AUTHORIZATION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "DEPENDENCY_UNAVAILABLE"
  | "DEVICE_UNAVAILABLE"
  | "CAPABILITY_UNSUPPORTED"
  | "INTERNAL";

export interface StandardApiErrorPayload {
  readonly error: {
    readonly code: ApiErrorCode | string;
    readonly message: string;
    readonly requestId?: string | undefined;
    readonly correlationId?: string | undefined;
    readonly details?: Readonly<Record<string, unknown>> | undefined;
  };
  readonly status: number;
}

export const ERROR_STATUS_MAP: Readonly<Record<ApiErrorCode, number>> = Object.freeze({
  VALIDATION: 400,
  AUTHENTICATION: 401,
  AUTHORIZATION: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  DEPENDENCY_UNAVAILABLE: 503,
  DEVICE_UNAVAILABLE: 503,
  CAPABILITY_UNSUPPORTED: 400,
  INTERNAL: 500,
});

export function sanitizeErrorDetails(details?: unknown): Record<string, unknown> {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return {};
  }
  const clean: Record<string, unknown> = {};
  const forbiddenPatterns = ["secret", "password", "key", "token", "auth", "bearer", "stack", "trace", "path"];

  for (const [k, v] of Object.entries(details)) {
    const lowerKey = k.toLowerCase();
    if (forbiddenPatterns.some((pattern) => lowerKey.includes(pattern))) {
      clean[k] = "[REDACTED]";
    } else if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      clean[k] = v;
    } else if (Array.isArray(v)) {
      clean[k] = v.filter((item) => typeof item === "string" || typeof item === "number" || typeof item === "boolean");
    }
  }
  return clean;
}

export function formatApiError(
  code: ApiErrorCode | string,
  message: string,
  status?: number,
  reqCtx?: { readonly requestId?: string | undefined; readonly correlationId?: string | undefined } | RequestContext,
  details?: Record<string, unknown>
): StandardApiErrorPayload {
  const resolvedStatus = status ?? ((code in ERROR_STATUS_MAP) ? ERROR_STATUS_MAP[code as ApiErrorCode] : 500);
  const cleanDetails = sanitizeErrorDetails(details);

  return {
    error: {
      code,
      message,
      requestId: reqCtx?.requestId,
      correlationId: reqCtx?.correlationId,
      details: Object.keys(cleanDetails).length > 0 ? cleanDetails : undefined,
    },
    status: resolvedStatus,
  };
}

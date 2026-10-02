/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * Neutral Asynchronous Worker Protocol Contracts & Task Envelopes.
 * 
 * Invariants:
 * - Domain layer is 100% pure: ZERO imports of Worker, postMessage, DOM, or browser runtime.
 * - Versioned protocol envelopes: VTO_WORKER_PROTOCOL_V1.
 * - Strict operation allowlist: POSE_PREPROCESS | GARMENT_WARP | DEPTH_OCCLUSION | NEURAL_INFERENCE.
 * - Explicit fail-closed status and structured error taxonomy.
 * - Deterministic serialization & transferable descriptor specifications.
 */

export const VTO_WORKER_PROTOCOL_VERSION = "1.0.0";

export type VtoWorkerOperation =
  | "POSE_PREPROCESS"
  | "GARMENT_WARP"
  | "DEPTH_OCCLUSION"
  | "NEURAL_INFERENCE"
  | "FRAME_PREPROCESS";

export type VtoWorkerTaskStatus =
  | "ACCEPTED"
  | "QUEUED"
  | "RUNNING"
  | "COMPLETED"
  | "SUCCESS"
  | "FAILED"
  | "ERROR"
  | "CANCELLED"
  | "TIMEOUT"
  | "REJECTED";

export type VtoWorkerErrorCode =
  | "INVALID_PROTOCOL_VERSION"
  | "UNSUPPORTED_PROTOCOL_VERSION"
  | "UNAUTHORIZED_OPERATION"
  | "UNKNOWN_OPERATION"
  | "INVALID_REQUEST_PAYLOAD"
  | "INVALID_ENVELOPE"
  | "INVALID_PAYLOAD"
  | "INVALID_RESPONSE_PAYLOAD"
  | "WORKER_UNAVAILABLE"
  | "WORKER_TERMINATED"
  | "EXECUTION_TIMEOUT"
  | "EXECUTION_CANCELLED"
  | "BACKPRESSURE_REJECTED"
  | "BACKPRESSURE_LIMIT_EXCEEDED"
  | "EXECUTION_FAILURE"
  | "PROTOCOL_ERROR";

export interface VtoWorkerError {
  readonly code: VtoWorkerErrorCode;
  readonly message: string;
  readonly details?: string | undefined;
}

export interface VtoWorkerMetrics {
  readonly queueDurationMs: number;
  readonly executionDurationMs: number;
  readonly totalDurationMs: number;
  readonly transferredBytes?: number | undefined;
  readonly workerExecutionMs?: number | undefined;
  readonly roundTripLatencyMs?: number | undefined;
  readonly serializedPayloadBytes?: number | undefined;
}

/**
 * Main Thread -> Worker Request Envelope
 */
export interface VtoWorkerRequest<TPayload = unknown> {
  readonly protocolVersion: string;
  readonly requestId: string;
  readonly operation: VtoWorkerOperation;
  readonly payload: TPayload;
  readonly timestampMs?: number | undefined;
  readonly timeoutMs?: number | undefined;
  readonly tenantId?: string | undefined;
  readonly applicationId?: string | undefined;
}

/**
 * Worker -> Main Thread Response Envelope
 */
export interface VtoWorkerResponse<TResult = unknown> {
  readonly protocolVersion: string;
  readonly requestId: string;
  readonly operation: VtoWorkerOperation;
  readonly status: VtoWorkerTaskStatus;
  readonly result?: TResult | undefined;
  readonly payload?: TResult | undefined;
  readonly error?: VtoWorkerError | undefined;
  readonly metrics: VtoWorkerMetrics;
  readonly completedAtMs: number;
}

/**
 * Transferable metadata specification describing buffer ownership handover.
 */
export interface TransferableBufferSpec {
  readonly bufferName: string;
  readonly byteLength: number;
  readonly wasTransferred: boolean;
}

export interface VtoWorkerValidationResult {
  readonly isValid: boolean;
  readonly valid: boolean;
  readonly error?: VtoWorkerError | undefined;
  readonly errorCode?: VtoWorkerErrorCode | undefined;
}

/**
 * Validates structural integrity of an incoming worker request envelope.
 */
export function validateVtoWorkerRequest(req: unknown): VtoWorkerValidationResult {
  if (!req || typeof req !== "object") {
    const error: VtoWorkerError = { code: "INVALID_REQUEST_PAYLOAD", message: "Request envelope must be a non-null object" };
    return { isValid: false, valid: false, error, errorCode: "INVALID_REQUEST_PAYLOAD" };
  }

  const r = req as Partial<VtoWorkerRequest>;

  if (!r.requestId || typeof r.requestId !== "string" || r.requestId.trim() === "" || !r.operation) {
    const error: VtoWorkerError = { code: "INVALID_ENVELOPE", message: "Missing or invalid requestId or operation" };
    return { isValid: false, valid: false, error, errorCode: "INVALID_ENVELOPE" };
  }

  if (r.protocolVersion !== VTO_WORKER_PROTOCOL_VERSION) {
    const error: VtoWorkerError = {
      code: "UNSUPPORTED_PROTOCOL_VERSION",
      message: `Unsupported protocol version "${r.protocolVersion}". Expected "${VTO_WORKER_PROTOCOL_VERSION}"`,
    };
    return { isValid: false, valid: false, error, errorCode: "UNSUPPORTED_PROTOCOL_VERSION" };
  }

  const validOperations: readonly VtoWorkerOperation[] = [
    "POSE_PREPROCESS",
    "GARMENT_WARP",
    "DEPTH_OCCLUSION",
    "NEURAL_INFERENCE",
    "FRAME_PREPROCESS",
  ];

  if (!validOperations.includes(r.operation as VtoWorkerOperation)) {
    const error: VtoWorkerError = {
      code: "UNKNOWN_OPERATION",
      message: `Unknown operation "${r.operation}" is not in the allowed operations catalog`,
    };
    return { isValid: false, valid: false, error, errorCode: "UNKNOWN_OPERATION" };
  }

  if (r.payload === undefined) {
    const error: VtoWorkerError = { code: "INVALID_PAYLOAD", message: "Request payload must be defined" };
    return { isValid: false, valid: false, error, errorCode: "INVALID_PAYLOAD" };
  }

  return { isValid: true, valid: true };
}

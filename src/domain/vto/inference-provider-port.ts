/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * On-Device Inference Provider Port & Domain Contracts.
 * 
 * Invariants:
 * - Domain is completely isolated from GPU APIs (zero hardware or browser runtime bindings).
 * - Explicit lifecycle states: UNINITIALIZED -> INITIALIZING -> READY -> DISPOSED -> DEGRADED.
 * - Supports AbortSignal for timeouts and cancellations.
 * - Strict latency, device state and error status recording.
 */

import { Tensor } from "./neural-tensor.js";
import { MicroModelManifest } from "./neural-model.js";

export type InferenceProviderType = "CPU_REFERENCE" | "WEBGPU" | "FALLBACK_CPU";

export type InferenceLifecycleStatus =
  | "UNINITIALIZED"
  | "INITIALIZING"
  | "READY"
  | "INFERRING"
  | "DEGRADED"
  | "DEVICE_LOST"
  | "DISPOSED";

export type InferenceExecutionStatus =
  | "SUCCESS"
  | "DEGRADED"
  | "FALLBACK_APPLIED"
  | "VALIDATION_FAILED"
  | "MODEL_INTEGRITY_FAILED"
  | "DEVICE_LOST"
  | "ABORTED"
  | "TIMEOUT"
  | "ERROR";

export interface InferenceProviderCapabilities {
  readonly providerId: string;
  readonly providerType: InferenceProviderType;
  readonly isHardwareAccelerated: boolean;
  readonly supportsFp16: boolean;
  readonly maxBufferBytes: number;
  readonly isAvailableInEnvironment: boolean;
  readonly environmentReason?: string;
}

export interface InferenceRequest {
  readonly requestId: string;
  readonly tenantId: string;
  readonly applicationId: string;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly inputs: ReadonlyMap<string, Tensor>;
  readonly timeoutMs?: number;
  readonly abortSignal?: AbortSignal;
}

export interface InferenceMetrics {
  readonly queueLatencyMs: number;
  readonly computeLatencyMs: number;
  readonly readbackLatencyMs: number;
  readonly totalDurationMs: number;
  readonly isWarmStart: boolean;
}

export interface InferenceResult {
  readonly requestId: string;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly providerId: string;
  readonly providerType: InferenceProviderType;
  readonly status: InferenceExecutionStatus;
  readonly outputs: ReadonlyMap<string, Tensor>;
  readonly metrics: InferenceMetrics;
  readonly errorDetails?: string;
}

export interface OnDeviceInferenceProviderPort {
  readonly providerId: string;
  readonly providerType: InferenceProviderType;
  readonly lifecycleStatus: InferenceLifecycleStatus;

  getCapabilities(): Promise<InferenceProviderCapabilities>;
  loadModel(manifest: MicroModelManifest): Promise<void>;
  infer(request: InferenceRequest): Promise<InferenceResult>;
  dispose(): Promise<void>;
}

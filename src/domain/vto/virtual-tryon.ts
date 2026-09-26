/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * Virtual Try-On (VTO) & Spatial Commerce Domain Model.
 * 
 * Invariants:
 * 1. Provider-Neutral: Abstract contracts independent of specific AI/VTO vendors (FASHN, on-device ONNX, MediaPipe).
 * 2. Hexagonal Boundary: Pure domain entities with zero external dependencies (no Three.js, no WebXR, no vendor SDKs).
 * 3. Privacy by Design: Ephemeral asset references, strict retention policies, no biometric identification.
 * 4. Deterministic State Machine: Explicit states (CREATED -> VALIDATING -> QUEUED -> RUNNING -> COMPLETED | FAILED | CANCELLED | EXPIRED).
 * 5. Idempotent Execution: Requests with same key and payload produce consistent idempotent resolution.
 */

// ============================================================================
// 1. IDENTIFIERS & ENUMS
// ============================================================================

export type VirtualTryOnStatus =
  | "CREATED"
  | "VALIDATING"
  | "QUEUED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED";

export type GarmentCategory =
  | "UPPER_BODY"   // Tops, Shirts, Jackets, Blouses, Hoodies
  | "LOWER_BODY"   // Pants, Skirts, Shorts, Jeans
  | "FULL_BODY"    // Dresses, Jumpsuits, Overalls
  | "FOOTWEAR"     // Shoes, Sneakers, Boots
  | "ACCESSORY"    // Bags, Hats, Belts, Scarves
  | "EYEWEAR"      // Glasses, Sunglasses
  | "JEWELRY";     // Necklaces, Earrings, Bracelets

export type BodyProfileType =
  | "ANONYMOUS_ESTIMATE"
  | "KNOWN_PRESET"
  | "USER_CALIBRATED"
  | "PARAMETRIC_MEASUREMENTS";

export type ImageSourceType =
  | "URL"
  | "ARTIFACT_REF"
  | "EPHEMERAL_BUFFER_REF"
  | "DATA_URI";

export type PrivacyRetentionMode =
  | "EPHEMERAL_SESSION" // Frame/result destroyed immediately after rendering (< 1 min)
  | "CACHE_TEMPORARY"    // Retained in encrypted ephemeral cache up to specified TTL
  | "PERSISTENT_CONSENT"; // User explicitly requested saving to style profile

export type VtoExecutionTier =
  | "TIER_1_ON_DEVICE_NEURAL"   // WebGPU / WASM Local Low-Latency Real-Time
  | "TIER_2_ON_DEVICE_STANDARD" // WebGL2 / MediaPipe Standard Fallback
  | "TIER_3_ASYNC_WORKER"       // Background Worker Low-Poly / Interpolated
  | "TIER_4_CLOUD_NEURAL";      // Cloud High-Fidelity Diffusion Composition

// ============================================================================
// 2. INPUT & REFERENCE CONTRACTS
// ============================================================================

export interface ImageAssetReference {
  readonly referenceId: string;
  readonly sourceType: ImageSourceType;
  readonly uriOrHandle: string;
  readonly mimeType: "image/jpeg" | "image/png" | "image/webp" | "image/avif";
  readonly widthPx?: number | undefined;
  readonly heightPx?: number | undefined;
  readonly checksumSha256?: string | undefined;
}

export interface GarmentReference {
  readonly productId: string;
  readonly variantId?: string | undefined;
  readonly sku?: string | undefined;
  readonly name: string;
  readonly brand?: string | undefined;
  readonly category: GarmentCategory;
  readonly size?: string | undefined;
  readonly color?: string | undefined;
  readonly primaryAsset: ImageAssetReference;
  readonly visualAssets?: readonly ImageAssetReference[] | undefined;
  readonly threeDModelUri?: string | undefined; // glTF/GLB optional 3D asset
  readonly attributes?: Readonly<Record<string, string | number | boolean>> | undefined;
}

export interface BodyMeasurements {
  readonly heightCm: number;
  readonly chestBustCm?: number | undefined;
  readonly waistCm?: number | undefined;
  readonly hipsCm?: number | undefined;
  readonly inseamCm?: number | undefined;
  readonly shoulderWidthCm?: number | undefined;
  readonly headCircumferenceCm?: number | undefined;
  readonly footLengthCm?: number | undefined;
}

export interface BodyProfileReference {
  readonly profileId: string;
  readonly profileType: BodyProfileType;
  readonly presetName?: string | undefined; // e.g., "Nova", "Sora", "Mateo", "Standard-F", "Standard-M"
  readonly genderPresentation?: "FEMININE" | "MASCULINE" | "NEUTRAL" | undefined;
  readonly measurements?: BodyMeasurements | undefined;
  readonly referenceImage?: ImageAssetReference | undefined;
}

export interface PoseReference {
  readonly poseType: "FRONTAL_STAND" | "SIDE_PROFILE" | "SEATED" | "WALKING" | "CUSTOM";
  readonly landmarksCount?: number | undefined; // e.g. 33 for BlazePose
  readonly confidenceScore?: number | undefined; // 0.0 to 1.0
  readonly boundingBox?: {
    readonly xMin: number;
    readonly yMin: number;
    readonly xMax: number;
    readonly yMax: number;
  } | undefined;
}

export interface VirtualTryOnPrivacyPolicy {
  readonly retentionMode: PrivacyRetentionMode;
  readonly ttlSeconds: number; // Max storage duration
  readonly allowCloudFallback: boolean; // Whether user consents to Cloud Tier 4
  readonly zeroRetentionEnforced: boolean;
  readonly anonymizeMetadata: boolean;
}

export interface VirtualTryOnRequest {
  readonly requestId: string;
  readonly tenantId: string;
  readonly applicationId: string;
  readonly idempotencyKey: string;
  readonly garment: GarmentReference;
  readonly bodyProfile: BodyProfileReference;
  readonly userImage?: ImageAssetReference | undefined;
  readonly pose?: PoseReference | undefined;
  readonly preferredTier?: VtoExecutionTier | undefined;
  readonly privacyPolicy: VirtualTryOnPrivacyPolicy;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

// ============================================================================
// 3. ARTIFACT & RESULT CONTRACTS
// ============================================================================

export type ArtifactKind =
  | "FINAL_COMPOSITE_IMAGE"
  | "PREVIEW_THUMBNAIL"
  | "DEPTH_MAP"
  | "SEGMENTATION_MASK"
  | "POSE_LANDMARKS_JSON"
  | "WARPED_GARMENT_TEXTURE"
  | "FIT_ANALYSIS_REPORT";

export interface VirtualTryOnArtifact {
  readonly artifactId: string;
  readonly kind: ArtifactKind;
  readonly uriOrHandle: string;
  readonly mimeType: string;
  readonly widthPx?: number | undefined;
  readonly heightPx?: number | undefined;
  readonly byteSize?: number | undefined;
  readonly checksumSha256?: string | undefined;
  readonly createdAt: Date;
  readonly expiresAt?: Date | undefined;
}

export interface FitAssessment {
  readonly recommendedSize: string;
  readonly fitScore: number; // 0.0 (poor) to 1.0 (perfect)
  readonly fitVerdict: "PERFECT_FIT" | "SLIGHTLY_TIGHT" | "SLIGHTLY_LOOSE" | "RECOMMEND_SIZE_UP" | "RECOMMEND_SIZE_DOWN" | "UNKNOWN";
  readonly confidence: number; // 0.0 to 1.0
  readonly details: Readonly<Record<string, string | number>>;
}

export interface InferenceMetadata {
  readonly providerId: string;
  readonly executionTier: VtoExecutionTier;
  readonly modelName?: string | undefined;
  readonly durationMs: number;
  readonly resolution?: string | undefined;
  readonly hardwareUsed?: "WEBGPU" | "WEBGL2" | "WASM_SIMD" | "CLOUD_GPU" | "SIMULATED" | undefined;
}

export interface VirtualTryOnResult {
  readonly jobId: string;
  readonly requestId: string;
  readonly status: "SUCCESS" | "FAILED" | "CANCELLED";
  readonly primaryArtifact?: VirtualTryOnArtifact | undefined;
  readonly auxiliaryArtifacts: readonly VirtualTryOnArtifact[];
  readonly fitAssessment?: FitAssessment | undefined;
  readonly inferenceMetadata: InferenceMetadata;
  readonly completedAt: Date;
  readonly error?: {
    readonly code: string;
    readonly message: string;
    readonly details?: Readonly<Record<string, unknown>> | undefined;
  } | undefined;
}

// ============================================================================
// 4. DOMAIN AGGREGATE: VirtualTryOnJob
// ============================================================================

export interface VirtualTryOnJobState {
  readonly jobId: string;
  readonly requestId: string;
  readonly tenantId: string;
  readonly applicationId: string;
  readonly idempotencyKey: string;
  readonly requestPayload: VirtualTryOnRequest;
  readonly status: VirtualTryOnStatus;
  readonly executionTier: VtoExecutionTier;
  readonly assignedProviderId?: string | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly completedAt?: Date | undefined;
  readonly result?: VirtualTryOnResult | undefined;
  readonly failureReason?: string | undefined;
  readonly failureCode?: string | undefined;
  readonly retryCount: number;
  readonly maxRetries: number;
}

export class VirtualTryOnJob {
  private _state: VirtualTryOnJobState;

  private constructor(state: VirtualTryOnJobState) {
    this._state = state;
  }

  public static create(request: VirtualTryOnRequest, options?: { maxRetries?: number }): VirtualTryOnJob {
    if (!request.requestId || request.requestId.trim().length === 0) {
      throw new Error("VirtualTryOnRequest: requestId is mandatory");
    }
    if (!request.tenantId || request.tenantId.trim().length === 0) {
      throw new Error("VirtualTryOnRequest: tenantId is mandatory");
    }
    if (!request.applicationId || request.applicationId.trim().length === 0) {
      throw new Error("VirtualTryOnRequest: applicationId is mandatory");
    }
    if (!request.idempotencyKey || request.idempotencyKey.trim().length === 0) {
      throw new Error("VirtualTryOnRequest: idempotencyKey is mandatory");
    }
    if (!request.garment || !request.garment.productId || !request.garment.primaryAsset) {
      throw new Error("VirtualTryOnRequest: valid garment reference with primaryAsset is mandatory");
    }
    if (!request.bodyProfile || !request.bodyProfile.profileId) {
      throw new Error("VirtualTryOnRequest: valid bodyProfile reference is mandatory");
    }

    const now = new Date();
    const jobId = `vto-job-${crypto.randomUUID()}`;

    return new VirtualTryOnJob({
      jobId,
      requestId: request.requestId,
      tenantId: request.tenantId,
      applicationId: request.applicationId,
      idempotencyKey: request.idempotencyKey,
      requestPayload: request,
      status: "CREATED",
      executionTier: request.preferredTier ?? "TIER_1_ON_DEVICE_NEURAL",
      createdAt: now,
      updatedAt: now,
      retryCount: 0,
      maxRetries: options?.maxRetries ?? 2,
    });
  }

  public static reconstitute(state: VirtualTryOnJobState): VirtualTryOnJob {
    return new VirtualTryOnJob(state);
  }

  public getState(): VirtualTryOnJobState {
    return { ...this._state };
  }

  public get jobId(): string { return this._state.jobId; }
  public get requestId(): string { return this._state.requestId; }
  public get tenantId(): string { return this._state.tenantId; }
  public get applicationId(): string { return this._state.applicationId; }
  public get status(): VirtualTryOnStatus { return this._state.status; }
  public get result(): VirtualTryOnResult | undefined { return this._state.result; }

  // --------------------------------------------------------------------------
  // DETERMINISTIC STATE MACHINE TRANSITIONS
  // --------------------------------------------------------------------------

  public startValidation(): void {
    this.assertValidTransition("VALIDATING", ["CREATED"]);
    this._state = {
      ...this._state,
      status: "VALIDATING",
      updatedAt: new Date(),
    };
  }

  public enqueue(providerId?: string): void {
    this.assertValidTransition("QUEUED", ["VALIDATING", "CREATED"]);
    this._state = {
      ...this._state,
      status: "QUEUED",
      assignedProviderId: providerId ?? this._state.assignedProviderId,
      updatedAt: new Date(),
    };
  }

  public startExecution(providerId: string, executionTier?: VtoExecutionTier): void {
    this.assertValidTransition("RUNNING", ["QUEUED", "VALIDATING", "CREATED"]);
    this._state = {
      ...this._state,
      status: "RUNNING",
      assignedProviderId: providerId,
      executionTier: executionTier ?? this._state.executionTier,
      updatedAt: new Date(),
    };
  }

  public complete(result: VirtualTryOnResult): void {
    this.assertValidTransition("COMPLETED", ["RUNNING", "QUEUED"]);
    const now = new Date();
    this._state = {
      ...this._state,
      status: "COMPLETED",
      result,
      completedAt: now,
      updatedAt: now,
    };
  }

  public fail(reason: string, code = "VTO_EXECUTION_ERROR"): void {
    this.assertValidTransition("FAILED", ["CREATED", "VALIDATING", "QUEUED", "RUNNING"]);
    const now = new Date();
    this._state = {
      ...this._state,
      status: "FAILED",
      failureReason: reason,
      failureCode: code,
      completedAt: now,
      updatedAt: now,
    };
  }

  public cancel(reason = "Job cancelled by user or timeout"): void {
    this.assertValidTransition("CANCELLED", ["CREATED", "VALIDATING", "QUEUED", "RUNNING"]);
    const now = new Date();
    this._state = {
      ...this._state,
      status: "CANCELLED",
      failureReason: reason,
      failureCode: "VTO_CANCELLED",
      completedAt: now,
      updatedAt: now,
    };
  }

  public expire(): void {
    this.assertValidTransition("EXPIRED", ["CREATED", "VALIDATING", "QUEUED"]);
    const now = new Date();
    this._state = {
      ...this._state,
      status: "EXPIRED",
      failureReason: "Job expired in queue before processing",
      failureCode: "VTO_EXPIRED",
      completedAt: now,
      updatedAt: now,
    };
  }

  public canRetry(): boolean {
    return this._state.status === "FAILED" && this._state.retryCount < this._state.maxRetries;
  }

  public retry(): void {
    if (!this.canRetry()) {
      throw new Error(`Cannot retry job ${this.jobId}: status=${this.status}, retries=${this._state.retryCount}/${this._state.maxRetries}`);
    }
    this._state = {
      ...this._state,
      status: "QUEUED",
      retryCount: this._state.retryCount + 1,
      failureReason: undefined,
      failureCode: undefined,
      updatedAt: new Date(),
    };
  }

  private assertValidTransition(target: VirtualTryOnStatus, allowedSources: VirtualTryOnStatus[]): void {
    if (this.isTerminal()) {
      throw new Error(`Invalid state transition: Job ${this.jobId} is in terminal state '${this._state.status}' and cannot transition to '${target}'`);
    }
    if (!allowedSources.includes(this._state.status)) {
      throw new Error(`Invalid state transition: Cannot move from '${this._state.status}' to '${target}'. Allowed sources: [${allowedSources.join(", ")}]`);
    }
  }

  public isTerminal(): boolean {
    return ["COMPLETED", "FAILED", "CANCELLED", "EXPIRED"].includes(this._state.status);
  }
}

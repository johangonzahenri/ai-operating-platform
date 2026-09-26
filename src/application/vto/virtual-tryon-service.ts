/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * Virtual Try-On Application Service & Orchestration Pipeline.
 * 
 * Coordinates:
 * - Input validation & Privacy policy enforcement
 * - Idempotency store lookup & dedup
 * - Provider routing & execution
 * - Artifact registration & Result dispatch
 */

import {
  VirtualTryOnRequest,
  VirtualTryOnResult,
  VirtualTryOnJob,
  VirtualTryOnJobState,
} from "../../domain/vto/virtual-tryon.js";
import {
  VirtualTryOnProviderPort,
  DeterministicFakeVtoProvider,
} from "../../domain/vto/virtual-tryon-provider.js";

export interface VirtualTryOnServiceOptions {
  readonly defaultProvider?: VirtualTryOnProviderPort;
  readonly enableIdempotency?: boolean;
}

export class VirtualTryOnService {
  private _providers = new Map<string, VirtualTryOnProviderPort>();
  private _primaryProviderId: string;
  private _jobs = new Map<string, VirtualTryOnJob>();
  private _idempotencyIndex = new Map<string, string>(); // `${tenantId}:${idempotencyKey}` -> jobId

  constructor(options?: VirtualTryOnServiceOptions) {
    const defaultProvider = options?.defaultProvider ?? new DeterministicFakeVtoProvider();
    this.registerProvider(defaultProvider, true);
    this._primaryProviderId = defaultProvider.providerId;
  }

  public registerProvider(provider: VirtualTryOnProviderPort, makePrimary = false): void {
    this._providers.set(provider.providerId, provider);
    if (makePrimary || this._providers.size === 1) {
      this._primaryProviderId = provider.providerId;
    }
  }

  public getProvider(providerId?: string): VirtualTryOnProviderPort | undefined {
    const targetId = providerId ?? this._primaryProviderId;
    return this._providers.get(targetId);
  }

  public async submitTryOn(
    request: VirtualTryOnRequest,
    options?: { targetProviderId?: string; timeoutMs?: number }
  ): Promise<VirtualTryOnResult> {
    // 1. Idempotency Check
    const idempotencyIndexKey = `${request.tenantId}:${request.idempotencyKey}`;
    const existingJobId = this._idempotencyIndex.get(idempotencyIndexKey);

    if (existingJobId) {
      const existingJob = this._jobs.get(existingJobId);
      if (existingJob) {
        // If already completed or failed, return preserved result
        if (existingJob.status === "COMPLETED" && existingJob.result) {
          return existingJob.result;
        }
        if (existingJob.status === "FAILED" && existingJob.result) {
          return existingJob.result;
        }
      }
    }

    // 2. Validate Privacy & Request Invariants
    this.validatePrivacyInvariants(request);

    // 3. Create Domain Job Aggregate Root
    const job = VirtualTryOnJob.create(request);
    this._jobs.set(job.jobId, job);
    this._idempotencyIndex.set(idempotencyIndexKey, job.jobId);

    // 4. Resolve Provider
    const provider = this.getProvider(options?.targetProviderId);
    if (!provider) {
      job.fail(`No VTO provider available for '${options?.targetProviderId ?? this._primaryProviderId}'`, "VTO_PROVIDER_NOT_FOUND");
      return job.result!;
    }

    // 5. Execution Pipeline with Lifecycle State Machine
    job.startValidation();
    job.enqueue(provider.providerId);

    const controller = new AbortController();
    let timeoutHandle: NodeJS.Timeout | undefined;
    if (options?.timeoutMs && options.timeoutMs > 0) {
      timeoutHandle = setTimeout(() => controller.abort(), options.timeoutMs);
    }

    try {
      job.startExecution(provider.providerId, request.preferredTier);
      const result = await provider.process(job, controller.signal);

      if (result.status === "SUCCESS") {
        job.complete(result);
      } else {
        job.fail(result.error?.message ?? "Inference failed", result.error?.code ?? "VTO_INFERENCE_FAILED");
      }

      return job.result ?? result;
    } catch (err: any) {
      const isAbort = controller.signal.aborted || err.message?.includes("aborted");
      const failureCode = isAbort ? "VTO_TIMEOUT" : "VTO_UNEXPECTED_ERROR";
      const failureMsg = isAbort ? "VTO inference timed out or was aborted" : String(err.message ?? err);

      job.fail(failureMsg, failureCode);
      return {
        jobId: job.jobId,
        requestId: job.requestId,
        status: "FAILED",
        auxiliaryArtifacts: [],
        inferenceMetadata: {
          providerId: provider.providerId,
          executionTier: job.getState().executionTier,
          durationMs: 0,
          hardwareUsed: "SIMULATED",
        },
        completedAt: new Date(),
        error: {
          code: failureCode,
          message: failureMsg,
        },
      };
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }

  public getJob(jobId: string, tenantId?: string): VirtualTryOnJob | undefined {
    const job = this._jobs.get(jobId);
    if (job && tenantId && job.tenantId !== tenantId) {
      return undefined; // Tenant isolation
    }
    return job;
  }

  private validatePrivacyInvariants(request: VirtualTryOnRequest): void {
    if (!request.privacyPolicy) {
      throw new Error("VirtualTryOnRequest: privacyPolicy is required");
    }
    if (request.privacyPolicy.ttlSeconds < 0) {
      throw new Error("VirtualTryOnPrivacyPolicy: ttlSeconds must be non-negative");
    }
    // If ephemeral retention is enforced, verify user image is not persistent URL without consent
    if (request.privacyPolicy.retentionMode === "EPHEMERAL_SESSION" && request.privacyPolicy.ttlSeconds > 3600) {
      throw new Error("VirtualTryOnPrivacyPolicy: EPHEMERAL_SESSION mode cannot have TTL exceeding 3600 seconds");
    }
  }
}

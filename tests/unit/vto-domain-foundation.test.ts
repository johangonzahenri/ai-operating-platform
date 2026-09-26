/**
 * tests/unit/vto-domain-foundation.test.ts
 * 
 * Phase 153: Virtual Try-On Domain Modeling & AI Computer Vision Foundation Pipeline
 * 
 * Invariants Tested:
 * 1. Domain Model creation, mandatory fields validation, and immutability.
 * 2. Deterministic State Machine: CREATED -> VALIDATING -> QUEUED -> RUNNING -> COMPLETED | FAILED | CANCELLED | EXPIRED.
 * 3. Terminal state protections & prohibited transitions.
 * 4. Idempotency handling: same key returns preserved result, no duplicate job execution.
 * 5. Provider port abstraction & DeterministicFakeVtoProvider execution (success, failure, latency, timeout).
 * 6. Privacy by Design: Ephemeral retention enforcement, TTL validation, zero-retention defaults.
 * 7. Security & Isolation: Tenant boundaries, application identity preservation.
 * 8. Golden Journey: Tentaciones -> Adapter -> VTO Service -> Domain -> Provider -> Artifact -> Result.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  VirtualTryOnRequest,
  VirtualTryOnJob,
  GarmentReference,
  BodyProfileReference,
} from "../../src/domain/vto/virtual-tryon.js";
import {
  DeterministicFakeVtoProvider,
  VirtualTryOnProviderPort,
} from "../../src/domain/vto/virtual-tryon-provider.js";
import { VirtualTryOnService } from "../../src/application/vto/virtual-tryon-service.js";
import {
  TentacionesVtoAdapter,
  TENTACIONES_APPLICATION_ID,
} from "../../src/application/vto/tentaciones-vto-adapter.js";

describe("Phase 153: Virtual Try-On Domain Modeling & AI Computer Vision Foundation Pipeline", () => {
  const sampleGarment: GarmentReference = {
    productId: "prod-jacket-leather-01",
    variantId: "var-jacket-m-blk",
    name: "Classic Biker Leather Jacket",
    brand: "Tentaciones Atelier",
    category: "UPPER_BODY",
    size: "M",
    color: "Black",
    primaryAsset: {
      referenceId: "asset-garment-001",
      sourceType: "ARTIFACT_REF",
      uriOrHandle: "memory://assets/garments/jacket-01.webp",
      mimeType: "image/webp",
      widthPx: 1024,
      heightPx: 1024,
      checksumSha256: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    },
  };

  const sampleBodyProfile: BodyProfileReference = {
    profileId: "prof-nova-01",
    profileType: "KNOWN_PRESET",
    presetName: "Nova",
    genderPresentation: "FEMININE",
    measurements: {
      heightCm: 172,
      chestBustCm: 88,
      waistCm: 68,
      hipsCm: 94,
      shoulderWidthCm: 39,
    },
  };

  const createSampleRequest = (overrides?: Partial<VirtualTryOnRequest>): VirtualTryOnRequest => ({
    requestId: "req-test-vto-001",
    tenantId: "tenant-tentaciones-01",
    applicationId: TENTACIONES_APPLICATION_ID,
    idempotencyKey: "idemp-test-001",
    garment: sampleGarment,
    bodyProfile: sampleBodyProfile,
    privacyPolicy: {
      retentionMode: "EPHEMERAL_SESSION",
      ttlSeconds: 120,
      allowCloudFallback: false,
      zeroRetentionEnforced: true,
      anonymizeMetadata: true,
    },
    ...overrides,
  });

  // =========================================================================
  // 1. DOMAIN AGGREGATE & VALIDATION
  // =========================================================================
  describe("1. VTO Domain Aggregate Root & Invariants", () => {
    it("1.1 creates a valid VirtualTryOnJob aggregate in CREATED status", () => {
      const req = createSampleRequest();
      const job = VirtualTryOnJob.create(req);

      assert.ok(job.jobId.startsWith("vto-job-"));
      assert.equal(job.requestId, req.requestId);
      assert.equal(job.tenantId, req.tenantId);
      assert.equal(job.applicationId, req.applicationId);
      assert.equal(job.status, "CREATED");
      assert.equal(job.isTerminal(), false);
      assert.equal(job.result, undefined);
    });

    it("1.2 rejects job creation with missing mandatory identifiers fail-closed", () => {
      assert.throws(
        () => VirtualTryOnJob.create(createSampleRequest({ requestId: "" })),
        /requestId is mandatory/
      );
      assert.throws(
        () => VirtualTryOnJob.create(createSampleRequest({ tenantId: "" })),
        /tenantId is mandatory/
      );
      assert.throws(
        () => VirtualTryOnJob.create(createSampleRequest({ applicationId: "" })),
        /applicationId is mandatory/
      );
      assert.throws(
        () => VirtualTryOnJob.create(createSampleRequest({ idempotencyKey: "" })),
        /idempotencyKey is mandatory/
      );
    });
  });

  // =========================================================================
  // 2. DETERMINISTIC STATE MACHINE
  // =========================================================================
  describe("2. Deterministic State Machine Transitions", () => {
    it("2.1 transitions smoothly through standard lifecycle: CREATED -> VALIDATING -> QUEUED -> RUNNING -> COMPLETED", () => {
      const job = VirtualTryOnJob.create(createSampleRequest());
      assert.equal(job.status, "CREATED");

      job.startValidation();
      assert.equal(job.status, "VALIDATING");

      job.enqueue("provider-test");
      assert.equal(job.status, "QUEUED");

      job.startExecution("provider-test", "TIER_1_ON_DEVICE_NEURAL");
      assert.equal(job.status, "RUNNING");

      job.complete({
        jobId: job.jobId,
        requestId: job.requestId,
        status: "SUCCESS",
        auxiliaryArtifacts: [],
        inferenceMetadata: {
          providerId: "provider-test",
          executionTier: "TIER_1_ON_DEVICE_NEURAL",
          durationMs: 40,
        },
        completedAt: new Date(),
      });

      assert.equal(job.status, "COMPLETED");
      assert.equal(job.isTerminal(), true);
      assert.ok(job.result);
      assert.equal(job.result.status, "SUCCESS");
    });

    it("2.2 prevents illegal transitions from terminal state", () => {
      const job = VirtualTryOnJob.create(createSampleRequest());
      job.cancel("User cancel");
      assert.equal(job.status, "CANCELLED");
      assert.equal(job.isTerminal(), true);

      assert.throws(
        () => job.startValidation(),
        /is in terminal state 'CANCELLED'/
      );
      assert.throws(
        () => job.enqueue(),
        /is in terminal state 'CANCELLED'/
      );
      assert.throws(
        () => job.startExecution("prov"),
        /is in terminal state 'CANCELLED'/
      );
    });

    it("2.3 supports retry on FAILED jobs within retry budget", () => {
      const job = VirtualTryOnJob.create(createSampleRequest(), { maxRetries: 2 });
      job.startValidation();
      job.startExecution("prov");
      job.fail("Simulated transient network drop");
      assert.equal(job.status, "FAILED");
      assert.equal(job.canRetry(), true);

      job.retry();
      assert.equal(job.status, "QUEUED");
      assert.equal(job.getState().retryCount, 1);

      job.startExecution("prov");
      job.fail("Second failure");
      assert.equal(job.canRetry(), true);
      job.retry();
      assert.equal(job.getState().retryCount, 2);

      job.startExecution("prov");
      job.fail("Third failure");
      assert.equal(job.canRetry(), false);
      assert.throws(() => job.retry(), /Cannot retry job/);
    });
  });

  // =========================================================================
  // 3. PROVIDER PORT & DETERMINISTIC FAKE PROVIDER
  // =========================================================================
  describe("3. VirtualTryOnProviderPort & Simulation Engine", () => {
    it("3.1 executes deterministic fake provider with realistic fit assessment and artifacts", async () => {
      const provider = new DeterministicFakeVtoProvider({ simulateLatencyMs: 5 });
      const job = VirtualTryOnJob.create(createSampleRequest());

      const result = await provider.process(job);

      assert.equal(result.status, "SUCCESS");
      assert.ok(result.primaryArtifact);
      assert.equal(result.primaryArtifact.kind, "FINAL_COMPOSITE_IMAGE");
      assert.equal(result.primaryArtifact.mimeType, "image/webp");
      assert.ok(result.auxiliaryArtifacts.length > 0);
      assert.ok(result.fitAssessment);
      assert.equal(result.fitAssessment.fitVerdict, "PERFECT_FIT");
      assert.ok(result.fitAssessment.fitScore >= 0.9);
      assert.equal(result.inferenceMetadata.providerId, provider.providerId);
    });

    it("3.2 handles simulated provider failures gracefully", async () => {
      const provider = new DeterministicFakeVtoProvider({
        forceFailure: true,
        failureCode: "VTO_GPU_OUT_OF_MEMORY",
        failureMessage: "Simulated WebGPU allocation error",
      });
      const job = VirtualTryOnJob.create(createSampleRequest());

      const result = await provider.process(job);

      assert.equal(result.status, "FAILED");
      assert.ok(result.error);
      assert.equal(result.error.code, "VTO_GPU_OUT_OF_MEMORY");
      assert.equal(result.error.message, "Simulated WebGPU allocation error");
    });
  });

  // =========================================================================
  // 4. PRIVACY, SECURITY & IDEMPOTENCY
  // =========================================================================
  describe("4. Privacy by Design, Security & Idempotency", () => {
    it("4.1 Privacy: rejects excessive TTL on EPHEMERAL_SESSION mode", async () => {
      const service = new VirtualTryOnService();
      const badPrivacyReq = createSampleRequest({
        privacyPolicy: {
          retentionMode: "EPHEMERAL_SESSION",
          ttlSeconds: 7200, // Exceeds 1h limit for ephemeral mode
          allowCloudFallback: false,
          zeroRetentionEnforced: true,
          anonymizeMetadata: true,
        },
      });

      await assert.rejects(
        () => service.submitTryOn(badPrivacyReq),
        /EPHEMERAL_SESSION mode cannot have TTL exceeding 3600 seconds/
      );
    });

    it("4.2 Idempotency: repeated submission with same idempotencyKey returns preserved result", async () => {
      const service = new VirtualTryOnService();
      const req = createSampleRequest({ idempotencyKey: "idemp-unique-test-999" });

      const firstResult = await service.submitTryOn(req);
      assert.equal(firstResult.status, "SUCCESS");

      // Repeated submission
      const secondResult = await service.submitTryOn(req);
      assert.equal(secondResult.status, "SUCCESS");
      assert.equal(secondResult.jobId, firstResult.jobId);
      assert.equal(secondResult.completedAt.getTime(), firstResult.completedAt.getTime());
    });

    it("4.3 Isolation: getJob enforces multi-tenant boundary", async () => {
      const service = new VirtualTryOnService();
      const req = createSampleRequest({ tenantId: "tenant-alpha" });
      const result = await service.submitTryOn(req);

      // Access within matching tenant
      const jobAlpha = service.getJob(result.jobId, "tenant-alpha");
      assert.ok(jobAlpha);
      assert.equal(jobAlpha.tenantId, "tenant-alpha");

      // Access from different tenant is blocked fail-closed
      const jobBeta = service.getJob(result.jobId, "tenant-beta");
      assert.equal(jobBeta, undefined, "Cross-tenant access must return undefined");
    });
  });

  // =========================================================================
  // 5. GOLDEN JOURNEY: TENTACIONES VTO ADAPTER E2E
  // =========================================================================
  describe("5. Golden Journey E2E via TentacionesVtoAdapter", () => {
    it("5.1 executes complete Golden Journey: Tentaciones -> Adapter -> Service -> VTO Domain -> Fake Provider -> Result", async () => {
      const provider = new DeterministicFakeVtoProvider({ simulateLatencyMs: 10 });
      const service = new VirtualTryOnService({ defaultProvider: provider });
      const adapter = new TentacionesVtoAdapter(service, {
        applicationId: TENTACIONES_APPLICATION_ID,
        tenantId: "tenant-tentaciones-store",
        defaultTtlSeconds: 180,
      });

      const result = await adapter.tryOnGarment({
        garment: sampleGarment,
        bodyProfile: sampleBodyProfile,
        traceId: "trace-golden-vto-101",
        requestId: "req-golden-vto-101",
      });

      assert.ok(result);
      assert.equal(result.status, "SUCCESS");
      assert.equal(result.requestId, "req-golden-vto-101");
      assert.ok(result.primaryArtifact);
      assert.ok(result.primaryArtifact.uriOrHandle.includes("tenant-tentaciones-store"));
      assert.ok(result.fitAssessment);
      assert.equal(result.fitAssessment.recommendedSize, "M");
      assert.equal(result.fitAssessment.fitVerdict, "PERFECT_FIT");
      assert.equal(result.inferenceMetadata.hardwareUsed, "SIMULATED");
    });

    it("5.2 Timeout Resilience: aborts execution when provider exceeds timeout threshold", async () => {
      const slowProvider = new DeterministicFakeVtoProvider({ simulateLatencyMs: 150 });
      const service = new VirtualTryOnService({ defaultProvider: slowProvider });
      const adapter = new TentacionesVtoAdapter(service, {
        timeoutMs: 20, // Strict short timeout
      });

      const result = await adapter.tryOnGarment({
        garment: sampleGarment,
        bodyProfile: sampleBodyProfile,
      });

      assert.equal(result.status, "FAILED");
      assert.equal(result.error?.code, "VTO_TIMEOUT");
      assert.ok(result.error?.message.includes("timed out"));
    });
  });
});

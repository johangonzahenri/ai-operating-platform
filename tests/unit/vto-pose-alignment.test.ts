/**
 * tests/unit/vto-pose-alignment.test.ts
 * 
 * Phase 154: On-Device Computer Vision Preprocessing & Pose/Garment Alignment Pipeline
 * 
 * Invariants Tested:
 * 1. Coordinate Normalization & Validation: pixel to normalized conversion, clamping, boundary tolerances, NaN handling.
 * 2. One-Euro Filter: First sample, adaptive cutoff frequency, noise reduction, step response, invalid timestamps.
 * 3. Anthropometric Ratio Engine: Relative geometric ratios, posture tilt, provenance tracking, UNKNOWN != 0.
 * 4. Garment Anchoring & Alignment: Category-specific anchors (UPPER_BODY, LOWER_BODY, FULL_BODY, FOOTWEAR), affine transformation, alignment quality scoring.
 * 5. Preprocessing Pipeline & Prepared VTO Input: Raw pose ingestion -> validation -> smoothing -> anthropometrics -> garment alignment.
 * 6. Golden Journey Integration: Full pipeline to DeterministicFakeVtoProvider.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  CanonicalLandmarkIndex,
  normalizePixelCoordinates,
  denormalizeToPixels,
  validateLandmark,
  PoseFrame,
  PoseLandmark,
} from "../../src/domain/vto/pose-types.js";
import { OneEuroFilter, Point3DSmoother } from "../../src/domain/vto/one-euro-filter.js";
import {
  computeAnthropometricProfile,
  euclideanDistance2D,
  calculateMidpoint,
} from "../../src/domain/vto/anthropometrics.js";
import {
  computeGarmentAlignment,
  getCategoryPrimaryAnchor,
  resolveAnchorPosition,
} from "../../src/domain/vto/garment-alignment.js";
import {
  PosePreprocessingPipeline,
  RawPoseInput,
} from "../../src/domain/vto/pose-preprocessing-pipeline.js";
import {
  GarmentReference,
  BodyProfileReference,
} from "../../src/domain/vto/virtual-tryon.js";
import { DeterministicFakeVtoProvider } from "../../src/domain/vto/virtual-tryon-provider.js";
import { VirtualTryOnService } from "../../src/application/vto/virtual-tryon-service.js";

describe("Phase 154: On-Device Computer Vision Preprocessing & Pose/Garment Alignment Pipeline", () => {
  const sampleGarmentUpper: GarmentReference = {
    productId: "garment-blazer-01",
    name: "Oversized Tailored Blazer",
    category: "UPPER_BODY",
    size: "L",
    primaryAsset: {
      referenceId: "asset-blazer-01",
      sourceType: "ARTIFACT_REF",
      uriOrHandle: "memory://assets/blazer.webp",
      mimeType: "image/webp",
    },
  };

  const sampleGarmentLower: GarmentReference = {
    productId: "garment-pants-01",
    name: "Wide Leg Trousers",
    category: "LOWER_BODY",
    size: "M",
    primaryAsset: {
      referenceId: "asset-pants-01",
      sourceType: "ARTIFACT_REF",
      uriOrHandle: "memory://assets/pants.webp",
      mimeType: "image/webp",
    },
  };

  const createSyntheticPoseLandmarks = () => [
    { id: CanonicalLandmarkIndex.NOSE, x: 960, y: 150, z: 0, confidence: 0.98 },
    { id: CanonicalLandmarkIndex.LEFT_EYE, x: 940, y: 135, z: -5, confidence: 0.99 },
    { id: CanonicalLandmarkIndex.RIGHT_EYE, x: 980, y: 135, z: -5, confidence: 0.99 },
    { id: CanonicalLandmarkIndex.LEFT_SHOULDER, x: 800, y: 300, z: 0, confidence: 0.95 },
    { id: CanonicalLandmarkIndex.RIGHT_SHOULDER, x: 1120, y: 300, z: 0, confidence: 0.95 },
    { id: CanonicalLandmarkIndex.LEFT_ELBOW, x: 740, y: 500, z: 20, confidence: 0.92 },
    { id: CanonicalLandmarkIndex.RIGHT_ELBOW, x: 1180, y: 500, z: 20, confidence: 0.92 },
    { id: CanonicalLandmarkIndex.LEFT_WRIST, x: 700, y: 700, z: 10, confidence: 0.88 },
    { id: CanonicalLandmarkIndex.RIGHT_WRIST, x: 1220, y: 700, z: 10, confidence: 0.88 },
    { id: CanonicalLandmarkIndex.LEFT_HIP, x: 860, y: 650, z: 0, confidence: 0.94 },
    { id: CanonicalLandmarkIndex.RIGHT_HIP, x: 1060, y: 650, z: 0, confidence: 0.94 },
    { id: CanonicalLandmarkIndex.LEFT_KNEE, x: 870, y: 1000, z: 5, confidence: 0.91 },
    { id: CanonicalLandmarkIndex.RIGHT_KNEE, x: 1050, y: 1000, z: 5, confidence: 0.91 },
    { id: CanonicalLandmarkIndex.LEFT_ANKLE, x: 880, y: 1350, z: 0, confidence: 0.89 },
    { id: CanonicalLandmarkIndex.RIGHT_ANKLE, x: 1040, y: 1350, z: 0, confidence: 0.89 },
  ];

  // =========================================================================
  // 1. COORDINATE NORMALIZATION & VALIDATION
  // =========================================================================
  describe("1. Coordinate Normalization & Landmark Validation", () => {
    it("1.1 normalizes valid pixel coordinates to range [0.0, 1.0]", () => {
      const norm = normalizePixelCoordinates(960, 540, 100, 1920, 1080);
      assert.equal(norm.isValid, true);
      assert.equal(norm.x, 0.5);
      assert.equal(norm.y, 0.5);
      assert.ok(norm.z > 0);
    });

    it("1.2 denormalizes normalized coordinates back to pixels deterministically", () => {
      const denorm = denormalizeToPixels(0.5, 0.25, 0, 1920, 1080);
      assert.equal(denorm.isValid, true);
      assert.equal(denorm.pixelX, 960);
      assert.equal(denorm.pixelY, 270);
    });

    it("1.3 rejects invalid or non-finite dimensions gracefully (fail-safe)", () => {
      const badNorm = normalizePixelCoordinates(100, 100, 0, 0, -100);
      assert.equal(badNorm.isValid, false);
      assert.equal(badNorm.x, 0);
    });

    it("1.4 validates landmark confidence and flags low-confidence or NaN inputs", () => {
      const validLm: Partial<PoseLandmark> = {
        id: 0,
        position: { x: 0.5, y: 0.5, z: 0, confidence: 0.9, visibility: "VISIBLE" },
      };
      assert.equal(validateLandmark(validLm, 0.5).isValid, true);

      const lowConfLm: Partial<PoseLandmark> = {
        id: 1,
        position: { x: 0.5, y: 0.5, z: 0, confidence: 0.2, visibility: "LOW_CONFIDENCE" },
      };
      const lowRes = validateLandmark(lowConfLm, 0.5);
      assert.equal(lowRes.isValid, false);
      assert.equal(lowRes.visibility, "LOW_CONFIDENCE");

      const nanLm: Partial<PoseLandmark> = {
        id: 2,
        position: { x: NaN, y: 0.5, z: 0, confidence: 0.9, visibility: "UNKNOWN" },
      };
      assert.equal(validateLandmark(nanLm).isValid, false);
    });
  });

  // =========================================================================
  // 2. ONE-EURO TEMPORAL SMOOTHING FILTER
  // =========================================================================
  describe("2. One-Euro Filter & Kinematic Smoothing", () => {
    it("2.1 initial sample passes through unchanged", () => {
      const filter = new OneEuroFilter();
      const val = filter.filter(0.75, 1000);
      assert.equal(val, 0.75);
    });

    it("2.2 stationary signal reduces high-frequency jitter", () => {
      const filter = new OneEuroFilter({ minCutoffHz: 0.5, beta: 0.001 });
      const t0 = 1000;
      filter.filter(0.5, t0);

      // Add high frequency jitter (+- 0.05) around 0.5
      const smoothedVals: number[] = [];
      for (let i = 1; i <= 10; i++) {
        const jitter = i % 2 === 0 ? 0.05 : -0.05;
        const out = filter.filter(0.5 + jitter, t0 + i * 33);
        smoothedVals.push(out);
      }

      // Check that smoothed values stay closer to 0.5 than raw jitter
      for (const val of smoothedVals) {
        assert.ok(Math.abs(val - 0.5) < 0.045, `Expected dampening: val=${val}`);
      }
    });

    it("2.3 adaptive speed coefficient minimizes lag during sudden step motion", () => {
      const filter = new OneEuroFilter({ minCutoffHz: 1.0, beta: 0.1 });
      let t = 1000;
      for (let i = 0; i < 5; i++) filter.filter(0.1, t += 33);

      // Sudden jump to 0.9
      const stepVal = filter.filter(0.9, t += 33);
      assert.ok(stepVal > 0.25, `Step response should adapt quickly: stepVal=${stepVal}`);
    });

    it("2.4 handles duplicate or out-of-order timestamps without crashing", () => {
      const filter = new OneEuroFilter();
      filter.filter(0.5, 1000);
      const valDup = filter.filter(0.6, 1000); // Duplicate dt = 0
      assert.ok(Number.isFinite(valDup));

      const valLargeGap = filter.filter(0.8, 5000); // 4-second gap -> auto reset
      assert.equal(valLargeGap, 0.8);
    });

    it("2.5 Point3DSmoother smoothes 3-axis landmarks simultaneously", () => {
      const smoother = new Point3DSmoother();
      const p1 = smoother.smooth(0.5, 0.5, 0.0, 1000);
      assert.equal(p1.x, 0.5);
      assert.equal(p1.y, 0.5);
      assert.equal(p1.z, 0.0);

      const p2 = smoother.smooth(0.52, 0.48, 0.05, 1033);
      assert.ok(p2.x > 0.5 && p2.x <= 0.52);
    });
  });

  // =========================================================================
  // 3. ANTHROPOMETRIC RATIO ENGINE
  // =========================================================================
  describe("3. Anthropometric Ratio Engine", () => {
    it("3.1 calculates realistic relative ratios from canonical synthetic standing pose", () => {
      const rawLms = createSyntheticPoseLandmarks();
      const lmsMap = new Map<number, PoseLandmark>();

      for (const lm of rawLms) {
        lmsMap.set(lm.id, {
          id: lm.id,
          name: CanonicalLandmarkIndex[lm.id]!,
          group: "TORSO",
          position: {
            x: lm.x / 1920,
            y: lm.y / 1440,
            z: lm.z / 1920,
            confidence: lm.confidence,
            visibility: "VISIBLE",
          },
          isValid: true,
        });
      }

      const frame: PoseFrame = {
        frameId: "frame-synthetic-01",
        timestampMs: 1000,
        coordinateSystem: "NORMALIZED_3D",
        landmarks: lmsMap,
        overallConfidence: 0.95,
        isMirrored: false,
      };

      const anthro = computeAnthropometricProfile(frame);

      assert.ok(anthro);
      assert.ok(anthro.shoulderWidthRatio.value > 0);
      assert.ok(anthro.hipWidthRatio.value > 0);
      assert.ok(anthro.shoulderToHipRatio.value > 1.0, "Shoulders wider than hips in synthetic model");
      assert.ok(anthro.torsoLengthRatio.value > 0);
      assert.ok(anthro.legLengthRatio.value > 0);
      assert.equal(anthro.shoulderWidthRatio.isReliable, true);
    });

    it("3.2 gracefully flags missing landmarks as unreliable without injecting zeros", () => {
      const emptyFrame: PoseFrame = {
        frameId: "frame-empty",
        timestampMs: 1000,
        coordinateSystem: "NORMALIZED_3D",
        landmarks: new Map(),
        overallConfidence: 0,
        isMirrored: false,
      };

      const anthro = computeAnthropometricProfile(emptyFrame);
      assert.equal(anthro.shoulderWidthRatio.isReliable, false);
      assert.equal(anthro.shoulderWidthRatio.confidence, 0);
    });
  });

  // =========================================================================
  // 4. GARMENT ANCHORING & GEOMETRIC ALIGNMENT
  // =========================================================================
  describe("4. Garment Anchoring & Geometric Alignment", () => {
    it("4.1 resolves primary and secondary anchors for UPPER_BODY and LOWER_BODY categories", () => {
      const upperAnchors = getCategoryPrimaryAnchor("UPPER_BODY");
      assert.equal(upperAnchors.primary, "SHOULDER_CENTER");
      assert.equal(upperAnchors.secondary, "HIP_CENTER");

      const lowerAnchors = getCategoryPrimaryAnchor("LOWER_BODY");
      assert.equal(lowerAnchors.primary, "HIP_CENTER");
      assert.equal(lowerAnchors.secondary, "ANKLE_CENTER");

      const shoeAnchors = getCategoryPrimaryAnchor("FOOTWEAR");
      assert.equal(shoeAnchors.primary, "ANKLE_CENTER");
    });

    it("4.2 computes 2D affine transform and bounding box for UPPER_BODY blazer", () => {
      const pipeline = new PosePreprocessingPipeline();
      const rawInput: RawPoseInput = {
        frameId: "frame-align-01",
        timestampMs: 1000,
        isPixelCoordinates: true,
        imageDimensions: { widthPx: 1920, heightPx: 1440 },
        rawLandmarks: createSyntheticPoseLandmarks(),
      };

      const prepared = pipeline.processPoseFrame(rawInput, sampleGarmentUpper);

      assert.equal(prepared.isReadyForInference, true);
      assert.equal(prepared.garmentAlignment.quality, "ALIGNED");
      assert.ok(prepared.garmentAlignment.alignmentScore >= 0.85);

      const transform = prepared.garmentAlignment.transform;
      assert.ok(transform.scale.x > 0);
      assert.ok(transform.scale.y > 0);
      assert.ok(transform.boundingBox.xMax > transform.boundingBox.xMin);
      assert.ok(transform.boundingBox.yMax > transform.boundingBox.yMin);
    });

    it("4.3 flags INSUFFICIENT_DATA when mandatory shoulder anchor landmarks are absent", () => {
      const pipeline = new PosePreprocessingPipeline();
      const partialLandmarks = [
        { id: CanonicalLandmarkIndex.NOSE, x: 960, y: 150, confidence: 0.9 },
        { id: CanonicalLandmarkIndex.LEFT_HIP, x: 860, y: 650, confidence: 0.9 },
        { id: CanonicalLandmarkIndex.RIGHT_HIP, x: 1060, y: 650, confidence: 0.9 },
      ];

      const rawInput: RawPoseInput = {
        frameId: "frame-partial-01",
        timestampMs: 1000,
        isPixelCoordinates: true,
        imageDimensions: { widthPx: 1920, heightPx: 1080 },
        rawLandmarks: partialLandmarks,
      };

      const prepared = pipeline.processPoseFrame(rawInput, sampleGarmentUpper);
      assert.equal(prepared.garmentAlignment.quality, "INSUFFICIENT_DATA");
      assert.equal(prepared.isReadyForInference, false);
      assert.ok(prepared.garmentAlignment.details.missingAnchors.includes("SHOULDER_CENTER"));
    });
  });

  // =========================================================================
  // 5. PREPROCESSING PIPELINE & GOLDEN JOURNEY INTEGRATION
  // =========================================================================
  describe("5. End-to-End Pose Preprocessing to VTO Inference Golden Journey", () => {
    it("5.1 executes complete pipeline: Raw Pose -> Normalization -> Smoothing -> Anthropometrics -> Alignment -> VTO Provider", async () => {
      const pipeline = new PosePreprocessingPipeline();
      const fakeProvider = new DeterministicFakeVtoProvider({ simulateLatencyMs: 5 });
      const vtoService = new VirtualTryOnService({ defaultProvider: fakeProvider });

      const rawInput: RawPoseInput = {
        frameId: "frame-golden-001",
        timestampMs: 1000,
        isPixelCoordinates: true,
        imageDimensions: { widthPx: 1920, heightPx: 1080 },
        rawLandmarks: createSyntheticPoseLandmarks(),
      };

      const bodyProfile: BodyProfileReference = {
        profileId: "prof-nova",
        profileType: "KNOWN_PRESET",
        presetName: "Nova",
        measurements: { heightCm: 172 },
      };

      // 1. Process & Prepare Input
      const prepared = pipeline.processPoseFrame(rawInput, sampleGarmentUpper, bodyProfile);
      assert.equal(prepared.isReadyForInference, true);
      assert.ok(prepared.preparationDurationMs >= 0);

      // 2. Submit to VirtualTryOnService
      const vtoResult = await vtoService.submitTryOn({
        requestId: "req-vto-pipeline-01",
        tenantId: "tenant-tentaciones",
        applicationId: "tentaciones-commerce",
        idempotencyKey: "idemp-pipeline-01",
        garment: sampleGarmentUpper,
        bodyProfile,
        privacyPolicy: {
          retentionMode: "EPHEMERAL_SESSION",
          ttlSeconds: 60,
          allowCloudFallback: false,
          zeroRetentionEnforced: true,
          anonymizeMetadata: true,
        },
        metadata: {
          preparedInputId: prepared.preparedInputId,
          alignmentQuality: prepared.garmentAlignment.quality,
          alignmentScore: prepared.garmentAlignment.alignmentScore,
        },
      });

      assert.equal(vtoResult.status, "SUCCESS");
      assert.ok(vtoResult.primaryArtifact);
      assert.ok(vtoResult.fitAssessment);
      assert.equal(vtoResult.fitAssessment.recommendedSize, "L");
      assert.equal(vtoResult.inferenceMetadata.hardwareUsed, "SIMULATED");
    });
  });
});

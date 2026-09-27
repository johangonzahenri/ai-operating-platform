/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * Phase 155: Neural Garment Warping & Multi-Layer Cloth Segmentation Pipeline Unit & Contract Tests.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  SegmentationMask,
  validateSegmentationMask,
  OcclusionMap,
  validateOcclusionMap,
} from "../../src/domain/vto/segmentation-types.js";
import {
  DeterministicFakeSegmentationProvider,
} from "../../src/domain/vto/segmentation-provider.js";
import {
  createIdentityWarpField,
  createAffineWarpField,
  sampleWarpField,
  validateWarpField,
} from "../../src/domain/vto/warp-field.js";
import {
  GarmentWarpEngine,
} from "../../src/domain/vto/garment-warping.js";
import {
  MultiLayerCompositor,
  LayerSpec,
} from "../../src/domain/vto/layer-composition.js";
import {
  ClothSegmentationWarpingPipeline,
} from "../../src/domain/vto/cloth-warping-pipeline.js";
import {
  PosePreprocessingPipeline,
  RawPoseInput,
} from "../../src/domain/vto/pose-preprocessing-pipeline.js";
import { CanonicalLandmarkIndex } from "../../src/domain/vto/pose-types.js";
import {
  GarmentReference,
  BodyProfileReference,
} from "../../src/domain/vto/virtual-tryon.js";
import { AffineTransform2D, GarmentAlignmentResult } from "../../src/domain/vto/garment-alignment.js";

describe("Phase 155: Neural Garment Warping & Multi-Layer Cloth Segmentation Pipeline", () => {
  const sampleGarment: GarmentReference = {
    productId: "garment-blazer-01",
    name: "Tailored Linen Blazer",
    category: "UPPER_BODY",
    size: "M",
    primaryAsset: {
      referenceId: "asset-blazer-01",
      sourceType: "ARTIFACT_REF",
      uriOrHandle: "memory://assets/blazer.webp",
      mimeType: "image/webp",
    },
  };

  const sampleBodyProfile: BodyProfileReference = {
    profileId: "profile-user-01",
    profileType: "USER_CALIBRATED",
    genderPresentation: "NEUTRAL",
    measurements: {
      heightCm: 175,
      chestBustCm: 96,
      waistCm: 80,
      shoulderWidthCm: 44,
    },
  };

  const createSyntheticPoseLandmarks = () => [
    { id: CanonicalLandmarkIndex.NOSE, x: 960, y: 150, z: 0, confidence: 0.98 },
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
  // 1. SEGMENTATION MASK MODEL & VALIDATION
  // =========================================================================
  describe("1. Segmentation Mask Model & Validation", () => {
    it("1.1 validates a correct soft probability mask and tracks mean value", () => {
      const mask: SegmentationMask = {
        width: 4,
        height: 4,
        format: "SOFT_PROBABILITY_MAP",
        maskType: "BODY_MASK",
        confidence: 0.92,
        source: "SIMULATED_DETERMINISTIC",
        data: [
          0.0, 0.2, 0.8, 0.0,
          0.1, 0.9, 0.9, 0.1,
          0.2, 0.8, 0.8, 0.2,
          0.0, 0.1, 0.1, 0.0,
        ],
      };

      const result = validateSegmentationMask(mask);
      assert.equal(result.isValid, true);
      assert.equal(result.activePixelsCount, 5); // pixels > 0.5 (0.8, 0.9, 0.9, 0.8, 0.8)
      assert.ok(result.meanValue > 0.3 && result.meanValue < 0.4);
    });

    it("1.2 validates binary mask format strictly enforcing 0 and 1 values", () => {
      const binaryMask: SegmentationMask = {
        width: 2,
        height: 2,
        format: "BINARY_MAP",
        maskType: "GARMENT_MASK",
        confidence: 0.98,
        source: "SIMULATED_DETERMINISTIC",
        data: [1, 0, 0, 1],
      };

      assert.equal(validateSegmentationMask(binaryMask).isValid, true);

      const badBinary: SegmentationMask = {
        ...binaryMask,
        data: [1, 0, 2, 1], // 2 is invalid for binary map
      };
      const badResult = validateSegmentationMask(badBinary);
      assert.equal(badResult.isValid, false);
      assert.ok(badResult.error?.includes("must be 0 or 1"));
    });

    it("1.3 rejects out-of-range probabilities, NaNs, and infinities fail-closed", () => {
      const nanMask: SegmentationMask = {
        width: 2,
        height: 2,
        format: "SOFT_PROBABILITY_MAP",
        maskType: "BODY_MASK",
        confidence: 0.9,
        source: "SIMULATED_DETERMINISTIC",
        data: [0.5, NaN, 0.5, 0.5],
      };
      assert.equal(validateSegmentationMask(nanMask).isValid, false);

      const outOfRangeMask: SegmentationMask = {
        width: 2,
        height: 2,
        format: "SOFT_PROBABILITY_MAP",
        maskType: "BODY_MASK",
        confidence: 0.9,
        source: "SIMULATED_DETERMINISTIC",
        data: [0.5, 1.2, 0.5, 0.5],
      };
      assert.equal(validateSegmentationMask(outOfRangeMask).isValid, false);
    });

    it("1.4 rejects dimension mismatches and non-integer sizes", () => {
      const badDimMask: SegmentationMask = {
        width: 4,
        height: 4,
        format: "SOFT_PROBABILITY_MAP",
        maskType: "BODY_MASK",
        confidence: 0.9,
        source: "SIMULATED_DETERMINISTIC",
        data: [0.1, 0.2, 0.3], // length 3 !== 16
      };
      const result = validateSegmentationMask(badDimMask);
      assert.equal(result.isValid, false);
      assert.ok(result.error?.includes("length mismatch"));
    });
  });

  // =========================================================================
  // 2. DETERMINISTIC FAKE SEGMENTATION PROVIDER
  // =========================================================================
  describe("2. Deterministic Fake Segmentation Provider", () => {
    it("2.1 generates synthetic masks and occlusion map matching dimensions", async () => {
      const provider = new DeterministicFakeSegmentationProvider({
        defaultResolution: { width: 32, height: 32 },
        forcedConfidence: 0.95,
      });

      const result = await provider.segment({
        requestId: "req-seg-01",
        tenantId: "tenant-tentaciones",
        sourceImage: sampleGarment.primaryAsset,
        targetClasses: ["PERSON", "GARMENT", "OCCLUSION"],
      });

      assert.equal(result.status, "SUCCESS");
      assert.equal(result.overallConfidence, 0.95);
      assert.equal(result.quality, "MASK_VALID");
      assert.ok(result.masks["PERSON"]);
      assert.ok(result.masks["GARMENT"]);
      assert.equal(result.masks["PERSON"].width, 32);
      assert.equal(result.masks["PERSON"].height, 32);
      assert.ok(result.occlusionMap);
      assert.equal(validateOcclusionMap(result.occlusionMap), true);
    });

    it("2.2 flags DEGRADED and MASK_LOW_CONFIDENCE when provider confidence is low", async () => {
      const provider = new DeterministicFakeSegmentationProvider({
        forcedConfidence: 0.45,
      });

      const result = await provider.segment({
        requestId: "req-seg-02",
        tenantId: "tenant-tentaciones",
        sourceImage: sampleGarment.primaryAsset,
        targetClasses: ["PERSON", "GARMENT"],
      });

      assert.equal(result.status, "DEGRADED");
      assert.equal(result.quality, "MASK_LOW_CONFIDENCE");
    });

    it("2.3 handles simulated provider failure gracefully with safe error details", async () => {
      const provider = new DeterministicFakeSegmentationProvider({
        simulateFailure: true,
        failureErrorMessage: "Hardware acceleration unavailable",
      });

      const health = await provider.checkHealth();
      assert.equal(health.status, "UNAVAILABLE");

      const result = await provider.segment({
        requestId: "req-seg-03",
        tenantId: "tenant-tentaciones",
        sourceImage: sampleGarment.primaryAsset,
        targetClasses: ["PERSON"],
      });

      assert.equal(result.status, "FAILED");
      assert.equal(result.quality, "INSUFFICIENT_DATA");
      assert.equal(result.error?.code, "PROVIDER_INFERENCE_ERROR");
      assert.equal(result.error?.message, "Hardware acceleration unavailable");
    });
  });

  // =========================================================================
  // 3. 2D WARP FIELD & BILINEAR SAMPLING
  // =========================================================================
  describe("3. 2D Warp Field & Bilinear Sampling", () => {
    it("3.1 identity warp field preserves normalized coordinates (u, v)", () => {
      const identityField = createIdentityWarpField(8, 8);
      assert.equal(validateWarpField(identityField).isValid, true);
      assert.equal(identityField.warpType, "IDENTITY");
      assert.equal(identityField.maxDisplacement, 0);

      const sampleCenter = sampleWarpField(identityField, 0.5, 0.5);
      assert.equal(sampleCenter.isValid, true);
      assert.equal(sampleCenter.uPrime, 0.5);
      assert.equal(sampleCenter.vPrime, 0.5);
      assert.equal(sampleCenter.dx, 0);
      assert.equal(sampleCenter.dy, 0);

      const sampleCorner = sampleWarpField(identityField, 0.0, 1.0);
      assert.equal(sampleCorner.uPrime, 0.0);
      assert.equal(sampleCorner.vPrime, 1.0);
    });

    it("3.2 affine translation warp displaces coordinates deterministically", () => {
      const transform: AffineTransform2D = {
        translation: { x: 0.1, y: -0.05 },
        scale: { x: 1.0, y: 1.0 },
        rotationDegrees: 0,
        anchorOrigin: { x: 0.5, y: 0.5 },
        boundingBox: { xMin: 0.3, yMin: 0.2, xMax: 0.7, yMax: 0.6 },
      };

      const warpField = createAffineWarpField(8, 8, transform);
      assert.equal(warpField.isValid, true);
      assert.equal(warpField.warpType, "TRANSLATION");

      const sample = sampleWarpField(warpField, 0.5, 0.5);
      assert.equal(sample.isValid, true);
      assert.ok(Math.abs(sample.uPrime - 0.6) < 0.001);
      assert.ok(Math.abs(sample.vPrime - 0.45) < 0.001);
      assert.ok(Math.abs(sample.dx - 0.1) < 0.001);
      assert.ok(Math.abs(sample.dy - (-0.05)) < 0.001);
    });

    it("3.3 affine rotation rotates coordinates around normalized center (0.5, 0.5)", () => {
      const transform: AffineTransform2D = {
        translation: { x: 0, y: 0 },
        scale: { x: 1.0, y: 1.0 },
        rotationDegrees: 90,
        anchorOrigin: { x: 0.5, y: 0.5 },
        boundingBox: { xMin: 0.3, yMin: 0.2, xMax: 0.7, yMax: 0.6 },
      };

      const warpField = createAffineWarpField(8, 8, transform);
      assert.equal(warpField.isValid, true);

      // Point at (0.5, 0.25) rotated 90 deg clockwise around (0.5, 0.5) should move to (0.75, 0.5)
      const sample = sampleWarpField(warpField, 0.5, 0.25);
      assert.equal(sample.isValid, true);
      assert.ok(Math.abs(sample.uPrime - 0.75) < 0.01, `Expected uPrime ~ 0.75, got ${sample.uPrime}`);
      assert.ok(Math.abs(sample.vPrime - 0.5) < 0.01, `Expected vPrime ~ 0.5, got ${sample.vPrime}`);
    });

    it("3.4 bilinear interpolation samples continuously between discrete grid nodes", () => {
      const transform: AffineTransform2D = {
        translation: { x: 0.05, y: 0.05 },
        scale: { x: 1.2, y: 1.2 },
        rotationDegrees: 0,
        anchorOrigin: { x: 0.5, y: 0.5 },
        boundingBox: { xMin: 0.3, yMin: 0.2, xMax: 0.7, yMax: 0.6 },
      };

      const warpField = createAffineWarpField(4, 4, transform);
      // Sample at fractional coordinate not exactly on grid nodes
      const sample = sampleWarpField(warpField, 0.333, 0.666);
      assert.equal(sample.isValid, true);
      assert.ok(Number.isFinite(sample.uPrime));
      assert.ok(Number.isFinite(sample.vPrime));
    });
  });

  // =========================================================================
  // 4. GARMENT WARP ENGINE & FALLBACK COORDINATOR
  // =========================================================================
  describe("4. Garment Warp Engine & Fallback Coordinator", () => {
    it("4.1 computes valid warp field from Phase 154 alignment", () => {
      const alignment: GarmentAlignmentResult = {
        garmentId: sampleGarment.productId,
        category: "UPPER_BODY",
        primaryAnchor: "SHOULDER_CENTER",
        secondaryAnchor: "HIP_CENTER",
        transform: {
          translation: { x: 0.0, y: -0.02 },
          scale: { x: 1.05, y: 1.05 },
          rotationDegrees: 2.5,
          anchorOrigin: { x: 0.5, y: 0.25 },
          boundingBox: { xMin: 0.3, yMin: 0.2, xMax: 0.7, yMax: 0.6 },
        },
        quality: "ALIGNED",
        alignmentScore: 0.92,
        details: {
          anchorConfidence: 0.95,
          scaleFactor: 1.05,
          rotationAngleDeg: 2.5,
          missingAnchors: [],
        },
      };

      const result = GarmentWarpEngine.computeGarmentWarp({
        requestId: "req-warp-01",
        garment: sampleGarment,
        alignment,
      });

      assert.equal(result.status, "SUCCESS");
      assert.equal(result.quality, "WARP_VALID");
      assert.equal(result.fallbackUsed, false);
      assert.equal(result.warpField.isValid, true);
    });

    it("4.2 degrades gracefully with WARP_DEGRADED when alignment quality is MISALIGNED", () => {
      const degradedAlignment: GarmentAlignmentResult = {
        garmentId: sampleGarment.productId,
        category: "UPPER_BODY",
        primaryAnchor: "SHOULDER_CENTER",
        transform: {
          translation: { x: 0.0, y: 0.0 },
          scale: { x: 1.0, y: 1.0 },
          rotationDegrees: 0,
          anchorOrigin: { x: 0.5, y: 0.25 },
          boundingBox: { xMin: 0.3, yMin: 0.2, xMax: 0.7, yMax: 0.6 },
        },
        quality: "MISALIGNED",
        alignmentScore: 0.45,
        details: {
          anchorConfidence: 0.45,
          scaleFactor: 1.0,
          rotationAngleDeg: 0,
          missingAnchors: ["HIP_CENTER"],
        },
      };

      const result = GarmentWarpEngine.computeGarmentWarp({
        requestId: "req-warp-02",
        garment: sampleGarment,
        alignment: degradedAlignment,
      });

      assert.equal(result.status, "DEGRADED");
      assert.equal(result.quality, "WARP_DEGRADED");
      assert.equal(result.fallbackUsed, true);
      assert.ok(result.fallbackReason?.includes("MISALIGNED"));
    });

    it("4.3 fails safely with INSUFFICIENT_DATA when alignment quality is INSUFFICIENT_DATA", () => {
      const invalidAlignment: Partial<GarmentAlignmentResult> = {
        garmentId: sampleGarment.productId,
        category: "UPPER_BODY",
        quality: "INSUFFICIENT_DATA",
      };

      const result = GarmentWarpEngine.computeGarmentWarp({
        requestId: "req-warp-03",
        garment: sampleGarment,
        alignment: invalidAlignment as GarmentAlignmentResult,
      });

      assert.equal(result.status, "FAILED");
      assert.equal(result.quality, "INSUFFICIENT_DATA");
      assert.equal(result.fallbackUsed, true);
    });
  });

  // =========================================================================
  // 5. MULTI-LAYER COMPOSITION & OCCLUSION RESOLUTION
  // =========================================================================
  describe("5. Multi-Layer Composition & Occlusion Resolution", () => {
    it("5.1 enforces canonical bottom-to-top z-ordering (BACKGROUND -> BODY -> GARMENT)", () => {
      const layers: LayerSpec[] = [
        { layerId: "l-garment", layerKind: "GARMENT", visibility: "VISIBLE", zIndex: 99, opacity: 1.0 },
        { layerId: "l-bg", layerKind: "BACKGROUND", visibility: "VISIBLE", zIndex: 50, opacity: 1.0 },
        { layerId: "l-body", layerKind: "BODY", visibility: "VISIBLE", zIndex: 1, opacity: 1.0 },
      ];

      const result = MultiLayerCompositor.compose({
        requestId: "req-comp-01",
        tenantId: "tenant-tentaciones",
        layers,
      });

      assert.equal(result.status, "SUCCESS");
      assert.equal(result.compositionQuality, "COMPOSITION_VALID");
      assert.equal(result.orderedLayers.length, 3);
      assert.equal(result.orderedLayers[0].layerKind, "BACKGROUND");
      assert.equal(result.orderedLayers[0].zIndex, 0);
      assert.equal(result.orderedLayers[1].layerKind, "BODY");
      assert.equal(result.orderedLayers[1].zIndex, 10);
      assert.equal(result.orderedLayers[2].layerKind, "GARMENT");
      assert.equal(result.orderedLayers[2].zIndex, 20);
    });

    it("5.2 resolves layer visibility and flags DEGRADED when body heavily occludes garment", () => {
      const layers: LayerSpec[] = [
        { layerId: "l-body", layerKind: "BODY", visibility: "VISIBLE", zIndex: 10, opacity: 1.0 },
        { layerId: "l-garment", layerKind: "GARMENT", visibility: "VISIBLE", zIndex: 20, opacity: 1.0 },
      ];

      const heavyOcclusion: OcclusionMap = {
        width: 16,
        height: 16,
        states: new Array(256).fill("BODY_OCCLUDING"),
        confidence: 0.9,
        garmentVisibleRatio: 0.2,
        bodyOccludingRatio: 0.8, // > 0.5 triggers occlusion degradation
      };

      const result = MultiLayerCompositor.compose({
        requestId: "req-comp-02",
        tenantId: "tenant-tentaciones",
        layers,
        occlusionMap: heavyOcclusion,
      });

      assert.equal(result.status, "DEGRADED");
      assert.equal(result.compositionQuality, "COMPOSITION_DEGRADED");
      assert.equal(result.occludedLayerCount, 1);
      const garmentLayer = result.orderedLayers.find((l) => l.layerKind === "GARMENT");
      assert.equal(garmentLayer?.visibility, "OCCLUDED");
    });

    it("5.3 marks zero opacity layer as TRANSPARENT_OR_UNKNOWN without breaking composition", () => {
      const layers: LayerSpec[] = [
        { layerId: "l-body", layerKind: "BODY", visibility: "VISIBLE", zIndex: 10, opacity: 1.0 },
        { layerId: "l-overlay", layerKind: "GARMENT_OVERLAY", visibility: "VISIBLE", zIndex: 30, opacity: 0.0 },
      ];

      const result = MultiLayerCompositor.compose({
        requestId: "req-comp-03",
        tenantId: "tenant-tentaciones",
        layers,
      });

      assert.equal(result.status, "SUCCESS");
      const overlayLayer = result.orderedLayers.find((l) => l.layerKind === "GARMENT_OVERLAY");
      assert.equal(overlayLayer?.visibility, "TRANSPARENT_OR_UNKNOWN");
    });
  });

  // =========================================================================
  // 6. END-TO-END SEGMENTATION, WARPING & RENDERING PREPARATION GOLDEN JOURNEY
  // =========================================================================
  describe("6. End-to-End Segmentation, Warping & Rendering Preparation Golden Journey", () => {
    it("6.1 executes complete multi-layer pipeline: Raw Pose -> Alignment -> Segmentation -> Warping -> Composition -> Artifacts", async () => {
      // 1. Pose Preprocessing (Phase 154)
      const posePipeline = new PosePreprocessingPipeline();
      const rawPose: RawPoseInput = {
        frameId: "frame-001",
        timestampMs: 1000,
        isPixelCoordinates: true,
        imageDimensions: { widthPx: 1920, heightPx: 1080 },
        rawLandmarks: createSyntheticPoseLandmarks(),
      };

      const preparedPose = posePipeline.processPoseFrame(
        rawPose,
        sampleGarment,
        sampleBodyProfile
      );

      assert.equal(preparedPose.isReadyForInference, true);

      // 2. Multi-Layer Segmentation & Warping (Phase 155)
      const segProvider = new DeterministicFakeSegmentationProvider({
        defaultResolution: { width: 64, height: 64 },
        forcedConfidence: 0.94,
      });

      const clothPipeline = new ClothSegmentationWarpingPipeline({
        segmentationProvider: segProvider,
      });

      const renderInput = await clothPipeline.process(
        preparedPose,
        sampleGarment,
        "tenant-tentaciones",
        sampleBodyProfile
      );

      // Verify pipeline output structure and quality
      assert.equal(renderInput.requestId, preparedPose.preparedInputId);
      assert.equal(renderInput.tenantId, "tenant-tentaciones");
      assert.equal(renderInput.isDegraded, false);
      assert.equal(renderInput.quality.segmentation, "MASK_VALID");
      assert.equal(renderInput.quality.warping, "WARP_VALID");
      assert.equal(renderInput.quality.composition, "COMPOSITION_VALID");

      // Verify warp field
      assert.equal(renderInput.warpField.isValid, true);
      assert.equal(renderInput.warpField.gridWidth, 16);
      assert.equal(renderInput.warpField.gridHeight, 16);

      // Verify multi-layer composition
      assert.equal(renderInput.compositionLayers.length, 3);
      assert.equal(renderInput.compositionLayers[0].layerKind, "BACKGROUND");
      assert.equal(renderInput.compositionLayers[1].layerKind, "BODY");
      assert.equal(renderInput.compositionLayers[2].layerKind, "GARMENT");

      // Verify generated Phase 153/155 compliant artifacts
      assert.ok(renderInput.artifacts.length >= 4);
      const bodyMaskArt = renderInput.artifacts.find((a) => a.kind === "BODY_MASK");
      const garmentMaskArt = renderInput.artifacts.find((a) => a.kind === "GARMENT_MASK");
      const occlusionArt = renderInput.artifacts.find((a) => a.kind === "OCCLUSION_MAP");
      const warpFieldArt = renderInput.artifacts.find((a) => a.kind === "WARP_FIELD");

      assert.ok(bodyMaskArt);
      assert.ok(garmentMaskArt);
      assert.ok(occlusionArt);
      assert.ok(warpFieldArt);
      assert.equal(warpFieldArt.mimeType, "application/json");
    });
  });
});

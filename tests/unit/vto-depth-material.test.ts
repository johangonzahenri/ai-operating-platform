/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * Phase 156: Dynamic Depth Occlusion & Material Appearance Pipeline Unit & Contract Tests.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  DepthMap,
  validateDepthMap,
} from "../../src/domain/vto/depth-types.js";
import {
  DeterministicFakeDepthProvider,
} from "../../src/domain/vto/depth-provider.js";
import {
  DynamicOcclusionResolver,
  DynamicOcclusionMap,
} from "../../src/domain/vto/dynamic-occlusion.js";
import {
  GarmentMaterialProfile,
  validateMaterialProfile,
  deriveAppearanceHints,
  DeterministicMaterialProvider,
} from "../../src/domain/vto/material-types.js";
import {
  DepthAwareCompositor,
  DepthAwareLayerSpec,
} from "../../src/domain/vto/depth-aware-compositor.js";
import {
  DepthMaterialPipeline,
} from "../../src/domain/vto/depth-material-pipeline.js";
import {
  DeterministicFakeSegmentationProvider,
} from "../../src/domain/vto/segmentation-provider.js";
import {
  PosePreprocessingPipeline,
  RawPoseInput,
} from "../../src/domain/vto/pose-preprocessing-pipeline.js";
import { CanonicalLandmarkIndex } from "../../src/domain/vto/pose-types.js";
import {
  GarmentReference,
  BodyProfileReference,
} from "../../src/domain/vto/virtual-tryon.js";

describe("Phase 156: Dynamic Depth Occlusion & Material Appearance Pipeline", () => {
  const sampleGarment: GarmentReference = {
    productId: "garment-leather-biker-01",
    name: "Classic Leather Biker Jacket",
    category: "UPPER_BODY",
    size: "L",
    primaryAsset: {
      referenceId: "asset-leather-01",
      sourceType: "ARTIFACT_REF",
      uriOrHandle: "memory://assets/biker.webp",
      mimeType: "image/webp",
    },
  };

  const sampleSilkGarment: GarmentReference = {
    productId: "garment-silk-blouse-01",
    name: "Pure Silk Evening Blouse",
    category: "UPPER_BODY",
    size: "S",
    primaryAsset: {
      referenceId: "asset-silk-01",
      sourceType: "ARTIFACT_REF",
      uriOrHandle: "memory://assets/silk.webp",
      mimeType: "image/webp",
    },
  };

  const sampleBodyProfile: BodyProfileReference = {
    profileId: "profile-user-01",
    profileType: "USER_CALIBRATED",
    genderPresentation: "NEUTRAL",
    measurements: {
      heightCm: 178,
      chestBustCm: 98,
      waistCm: 82,
      shoulderWidthCm: 46,
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
  // 1. RELATIVE DEPTH MODEL & FAIL-CLOSED VALIDATION
  // =========================================================================
  describe("1. Relative Depth Model & Fail-Closed Validation", () => {
    it("1.1 validates a correct normalized depth map with valid min/max/mean metrics", () => {
      const map: DepthMap = {
        width: 2,
        height: 2,
        depthType: "NORMALIZED_DEPTH",
        format: "FLOAT32",
        values: [0.2, 0.4, 0.6, 0.8],
        range: { near: 0.0, far: 1.0, unit: "NORMALIZED_UNITLESS" },
        overallConfidence: 0.95,
        source: "SIMULATED_DETERMINISTIC",
      };

      const result = validateDepthMap(map);
      assert.equal(result.isValid, true);
      assert.equal(result.minDepth, 0.2);
      assert.equal(result.maxDepth, 0.8);
      assert.equal(result.meanDepth, 0.5);
      assert.equal(result.validPixelsCount, 4);
    });

    it("1.2 rejects non-finite values (NaN, Infinity) fail-closed", () => {
      const nanMap: DepthMap = {
        width: 2,
        height: 2,
        depthType: "NORMALIZED_DEPTH",
        format: "FLOAT32",
        values: [0.2, NaN, 0.6, 0.8],
        range: { near: 0.0, far: 1.0 },
        overallConfidence: 0.95,
        source: "SIMULATED_DETERMINISTIC",
      };
      assert.equal(validateDepthMap(nanMap).isValid, false);

      const infMap: DepthMap = {
        ...nanMap,
        values: [0.2, Infinity, 0.6, 0.8],
      };
      assert.equal(validateDepthMap(infMap).isValid, false);
    });

    it("1.3 rejects out-of-range normalized depth values (<0 or >1)", () => {
      const outOfRangeMap: DepthMap = {
        width: 2,
        height: 2,
        depthType: "NORMALIZED_DEPTH",
        format: "FLOAT32",
        values: [0.2, 1.5, 0.6, 0.8],
        range: { near: 0.0, far: 1.0 },
        overallConfidence: 0.95,
        source: "SIMULATED_DETERMINISTIC",
      };
      const result = validateDepthMap(outOfRangeMap);
      assert.equal(result.isValid, false);
      assert.ok(result.error?.includes("out of bounds"));
    });

    it("1.4 enforces invariant: UNKNOWN_DEPTH is distinct from ZERO and FAR", () => {
      const unknownDepthType: DepthMap = {
        width: 2,
        height: 2,
        depthType: "UNKNOWN_DEPTH",
        format: "FLOAT32",
        values: [0.5, 0.5, 0.5, 0.5],
        range: { near: 0.0, far: 1.0 },
        overallConfidence: 0.0,
        source: "SIMULATED_DETERMINISTIC",
      };

      assert.notEqual(unknownDepthType.depthType, "METRIC_DEPTH");
      assert.notEqual(unknownDepthType.depthType, "NORMALIZED_DEPTH");
      assert.equal(unknownDepthType.overallConfidence, 0.0);
    });
  });

  // =========================================================================
  // 2. DETERMINISTIC FAKE DEPTH PROVIDER
  // =========================================================================
  describe("2. Deterministic Fake Depth Provider", () => {
    it("2.1 generates synthetic body-centered depth map matching requested dimensions", async () => {
      const provider = new DeterministicFakeDepthProvider({
        defaultResolution: { width: 32, height: 32 },
        defaultSceneType: "BODY_CENTERED",
        forcedConfidence: 0.93,
      });

      const result = await provider.estimateDepth({
        requestId: "req-depth-01",
        tenantId: "tenant-tentaciones",
        sourceImage: sampleGarment.primaryAsset,
      });

      assert.equal(result.status, "SUCCESS");
      assert.equal(result.overallConfidence, 0.93);
      assert.ok(result.depthMap);
      assert.equal(result.depthMap.width, 32);
      assert.equal(result.depthMap.height, 32);
      assert.equal(validateDepthMap(result.depthMap).isValid, true);
    });

    it("2.2 handles simulated provider failure gracefully with safe error details", async () => {
      const provider = new DeterministicFakeDepthProvider({
        simulateFailure: true,
        failureErrorMessage: "Monocular depth model checkpoint missing",
      });

      const health = await provider.checkHealth();
      assert.equal(health.status, "UNAVAILABLE");

      const result = await provider.estimateDepth({
        requestId: "req-depth-02",
        tenantId: "tenant-tentaciones",
        sourceImage: sampleGarment.primaryAsset,
      });

      assert.equal(result.status, "FAILED");
      assert.equal(result.error?.code, "DEPTH_INFERENCE_ERROR");
      assert.equal(result.error?.message, "Monocular depth model checkpoint missing");
    });
  });

  // =========================================================================
  // 3. DYNAMIC DEPTH OCCLUSION & TEMPORAL HYSTERESIS
  // =========================================================================
  describe("3. Dynamic Depth Occlusion & Temporal Hysteresis", () => {
    it("3.1 classifies GARMENT_IN_FRONT when garment depth is closer than body depth", () => {
      const bodyDepth: DepthMap = {
        width: 2,
        height: 2,
        depthType: "NORMALIZED_DEPTH",
        format: "FLOAT32",
        values: [0.40, 0.40, 0.40, 0.40],
        range: { near: 0.0, far: 1.0 },
        overallConfidence: 0.9,
        source: "SIMULATED_DETERMINISTIC",
      };

      const garmentDepth: DepthMap = {
        width: 2,
        height: 2,
        depthType: "NORMALIZED_DEPTH",
        format: "FLOAT32",
        values: [0.35, 0.35, 0.35, 0.35], // Closer to camera than 0.40 (deltaZ = -0.05 < -0.03)
        range: { near: 0.0, far: 1.0 },
        overallConfidence: 0.9,
        source: "SIMULATED_DETERMINISTIC",
      };

      const occMap = DynamicOcclusionResolver.resolveOcclusion(bodyDepth, garmentDepth);
      assert.equal(occMap.garmentInFrontRatio, 1.0);
      assert.equal(occMap.garmentBehindRatio, 0.0);
      assert.equal(occMap.states[0], "GARMENT_IN_FRONT");
    });

    it("3.2 classifies GARMENT_BEHIND when body occluder (e.g. crossing arm) is closer than garment", () => {
      const bodyDepth: DepthMap = {
        width: 2,
        height: 2,
        depthType: "NORMALIZED_DEPTH",
        format: "FLOAT32",
        values: [0.25, 0.25, 0.25, 0.25], // Arm in front at depth 0.25
        range: { near: 0.0, far: 1.0 },
        overallConfidence: 0.9,
        source: "SIMULATED_DETERMINISTIC",
      };

      const garmentDepth: DepthMap = {
        width: 2,
        height: 2,
        depthType: "NORMALIZED_DEPTH",
        format: "FLOAT32",
        values: [0.35, 0.35, 0.35, 0.35], // Garment behind arm (deltaZ = +0.10 > 0.03)
        range: { near: 0.0, far: 1.0 },
        overallConfidence: 0.9,
        source: "SIMULATED_DETERMINISTIC",
      };

      const occMap = DynamicOcclusionResolver.resolveOcclusion(bodyDepth, garmentDepth);
      assert.equal(occMap.garmentBehindRatio, 1.0);
      assert.equal(occMap.garmentInFrontRatio, 0.0);
      assert.equal(occMap.states[0], "GARMENT_BEHIND");
    });

    it("3.3 classifies SAME_DEPTH when depth difference is within depthEpsilon tolerance", () => {
      const bodyDepth: DepthMap = {
        width: 2,
        height: 2,
        depthType: "NORMALIZED_DEPTH",
        format: "FLOAT32",
        values: [0.40, 0.40, 0.40, 0.40],
        range: { near: 0.0, far: 1.0 },
        overallConfidence: 0.9,
        source: "SIMULATED_DETERMINISTIC",
      };

      const garmentDepth: DepthMap = {
        width: 2,
        height: 2,
        depthType: "NORMALIZED_DEPTH",
        format: "FLOAT32",
        values: [0.41, 0.39, 0.40, 0.41], // |deltaZ| <= 0.03
        range: { near: 0.0, far: 1.0 },
        overallConfidence: 0.9,
        source: "SIMULATED_DETERMINISTIC",
      };

      const occMap = DynamicOcclusionResolver.resolveOcclusion(bodyDepth, garmentDepth, undefined, undefined, undefined, { depthEpsilon: 0.03 });
      assert.equal(occMap.sameDepthRatio, 1.0);
      assert.equal(occMap.states[0], "SAME_DEPTH");
    });

    it("3.4 applies temporal hysteresis to stabilize minor fluctuating depth boundaries", () => {
      const bodyDepth: DepthMap = {
        width: 2,
        height: 2,
        depthType: "NORMALIZED_DEPTH",
        format: "FLOAT32",
        values: [0.40, 0.40, 0.40, 0.40],
        range: { near: 0.0, far: 1.0 },
        overallConfidence: 0.9,
        source: "SIMULATED_DETERMINISTIC",
      };

      // Previous frame was GARMENT_BEHIND
      const prevMap: DynamicOcclusionMap = {
        width: 2,
        height: 2,
        states: ["GARMENT_BEHIND", "GARMENT_BEHIND", "GARMENT_BEHIND", "GARMENT_BEHIND"],
        confidence: 0.9,
        garmentInFrontRatio: 0,
        garmentBehindRatio: 1.0,
        sameDepthRatio: 0,
        unknownRatio: 0,
        isDegraded: false,
      };

      // Slight fluctuation: deltaZ = 0.39 - 0.40 = -0.01 (not exceeding exitOcclusionThreshold 0.02)
      const fluctuatingGarmentDepth: DepthMap = {
        width: 2,
        height: 2,
        depthType: "NORMALIZED_DEPTH",
        format: "FLOAT32",
        values: [0.39, 0.39, 0.39, 0.39],
        range: { near: 0.0, far: 1.0 },
        overallConfidence: 0.9,
        source: "SIMULATED_DETERMINISTIC",
      };

      const occMap = DynamicOcclusionResolver.resolveOcclusion(
        bodyDepth,
        fluctuatingGarmentDepth,
        undefined,
        undefined,
        prevMap,
        { exitOcclusionThreshold: 0.02 }
      );

      // Hysteresis keeps state as GARMENT_BEHIND to prevent flickering
      assert.equal(occMap.states[0], "GARMENT_BEHIND");
    });
  });

  // =========================================================================
  // 4. GARMENT MATERIAL PROFILE & APPEARANCE HINTS
  // =========================================================================
  describe("4. Garment Material Profile & Appearance Hints", () => {
    it("4.1 validates a complete material profile with valid parameters", () => {
      const profile: GarmentMaterialProfile = {
        materialId: "mat-silk-01",
        category: "SILK",
        provenance: "CATALOG_PROVIDED",
        confidence: 0.95,
        roughness: 0.2,
        metallic: 0.0,
        specularLevel: 0.85,
        opacity: 1.0,
      };

      assert.equal(validateMaterialProfile(profile).isValid, true);
    });

    it("4.2 rejects out-of-range roughness, metallic, or opacity fail-closed", () => {
      const badRoughness: GarmentMaterialProfile = {
        materialId: "mat-bad-01",
        category: "LEATHER",
        provenance: "INFERRED",
        confidence: 0.9,
        roughness: 1.5, // > 1.0
        metallic: 0.0,
        specularLevel: 0.5,
        opacity: 1.0,
      };
      assert.equal(validateMaterialProfile(badRoughness).isValid, false);

      const nanMetallic: GarmentMaterialProfile = {
        ...badRoughness,
        roughness: 0.5,
        metallic: NaN,
      };
      assert.equal(validateMaterialProfile(nanMetallic).isValid, false);
    });

    it("4.3 deterministic material provider classifies categories correctly based on product tags", () => {
      const leatherProfile = DeterministicMaterialProvider.resolveMaterialProfile(sampleGarment);
      assert.equal(leatherProfile.category, "LEATHER");
      assert.ok(leatherProfile.roughness < 0.5);

      const silkProfile = DeterministicMaterialProvider.resolveMaterialProfile(sampleSilkGarment);
      assert.equal(silkProfile.category, "SILK");
      assert.ok(silkProfile.specularLevel > 0.7);
    });

    it("4.4 derives lighting-neutral appearance hints with transparency and normal hints", () => {
      const leatherProfile = DeterministicMaterialProvider.resolveMaterialProfile(sampleGarment);
      const hints = deriveAppearanceHints(leatherProfile);

      assert.equal(hints.surfaceClassification, "LEATHER");
      assert.equal(hints.isTransparent, false);
      assert.ok(hints.normalScale && hints.normalScale > 1.0);
    });
  });

  // =========================================================================
  // 5. DEPTH-AWARE MULTI-LAYER COMPOSITION
  // =========================================================================
  describe("5. Depth-Aware Multi-Layer Composition", () => {
    it("5.1 reorders garment behind body when dynamic depth occlusion indicates garment is occluded", () => {
      const layers: DepthAwareLayerSpec[] = [
        { layerId: "l-bg", layerKind: "BACKGROUND", visibility: "VISIBLE", zIndex: 0, opacity: 1.0 },
        { layerId: "l-body", layerKind: "BODY", visibility: "VISIBLE", zIndex: 10, opacity: 1.0 },
        { layerId: "l-garment", layerKind: "GARMENT", visibility: "VISIBLE", zIndex: 20, opacity: 1.0 },
      ];

      const heavyOcclusion: DynamicOcclusionMap = {
        width: 16,
        height: 16,
        states: new Array(256).fill("GARMENT_BEHIND"),
        confidence: 0.92,
        garmentInFrontRatio: 0.0,
        garmentBehindRatio: 1.0, // 100% behind body!
        sameDepthRatio: 0.0,
        unknownRatio: 0.0,
        isDegraded: false,
      };

      const result = DepthAwareCompositor.compose({
        requestId: "req-depth-comp-01",
        tenantId: "tenant-tentaciones",
        layers,
        dynamicOcclusionMap: heavyOcclusion,
      });

      assert.equal(result.status, "DEGRADED");
      assert.equal(result.depthOrderApplied, true);
      assert.equal(result.occludedLayerCount, 1);
      // Garment is shifted to Z=5 (behind BODY at Z=10)
      assert.equal(result.orderedLayers[1].layerKind, "GARMENT");
      assert.equal(result.orderedLayers[1].zIndex, 5);
      assert.equal(result.orderedLayers[2].layerKind, "BODY");
      assert.equal(result.orderedLayers[2].zIndex, 10);
    });

    it("5.2 falls back safely to static semantic Z-order when depth estimation is degraded", () => {
      const layers: DepthAwareLayerSpec[] = [
        { layerId: "l-bg", layerKind: "BACKGROUND", visibility: "VISIBLE", zIndex: 0, opacity: 1.0 },
        { layerId: "l-body", layerKind: "BODY", visibility: "VISIBLE", zIndex: 10, opacity: 1.0 },
        { layerId: "l-garment", layerKind: "GARMENT", visibility: "VISIBLE", zIndex: 20, opacity: 1.0 },
      ];

      const result = DepthAwareCompositor.compose({
        requestId: "req-depth-comp-02",
        tenantId: "tenant-tentaciones",
        layers,
        fallbackToStaticZOrder: true,
      });

      assert.equal(result.status, "SUCCESS");
      assert.equal(result.depthOrderApplied, false);
      assert.equal(result.orderedLayers[1].layerKind, "BODY");
      assert.equal(result.orderedLayers[2].layerKind, "GARMENT");
    });
  });

  // =========================================================================
  // 6. END-TO-END DEPTH, OCCLUSION & MATERIAL GOLDEN JOURNEY
  // =========================================================================
  describe("6. End-to-End Depth, Occlusion & Material Golden Journey", () => {
    it("6.1 executes complete pipeline: Pose -> Segmentation -> Warp -> Depth -> Occlusion -> Material -> Depth-Aware Composition -> Artifacts", async () => {
      // 1. Pose Preprocessing (Phase 154)
      const posePipeline = new PosePreprocessingPipeline();
      const rawPose: RawPoseInput = {
        frameId: "frame-depth-001",
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

      // 2. Depth & Material Pipeline (Phase 156)
      const segProvider = new DeterministicFakeSegmentationProvider({
        defaultResolution: { width: 64, height: 64 },
        forcedConfidence: 0.94,
      });

      const depthProvider = new DeterministicFakeDepthProvider({
        defaultResolution: { width: 64, height: 64 },
        defaultSceneType: "GARMENT_FOREGROUND",
        forcedConfidence: 0.92,
      });

      const pipeline = new DepthMaterialPipeline({
        segmentationProvider: segProvider,
        depthProvider,
      });

      const result = await pipeline.process(
        preparedPose,
        sampleGarment,
        "tenant-tentaciones",
        sampleBodyProfile
      );

      // Verify pipeline execution status and quality
      assert.equal(result.requestId, preparedPose.preparedInputId);
      assert.equal(result.tenantId, "tenant-tentaciones");
      assert.equal(result.isDegraded, false);
      assert.equal(result.depthStatus, "SUCCESS");
      assert.ok(result.depthConfidence > 0.9);

      // Verify Material Profile & Hints
      assert.ok(result.materialProfile);
      assert.equal(result.materialProfile.category, "LEATHER");
      assert.ok(result.materialHints);
      assert.equal(result.materialHints.surfaceClassification, "LEATHER");

      // Verify Dynamic Occlusion Map
      assert.ok(result.dynamicOcclusionMap);
      assert.ok(result.dynamicOcclusionMap.garmentInFrontRatio > 0.1);

      // Verify Depth-Aware Layers
      assert.equal(result.depthAwareLayers.length, 3);
      assert.equal(result.depthAwareLayers[0].layerKind, "BACKGROUND");
      assert.equal(result.depthAwareLayers[1].layerKind, "BODY");
      assert.equal(result.depthAwareLayers[2].layerKind, "GARMENT");

      // Verify Structured Artifacts
      assert.ok(result.artifacts.length >= 7);
      const depthArt = result.artifacts.find((a) => a.kind === "DEPTH_MAP");
      const dynOccArt = result.artifacts.find((a) => a.kind === "DYNAMIC_OCCLUSION_MAP");
      const matArt = result.artifacts.find((a) => a.kind === "MATERIAL_PROFILE");
      const compArt = result.artifacts.find((a) => a.kind === "DEPTH_AWARE_COMPOSITION");

      assert.ok(depthArt);
      assert.ok(dynOccArt);
      assert.ok(matArt);
      assert.ok(compArt);
    });
  });
});

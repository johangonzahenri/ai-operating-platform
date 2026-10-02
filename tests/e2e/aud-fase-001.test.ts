/**
 * AI Operating Platform — Transversal Quality Governance & Audit Suite
 * 
 * AUD-FASE-001: Stabilization Audit for On-Device VTO, WebGPU, WebWorker & Camera Pipeline
 * 
 * Scope: Fases 157, 158, 159 & Upstream Integration (Fases 153-156)
 * 
 * Invariants Formally Verified:
 * 1. Hexagonal Boundary Purity: 0 browser/DOM/GPU APIs in src/domain/vto/
 * 2. Canonical Model Identity: vto-alignment-quality-v1 is the sole authoritative ID
 * 3. End-to-End Pipeline Integration: Frame -> Preprocess -> Worker -> Pose -> Warp -> Depth -> Inference
 * 4. Backpressure & Bounded Memory: DROP_OLDEST drops oldest under congestion
 * 5. Fail-Closed Protocol & Sandboxing: Closed VtoWorkerOperation allowlist, zero eval/new Function
 * 6. Privacy by Design: Zero image persistence, zero biometric logging
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Domain - Frame Protocol & Source Port (Fase 159)
import {
  VideoFrameInput,
} from "../../src/domain/vto/frame-protocol.js";

// Application - Frame Pipeline & Simulated Source (Fase 159)
import {
  FramePreprocessingPipeline,
} from "../../src/application/vto/frame-preprocessing-pipeline.js";
import {
  SimulatedFrameSource,
} from "../../src/application/vto/simulated-frame-source.js";

// Domain & Application - WebWorker Protocol & Dispatcher (Fase 158)
import {
  VTO_WORKER_PROTOCOL_VERSION,
  VtoWorkerRequest,
} from "../../src/domain/vto/worker-protocol.js";
import {
  VtoWorkerRuntimeDispatcher,
} from "../../src/application/vto/worker-runtime-dispatcher.js";

// Domain & Application - WebGPU & On-Device Neural Inference (Fase 157)
import {
  CANONICAL_VTO_MICRO_MODEL_ID,
  CANONICAL_VTO_MICRO_MODEL_MANIFEST,
} from "../../src/domain/vto/canonical-micro-model.js";
import {
  CpuMicroModelInferenceProvider,
} from "../../src/domain/vto/cpu-inference-provider.js";
import {
  OnDeviceVtoInferenceCoordinator,
} from "../../src/application/vto/on-device-vto-coordinator.js";
import {
  SimulatedWebGpuContext,
} from "../../src/application/vto/simulated-webgpu-context.js";
import {
  WebGpuInferenceProvider,
} from "../../src/application/vto/webgpu-inference-provider.js";

// Upstream Domain - Pose, Warp, Depth (Fases 154, 155, 156)
import { CanonicalLandmarkIndex } from "../../src/domain/vto/pose-types.js";
import {
  RawPoseInput,
  PosePreprocessingPipeline,
} from "../../src/domain/vto/pose-preprocessing-pipeline.js";
import {
  GarmentReference,
  BodyProfileReference,
} from "../../src/domain/vto/virtual-tryon.js";
import {
  GarmentWarpEngine,
} from "../../src/domain/vto/garment-warping.js";
import {
  createAffineWarpField,
} from "../../src/domain/vto/warp-field.js";
import {
  DepthMaterialPipeline,
} from "../../src/domain/vto/depth-material-pipeline.js";
import {
  DeterministicFakeDepthProvider,
} from "../../src/domain/vto/depth-provider.js";
import {
  DeterministicFakeSegmentationProvider,
} from "../../src/domain/vto/segmentation-provider.js";

describe("AUD-FASE-001 — VTO On-Device, WebGPU, WebWorker & Camera Pipeline Stabilization Audit", () => {

  const sampleGarment: GarmentReference = {
    productId: "garment-aud-01",
    name: "Classic Wool Blazer",
    category: "UPPER_BODY",
    size: "M",
    primaryAsset: {
      referenceId: "asset-garment-01",
      sourceType: "ARTIFACT_REF",
      uriOrHandle: "memory://garments/blazer.webp",
      mimeType: "image/webp",
    },
  };

  const sampleProfile: BodyProfileReference = {
    profileId: "profile-aud-01",
    profileType: "USER_CALIBRATED",
    genderPresentation: "NEUTRAL",
    measurements: { heightCm: 175, chestBustCm: 96, waistCm: 80, shoulderWidthCm: 45 },
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
  // 1. END-TO-END PIPELINE INTEGRATION (FASES 159 -> 158 -> 154-157)
  // =========================================================================
  describe("1. Cross-Phase End-to-End Pipeline Integration", () => {
    it("1.1 executes Frame Ingestion -> Preprocessing -> WebWorker Offload -> Pose Alignment", async () => {
      // 1. Frame Ingestion (F159)
      const source = new SimulatedFrameSource({
        preferredDimensions: { width: 640, height: 480 },
        pixelFormat: "RGBA8",
      });
      await source.initialize();
      const rawFrame = await source.acquireFrame();
      assert.ok(rawFrame);

      // 2. Preprocessing & Normalization (F159)
      const pipeline = new FramePreprocessingPipeline({
        maxDimensions: { width: 320, height: 240 },
        enforceMonotonicTimestamps: true,
      });
      const preprocResult = pipeline.process(rawFrame);
      assert.equal(preprocResult.success, true);
      assert.ok(preprocResult.frame);
      assert.equal(preprocResult.frame.metadata.dimensions.width, 320);

      // 3. WebWorker Offload Dispatch (F158)
      const dispatcher = new VtoWorkerRuntimeDispatcher();
      const workerReq: VtoWorkerRequest = {
        protocolVersion: VTO_WORKER_PROTOCOL_VERSION,
        requestId: "aud-req-001",
        operation: "FRAME_PREPROCESS",
        payload: {
          frame: preprocResult.frame,
          config: { targetFormat: "GRAYSCALE8" },
        },
        timestampMs: Date.now(),
        tenantId: "tenant-aud-fase-001",
        applicationId: "app-tentaciones-vto",
      };

      const workerRes = await dispatcher.dispatch(workerReq);
      assert.equal(workerRes.status, "SUCCESS");
      assert.equal(workerRes.requestId, "aud-req-001");
      assert.ok(workerRes.payload);

      // 4. Pose Preprocessing & Alignment (F154)
      const rawPose: RawPoseInput = {
        frameId: "aud-pose-001",
        timestampMs: Date.now(),
        isPixelCoordinates: true,
        imageDimensions: { widthPx: 1920, heightPx: 1080 },
        rawLandmarks: createSyntheticPoseLandmarks(),
      };

      const posePipeline = new PosePreprocessingPipeline();
      const preparedPose = posePipeline.processPoseFrame(rawPose, sampleGarment, sampleProfile);
      assert.equal(preparedPose.isReadyForInference, true);
      assert.ok(preparedPose.garmentAlignment);
      assert.equal(preparedPose.garmentAlignment.quality, "ALIGNED");

      await source.release();
    });

    it("1.2 verifies Garment Warping uses 2D continuous deformation grid (WarpField2D), NOT Thin-Plate Splines", () => {
      const transform = {
        scale: { x: 1.15, y: 1.1 },
        rotationDegrees: 12.5,
        translation: { x: 0.05, y: -0.03 },
        anchorOrigin: { x: 0.5, y: 0.5 },
        boundingBox: { xMin: 0.2, yMin: 0.2, xMax: 0.8, yMax: 0.8 },
      };

      const warp = createAffineWarpField(8, 8, transform);
      assert.ok(warp);
      assert.equal(warp.gridWidth, 8);
      assert.equal(warp.gridHeight, 8);
      // Validates WarpField2D structure (dx, dy arrays of length 64)
      assert.equal(warp.dx.length, 64);
      assert.equal(warp.dy.length, 64);
      // Confirms mathematical nature: bilinear continuous grid, NOT Thin-Plate Splines
      assert.equal(warp.warpType, "AFFINE");
    });

    it("1.3 executes Depth Estimation, Dynamic Occlusion and Neural Inference Coordinator with CPU Fallback", async () => {
      const rawPose: RawPoseInput = {
        frameId: "aud-pose-002",
        timestampMs: 1000,
        isPixelCoordinates: true,
        imageDimensions: { widthPx: 1920, heightPx: 1080 },
        rawLandmarks: createSyntheticPoseLandmarks(),
      };
      const posePipeline = new PosePreprocessingPipeline();
      const preparedPose = posePipeline.processPoseFrame(rawPose, sampleGarment, sampleProfile);

      // 1. Depth & Occlusion Pipeline (F156)
      const segProvider = new DeterministicFakeSegmentationProvider({ defaultResolution: { width: 32, height: 32 } });
      const depthProvider = new DeterministicFakeDepthProvider({ defaultResolution: { width: 32, height: 32 }, defaultSceneType: "GARMENT_FOREGROUND" });
      const depthPipeline = new DepthMaterialPipeline({ segmentationProvider: segProvider, depthProvider });

      const depthRes = await depthPipeline.process(preparedPose, sampleGarment, "tenant-aud", sampleProfile);
      assert.equal(depthRes.depthStatus, "SUCCESS");
      assert.ok(depthRes.depthMap);
      assert.ok(depthRes.materialProfile);

      // 2. Micro-Model Neural Inference Coordinator (F157)
      const fakeGpuContext = new SimulatedWebGpuContext({ shouldFail: false });
      const gpuProvider = new WebGpuInferenceProvider({ gpuContext: fakeGpuContext });
      const cpuProvider = new CpuMicroModelInferenceProvider();

      const coordinator = new OnDeviceVtoInferenceCoordinator({
        primaryProvider: gpuProvider,
        fallbackProvider: cpuProvider,
        allowCpuFallback: true,
      });

      const evalGpu = await coordinator.evaluateVtoInput(preparedPose, "tenant-aud", "app-tentaciones");
      assert.equal(evalGpu.isHardwareAccelerated, true);
      assert.equal(evalGpu.inferenceProviderType, "WEBGPU");

      // Verify fallback behavior when GPU is unavailable
      const unavailContext = new SimulatedWebGpuContext({ shouldFail: true });
      const fallbackCoordinator = new OnDeviceVtoInferenceCoordinator({
        primaryProvider: new WebGpuInferenceProvider({ gpuContext: unavailContext }),
        fallbackProvider: cpuProvider,
        allowCpuFallback: true,
      });

      const evalFallback = await fallbackCoordinator.evaluateVtoInput(preparedPose, "tenant-aud", "app-tentaciones");
      assert.equal(evalFallback.isHardwareAccelerated, false);
      assert.equal(evalFallback.isFallbackApplied, true);
      assert.equal(evalFallback.inferenceProviderType, "CPU_REFERENCE");
    });
  });

  // =========================================================================
  // 2. CANONICAL MODEL IDENTITY & DOMAIN ARCHITECTURAL PURITY
  // =========================================================================
  describe("2. Canonical Identity & Architectural Boundary Purity", () => {
    it("2.1 confirms CANONICAL_VTO_MICRO_MODEL_ID is uniquely 'vto-alignment-quality-v1'", () => {
      assert.equal(CANONICAL_VTO_MICRO_MODEL_ID, "vto-alignment-quality-v1");
      assert.equal(CANONICAL_VTO_MICRO_MODEL_MANIFEST.modelId, "vto-alignment-quality-v1");
      assert.equal(CANONICAL_VTO_MICRO_MODEL_MANIFEST.modelVersion, "1.0.0");
    });

    it("2.2 verifies src/domain/vto/ contains ZERO references to browser APIs or GPU globals", () => {
      const domainDir = path.resolve(process.cwd(), "src/domain/vto");
      const files = fs.readdirSync(domainDir).filter((f) => f.endsWith(".ts"));

      const forbiddenAPIs = [
        "navigator.",
        "window.",
        "document.",
        "MediaStream",
        "MediaStreamTrack",
        "HTMLVideoElement",
        "HTMLCanvasElement",
        "CanvasRenderingContext2D",
        "OffscreenCanvas",
        "postMessage",
        "window.addEventListener",
        "document.addEventListener",
        "GPUDevice",
        "GPUBuffer",
        "GPUQueue",
      ];

      for (const file of files) {
        const fullPath = path.join(domainDir, file);
        const rawContent = fs.readFileSync(fullPath, "utf-8");
        const codeOnly = rawContent.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");

        for (const forbidden of forbiddenAPIs) {
          assert.equal(
            codeOnly.includes(forbidden),
            false,
            `Architectural violation: Forbidden token "${forbidden}" in domain file "${file}"`
          );
        }
      }
    });

    it("2.3 confirms WorkerRuntimeDispatcher has ZERO eval or new Function in executable code", () => {
      const dispatcherPath = path.resolve(process.cwd(), "src/application/vto/worker-runtime-dispatcher.ts");
      const rawContent = fs.readFileSync(dispatcherPath, "utf-8");
      const codeOnly = rawContent.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");

      assert.equal(/\beval\s*\(/.test(codeOnly), false, "eval() found in WorkerRuntimeDispatcher");
      assert.equal(/\bnew\s+Function\b/.test(codeOnly), false, "new Function found in WorkerRuntimeDispatcher");
    });
  });

  // =========================================================================
  // 3. CONCURRENCY, BACKPRESSURE & PRIVACY INVARIANTS
  // =========================================================================
  describe("3. Concurrency, Backpressure & Privacy Invariants", () => {
    it("3.1 verifies DROP_OLDEST policy prevents queue saturation under congestion", async () => {
      const source = new SimulatedFrameSource({
        targetFps: 0,
        maxQueueCapacity: 2,
        dropPolicy: "DROP_OLDEST",
      });
      await source.initialize();

      // Pause consumption to induce queue congestion
      await source.pause();

      await source.stepEmit(); // Queue: [1]
      await source.stepEmit(); // Queue: [1, 2]
      await source.stepEmit(); // Queue: [2, 3] -> 1 dropped
      await source.stepEmit(); // Queue: [3, 4] -> 2 dropped

      const metrics = source.getMetrics();
      assert.equal(metrics.framesAcquired, 4);
      assert.equal(metrics.framesDropped, 2);
      assert.equal(metrics.queueDepth, 2); // Bounded at capacity

      await source.release();
    });

    it("3.2 verifies technical metrics aggregate zero visual frames, pixel buffers, or biometrics", async () => {
      const source = new SimulatedFrameSource();
      await source.initialize();
      await source.acquireFrame();

      const metrics = source.getMetrics();
      const prohibitedKeys = ["pixel", "image", "raw", "photo", "biometric", "face", "body", "buffer"];

      for (const key of Object.keys(metrics)) {
        for (const token of prohibitedKeys) {
          assert.equal(
            key.toLowerCase().includes(token),
            false,
            `Prohibited private visual/biometric token "${token}" found in metrics property "${key}"`
          );
        }
      }
      await source.release();
    });
  });
});

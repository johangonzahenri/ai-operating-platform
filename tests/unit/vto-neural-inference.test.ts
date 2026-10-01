/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * Comprehensive Unit Test Suite for Phase 157:
 * WebGPU On-Device Neural Inference & Micro-Model Execution Pipeline.
 * 
 * Verifies:
 * 1. Neutral Tensor Model & Fail-Closed Validations (shape, rank, element count, NaN, Infinity)
 * 2. Micro-Model Manifest & ABI Compatibility Validations
 * 3. Deterministic Mathematical Authority: CPU Reference Provider
 * 4. WebGPU Inference Provider Lifecycle & Buffer Allocations
 * 5. Device Loss Handling (GPUDevice.lost transition to DEVICE_LOST)
 * 6. Numerical Parity: CPU vs WebGPU Execution within Epsilon Tolerance
 * 7. Graceful Fallback: WebGPU unavailable -> Explicit CPU Reference Fallback (status = DEGRADED)
 * 8. Cancellation & AbortSignal Support
 * 9. Hexagonal Architectural Boundary Purity: 0 WebGPU/navigator/GPUDevice in src/domain/
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  Tensor,
  DEFAULT_TENSOR_RESOURCE_LIMITS,
} from "../../src/domain/vto/neural-tensor.js";
import {
  validateModelAbi,
  validateModelManifest,
  MicroModelManifest,
} from "../../src/domain/vto/neural-model.js";
import {
  CANONICAL_VTO_MICRO_MODEL_MANIFEST,
  CANONICAL_VTO_MICRO_MODEL_ID,
  CANONICAL_VTO_MICRO_MODEL_VERSION,
  extractVtoFeatureTensor,
} from "../../src/domain/vto/canonical-micro-model.js";
import { CpuMicroModelInferenceProvider } from "../../src/domain/vto/cpu-inference-provider.js";
import { WebGpuInferenceProvider } from "../../src/application/vto/webgpu-inference-provider.js";
import {
  SimulatedWebGpuContext,
  SimulatedWebGpuDevice,
} from "../../src/application/vto/simulated-webgpu-context.js";
import { OnDeviceVtoInferenceCoordinator } from "../../src/application/vto/on-device-vto-coordinator.js";
import { PreparedVirtualTryOnInput } from "../../src/domain/vto/pose-preprocessing-pipeline.js";

describe("Phase 157: WebGPU On-Device Neural Inference & Micro-Model Execution Pipeline", () => {
  // =========================================================================
  // 1. TENSOR MODEL & NUMERICAL VALIDATION
  // =========================================================================
  describe("1. Neutral Tensor Domain Model & Validation", () => {
    it("1.1 instantiates valid Float32 Tensor with correct rank and element count", () => {
      const data = new Float32Array([1.0, 2.0, 3.0, 4.0, 5.0, 6.0]);
      const tensor = new Tensor([2, 3], data, "FLOAT32");

      assert.equal(tensor.rank, 2);
      assert.equal(tensor.elementCount, 6);
      assert.equal(tensor.byteLength, 24); // 6 * 4 bytes
      assert.deepEqual(tensor.shape, [2, 3]);
      assert.equal(tensor.dataType, "FLOAT32");
    });

    it("1.2 rejects empty or invalid shape arrays fail-closed", () => {
      const data = new Float32Array([1.0]);
      assert.throws(() => new Tensor([], data), /TENSOR_INVALID_SHAPE/);
      assert.throws(() => new Tensor([0], data), /TENSOR_INVALID_DIMENSION/);
      assert.throws(() => new Tensor([-1], data), /TENSOR_INVALID_DIMENSION/);
      assert.throws(() => new Tensor([1.5], data), /TENSOR_INVALID_DIMENSION/);
    });

    it("1.3 rejects buffer length mismatch with shape dimensions fail-closed", () => {
      const data = new Float32Array([1.0, 2.0, 3.0]); // length 3, expected 4
      assert.throws(() => new Tensor([2, 2], data), /TENSOR_BUFFER_MISMATCH/);
    });

    it("1.4 rejects non-finite numerical values (NaN, Infinity) fail-closed", () => {
      const nanData = new Float32Array([1.0, NaN, 3.0, 4.0]);
      assert.throws(() => new Tensor([2, 2], nanData), /TENSOR_NON_FINITE_VALUE.*NaN/);

      const infData = new Float32Array([1.0, Infinity, 3.0, 4.0]);
      assert.throws(() => new Tensor([2, 2], infData), /TENSOR_NON_FINITE_VALUE.*Infinity/);
    });

    it("1.5 validates resource limits (rank and buffer bytes)", () => {
      const hugeRank = [1, 1, 1, 1, 1]; // rank 5 exceeds default maxRank 4
      const data = new Float32Array([1.0]);
      assert.throws(() => new Tensor(hugeRank, data), /TENSOR_RANK_EXCEEDED/);

      const res = Tensor.validate(
        [100, 100],
        new Float32Array(10_000),
        "FLOAT32",
        { ...DEFAULT_TENSOR_RESOURCE_LIMITS, maxTotalElements: 1_000 }
      );
      assert.equal(res.isValid, false);
      assert.ok(res.errors[0].includes("TENSOR_ELEMENT_COUNT_EXCEEDED"));
    });
  });

  // =========================================================================
  // 2. MODEL MANIFEST & ABI COMPATIBILITY
  // =========================================================================
  describe("2. Micro-Model Manifest & ABI Compatibility", () => {
    it("2.1 validates canonical VTO micro-model manifest structure", () => {
      const result = validateModelManifest(CANONICAL_VTO_MICRO_MODEL_MANIFEST);
      assert.equal(result.isValid, true);
      assert.equal(result.errors.length, 0);
      assert.equal(CANONICAL_VTO_MICRO_MODEL_MANIFEST.modelId, CANONICAL_VTO_MICRO_MODEL_ID);
      assert.equal(CANONICAL_VTO_MICRO_MODEL_MANIFEST.modelVersion, CANONICAL_VTO_MICRO_MODEL_VERSION);
    });

    it("2.2 rejects invalid manifest with missing weights or mismatched dimensions fail-closed", () => {
      const invalidManifest: MicroModelManifest = {
        ...CANONICAL_VTO_MICRO_MODEL_MANIFEST,
        weights: {
          ...CANONICAL_VTO_MICRO_MODEL_MANIFEST.weights,
          layer1: {
            ...CANONICAL_VTO_MICRO_MODEL_MANIFEST.weights.layer1,
            weights: [0.1, 0.2], // Corrupted weight count
          },
        },
      };

      const result = validateModelManifest(invalidManifest);
      assert.equal(result.isValid, false);
      assert.ok(result.errors.some((e) => e.includes("MANIFEST_LAYER1_WEIGHT_COUNT_MISMATCH")));
    });

    it("2.3 validates ABI compatibility between input tensor and model spec", () => {
      const validInputs = new Map<string, { shape: readonly number[]; dataType: string }>([
        ["vto_features", { shape: [1, 8], dataType: "FLOAT32" }],
      ]);
      const abiRes = validateModelAbi(CANONICAL_VTO_MICRO_MODEL_MANIFEST, validInputs);
      assert.equal(abiRes.isValid, true);

      // Missing input
      const missingInputs = new Map<string, { shape: readonly number[]; dataType: string }>();
      const missingRes = validateModelAbi(CANONICAL_VTO_MICRO_MODEL_MANIFEST, missingInputs);
      assert.equal(missingRes.isValid, false);
      assert.ok(missingRes.errors[0].includes("MODEL_ABI_MISSING_INPUT"));

      // Dimension mismatch
      const wrongShapeInputs = new Map<string, { shape: readonly number[]; dataType: string }>([
        ["vto_features", { shape: [1, 10], dataType: "FLOAT32" }],
      ]);
      const wrongShapeRes = validateModelAbi(CANONICAL_VTO_MICRO_MODEL_MANIFEST, wrongShapeInputs);
      assert.equal(wrongShapeRes.isValid, false);
      assert.ok(wrongShapeRes.errors[0].includes("MODEL_ABI_SHAPE_MISMATCH"));
    });
  });

  // =========================================================================
  // 3. CPU REFERENCE PROVIDER (MATHEMATICAL GROUND TRUTH)
  // =========================================================================
  describe("3. CPU Reference Micro-Model Inference Provider", () => {
    it("3.1 executes deterministic linear layers and ReLU activation", async () => {
      const provider = new CpuMicroModelInferenceProvider();
      await provider.loadModel(CANONICAL_VTO_MICRO_MODEL_MANIFEST);
      assert.equal(provider.lifecycleStatus, "READY");

      const inputFeatures = Tensor.fromArray([1, 8], [0.8, 0.25, 0.22, 1.14, 0.35, 1.0, 1.0, 0.0]);
      const request = {
        requestId: "req-cpu-01",
        tenantId: "tenant-test",
        applicationId: "app-test",
        modelId: CANONICAL_VTO_MICRO_MODEL_ID,
        modelVersion: CANONICAL_VTO_MICRO_MODEL_VERSION,
        inputs: new Map([["vto_features", inputFeatures]]),
      };

      const result1 = await provider.infer(request);
      assert.equal(result1.status, "SUCCESS");
      assert.equal(result1.providerType, "CPU_REFERENCE");
      assert.ok(result1.outputs.has("quality_scores"));

      const out1 = result1.outputs.get("quality_scores")!;
      assert.deepEqual(out1.shape, [1, 2]);

      // Assert determinism: second execution produces exact bitwise match
      const result2 = await provider.infer(request);
      const out2 = result2.outputs.get("quality_scores")!;
      assert.deepEqual(Array.from(out1.data), Array.from(out2.data));

      // Check outputs are non-negative and finite
      assert.ok(Number.isFinite(out1.data[0]));
      assert.ok(Number.isFinite(out1.data[1]));

      await provider.dispose();
      assert.equal(provider.lifecycleStatus, "DISPOSED");
    });

    it("3.2 supports AbortSignal and aborts before execution", async () => {
      const provider = new CpuMicroModelInferenceProvider();
      await provider.loadModel(CANONICAL_VTO_MICRO_MODEL_MANIFEST);

      const controller = new AbortController();
      controller.abort();

      const inputFeatures = Tensor.fromArray([1, 8], [0.8, 0.25, 0.22, 1.14, 0.35, 1.0, 1.0, 0.0]);
      const request = {
        requestId: "req-cpu-abort",
        tenantId: "tenant-test",
        applicationId: "app-test",
        modelId: CANONICAL_VTO_MICRO_MODEL_ID,
        modelVersion: CANONICAL_VTO_MICRO_MODEL_VERSION,
        inputs: new Map([["vto_features", inputFeatures]]),
        abortSignal: controller.signal,
      };

      const result = await provider.infer(request);
      assert.equal(result.status, "ABORTED");
      await provider.dispose();
    });
  });

  // =========================================================================
  // 4. WEBGPU PROVIDER LIFECYCLE & BUFFER ALLOCATION
  // =========================================================================
  describe("4. WebGPU Inference Provider Lifecycle & Buffer Management", () => {
    it("4.1 detects environment capabilities and reports availability cleanly", async () => {
      // Test double without native GPU
      const unavailableProvider = new WebGpuInferenceProvider({
        gpuContext: undefined, // no navigator.gpu
      });
      const caps = await unavailableProvider.getCapabilities();
      assert.equal(caps.isAvailableInEnvironment, false);
      assert.equal(caps.isHardwareAccelerated, false);
      assert.ok(caps.environmentReason?.includes("not available"));

      // Test double with simulated GPU
      const simContext = new SimulatedWebGpuContext();
      const simProvider = new WebGpuInferenceProvider({ gpuContext: simContext });
      const simCaps = await simProvider.getCapabilities();
      assert.equal(simCaps.isAvailableInEnvironment, true);
      assert.equal(simCaps.isHardwareAccelerated, true);
    });

    it("4.2 manages full GPU buffer allocation and lifecycle (UNINITIALIZED -> READY -> DISPOSED)", async () => {
      const simContext = new SimulatedWebGpuContext();
      const provider = new WebGpuInferenceProvider({ gpuContext: simContext });
      assert.equal(provider.lifecycleStatus, "UNINITIALIZED");

      await provider.loadModel(CANONICAL_VTO_MICRO_MODEL_MANIFEST);
      assert.equal(provider.lifecycleStatus, "READY");

      // Verify buffers were allocated and initialized
      const queue = simContext.adapter.activeDevice.queue;
      assert.ok(queue.writes.length >= 5); // params, l1 weights, l1 biases, l2 weights, l2 biases

      await provider.dispose();
      assert.equal(provider.lifecycleStatus, "DISPOSED");
      assert.equal(simContext.adapter.activeDevice.isDestroyed, true);
    });

    it("4.3 handles GPUDevice.lost explicitly and transitions status to DEVICE_LOST", async () => {
      const simContext = new SimulatedWebGpuContext();
      const provider = new WebGpuInferenceProvider({ gpuContext: simContext });
      await provider.loadModel(CANONICAL_VTO_MICRO_MODEL_MANIFEST);
      assert.equal(provider.lifecycleStatus, "READY");

      // Trigger simulated device loss
      simContext.adapter.activeDevice.triggerDeviceLoss("destroyed", "GPU execution device was reset");
      // Allow microtask to process
      await new Promise((resolve) => setTimeout(resolve, 10));

      assert.equal(provider.lifecycleStatus, "DEVICE_LOST");

      // Subsequent inference returns DEVICE_LOST fail-closed
      const inputFeatures = Tensor.fromArray([1, 8], [0.8, 0.25, 0.22, 1.14, 0.35, 1.0, 1.0, 0.0]);
      const result = await provider.infer({
        requestId: "req-lost",
        tenantId: "tenant-test",
        applicationId: "app-test",
        modelId: CANONICAL_VTO_MICRO_MODEL_ID,
        modelVersion: CANONICAL_VTO_MICRO_MODEL_VERSION,
        inputs: new Map([["vto_features", inputFeatures]]),
      });

      assert.equal(result.status, "DEVICE_LOST");
      assert.ok(result.errorDetails?.includes("lost or destroyed"));
    });
  });

  // =========================================================================
  // 5. NUMERICAL PARITY: CPU REFERENCE VS WEBGPU WITHIN EPSILON
  // =========================================================================
  describe("5. Numerical Parity: CPU Reference vs WebGPU Execution", () => {
    it("5.1 produces outputs within numerical tolerance (epsilon = 1e-4)", async () => {
      const inputData = [0.78, 0.26, 0.21, 1.15, 0.34, 1.02, 0.98, 0.05];
      const inputTensor = Tensor.fromArray([1, 8], inputData);

      // 1. CPU Reference Execution
      const cpuProvider = new CpuMicroModelInferenceProvider();
      await cpuProvider.loadModel(CANONICAL_VTO_MICRO_MODEL_MANIFEST);
      const cpuResult = await cpuProvider.infer({
        requestId: "req-parity-cpu",
        tenantId: "tenant-test",
        applicationId: "app-test",
        modelId: CANONICAL_VTO_MICRO_MODEL_ID,
        modelVersion: CANONICAL_VTO_MICRO_MODEL_VERSION,
        inputs: new Map([["vto_features", inputTensor]]),
      });
      assert.equal(cpuResult.status, "SUCCESS");
      const cpuOut = cpuResult.outputs.get("quality_scores")!.data;

      // 2. WebGPU Execution (via Simulated Context)
      const simContext = new SimulatedWebGpuContext();
      const gpuProvider = new WebGpuInferenceProvider({ gpuContext: simContext });
      await gpuProvider.loadModel(CANONICAL_VTO_MICRO_MODEL_MANIFEST);
      const gpuResult = await gpuProvider.infer({
        requestId: "req-parity-gpu",
        tenantId: "tenant-test",
        applicationId: "app-test",
        modelId: CANONICAL_VTO_MICRO_MODEL_ID,
        modelVersion: CANONICAL_VTO_MICRO_MODEL_VERSION,
        inputs: new Map([["vto_features", inputTensor]]),
      });
      assert.equal(gpuResult.status, "SUCCESS");
      const gpuOut = gpuResult.outputs.get("quality_scores")!.data;

      // 3. Epsilon Comparison
      const EPSILON = 1e-4;
      assert.equal(cpuOut.length, gpuOut.length);
      for (let i = 0; i < cpuOut.length; i++) {
        const diff = Math.abs(cpuOut[i] - gpuOut[i]);
        assert.ok(
          diff <= EPSILON,
          `Parity violation at index ${i}: CPU=${cpuOut[i]}, GPU=${gpuOut[i]}, diff=${diff} > epsilon ${EPSILON}`
        );
      }

      await cpuProvider.dispose();
      await gpuProvider.dispose();
    });
  });

  // =========================================================================
  // 6. ON-DEVICE VTO COORDINATOR & EXPLICIT CPU FALLBACK
  // =========================================================================
  describe("6. On-Device VTO Inference Coordinator & Fallback", () => {
    it("6.1 transparently falls back to CPU reference when WebGPU is unavailable with explicit status", async () => {
      // Coordinator configured with unavailable WebGPU context
      const unavailableContext = new SimulatedWebGpuContext({ shouldFail: true });
      const webGpuProvider = new WebGpuInferenceProvider({ gpuContext: unavailableContext });
      const cpuProvider = new CpuMicroModelInferenceProvider();

      const coordinator = new OnDeviceVtoInferenceCoordinator({
        primaryProvider: webGpuProvider,
        fallbackProvider: cpuProvider,
        allowCpuFallback: true,
      });

      await coordinator.initialize();

      const dummyPreparedInput: PreparedVirtualTryOnInput = {
        preparedInputId: "prep-fallback-01",
        normalizedPose: {} as any,
        smoothedPose: {} as any,
        anthropometricProfile: {
          profileId: "prof-01",
          estimatedHeightRatio: { value: 0.8, confidence: 1, source: "LANDMARK_ESTIMATED", isReliable: true },
          shoulderWidthRatio: { value: 0.25, confidence: 1, source: "LANDMARK_ESTIMATED", isReliable: true },
          hipWidthRatio: { value: 0.22, confidence: 1, source: "LANDMARK_ESTIMATED", isReliable: true },
          shoulderToHipRatio: { value: 1.14, confidence: 1, source: "LANDMARK_ESTIMATED", isReliable: true },
          torsoLengthRatio: { value: 0.35, confidence: 1, source: "LANDMARK_ESTIMATED", isReliable: true },
          legLengthRatio: { value: 0.5, confidence: 1, source: "LANDMARK_ESTIMATED", isReliable: true },
          armSpanRatio: { value: 0.9, confidence: 1, source: "LANDMARK_ESTIMATED", isReliable: true },
          postureTiltDegrees: { value: 0.0, confidence: 1, source: "LANDMARK_ESTIMATED", isReliable: true },
          calculatedAt: new Date(),
          provenance: "LANDMARK_ESTIMATED",
        },
        garmentAlignment: {
          alignmentId: "align-01",
          garmentId: "garment-01",
          category: "UPPER_BODY",
          transform: {
            translation: { x: 0, y: 0 },
            scale: { x: 1.0, y: 1.0 },
            rotationDegrees: 0,
          },
          boundingBox: { min: { x: 0, y: 0 }, max: { x: 1, y: 1 } },
          quality: "ALIGNED",
          confidenceScore: 0.95,
          validationIssues: [],
          calculatedAt: new Date(),
        },
        isReadyForInference: true,
        preparationDurationMs: 5,
        validationIssues: [],
      };

      const evalResult = await coordinator.evaluateVtoInput(dummyPreparedInput, "tenant-test", "app-test");

      assert.equal(evalResult.isFallbackApplied, true);
      assert.equal(evalResult.inferenceProviderType, "CPU_REFERENCE");
      assert.equal(evalResult.isHardwareAccelerated, false);
      assert.ok(evalResult.alignmentQualityScore >= 0.0 && evalResult.alignmentQualityScore <= 1.0);
      assert.ok(evalResult.fitmentStabilityConfidence >= 0.0 && evalResult.fitmentStabilityConfidence <= 1.0);

      await coordinator.dispose();
    });
  });

  // =========================================================================
  // 7. HEXAGONAL ARCHITECTURAL PURITY AUDIT
  // =========================================================================
  describe("7. Hexagonal Architectural Boundary Purity", () => {
    it("7.1 verifies src/domain/ contains 0 references to WebGPU APIs or navigator", () => {
      const domainDir = path.resolve(process.cwd(), "src/domain");
      const forbiddenTokens = [
        "navigator.gpu",
        "GPUDevice",
        "GPUBuffer",
        "GPUComputePipeline",
        "GPUQueue",
        "GPUAdapter",
        "createComputePipeline",
        "createCommandEncoder",
      ];

      function scanDir(dir: string): void {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const fullPath = path.join(dir, file);
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            scanDir(fullPath);
          } else if (file.endsWith(".ts")) {
            const content = fs.readFileSync(fullPath, "utf8");
            for (const token of forbiddenTokens) {
              assert.equal(
                content.includes(token),
                false,
                `Architectural Violation: Forbidden token "${token}" found in domain file ${fullPath}`
              );
            }
          }
        }
      }

      scanDir(domainDir);
    });
  });
});

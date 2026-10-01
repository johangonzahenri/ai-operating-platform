/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * Comprehensive Unit Test Suite for Phase 158:
 * WebWorker Asynchronous Off-Main-Thread Computer Vision & Pipeline Decoupling.
 * 
 * Verifies:
 * 1. Neutral Worker Protocol Envelopes & Fail-Closed Validation
 * 2. Worker Lifecycle State Machine (UNINITIALIZED, STARTING, READY, RUNNING, DRAINING, TERMINATED, FAILED)
 * 3. Asynchronous Execution of Off-Main-Thread Computer Vision & Neural Operations
 * 4. Concurrency, Correlation by RequestId & Out-of-Order Message Resolution
 * 5. Cancellation (AbortSignal) & Execution Timeouts
 * 6. Backpressure Limits & Queue Overload Protection
 * 7. In-Worker Dispatcher Security, Error Handlers & Boundary Isolation
 * 8. Hexagonal Boundary Purity: 0 WebWorker/Browser APIs in src/domain/
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  VTO_WORKER_PROTOCOL_VERSION,
  VtoWorkerRequest,
  VtoWorkerResponse,
  validateVtoWorkerRequest,
} from "../../src/domain/vto/worker-protocol.js";
import {
  WorkerLifecycleStatus,
  AsyncOffMainThreadExecutionPort,
} from "../../src/domain/vto/async-worker-port.js";
import {
  VtoWorkerRuntimeDispatcher,
} from "../../src/application/vto/worker-runtime-dispatcher.js";
import {
  SimulatedWebWorker,
} from "../../src/application/vto/simulated-web-worker.js";
import {
  WebWorkerVtoExecutionAdapter,
} from "../../src/application/vto/web-worker-vto-adapter.js";
import {
  PosePreprocessingPipeline,
  RawKeypoint,
} from "../../src/domain/vto/pose-preprocessing-pipeline.js";
import { ClothWarpingPipeline } from "../../src/domain/vto/cloth-warping-pipeline.js";
import { CpuMicroModelInferenceProvider } from "../../src/domain/vto/cpu-inference-provider.js";
import { CANONICAL_VTO_MICRO_MODEL_ID } from "../../src/domain/vto/canonical-micro-model.js";
import { Tensor } from "../../src/domain/vto/neural-tensor.js";

// Helper to create synthetic 17-keypoint COCO pose
function createSyntheticKeypoints(): RawKeypoint[] {
  const names = [
    "nose", "left_eye", "right_eye", "left_ear", "right_ear",
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_wrist", "right_wrist", "left_hip", "right_hip",
    "left_knee", "right_knee", "left_ankle", "right_ankle",
  ];
  return names.map((name, index) => ({
    name,
    x: 0.5 + (index % 4) * 0.05,
    y: 0.2 + Math.floor(index / 4) * 0.15,
    confidence: 0.95,
  }));
}

describe("Phase 158: WebWorker Asynchronous Off-Main-Thread Computer Vision Pipeline", () => {

  // =========================================================================
  // 1. NEUTRAL PROTOCOL ENVELOPES & FAIL-CLOSED VALIDATION
  // =========================================================================
  describe("1. Neutral Worker Protocol Envelopes & Fail-Closed Validation", () => {
    it("1.1 validates a structurally sound VtoWorkerRequest envelope", () => {
      const validReq: VtoWorkerRequest = {
        protocolVersion: VTO_WORKER_PROTOCOL_VERSION,
        requestId: "req-001",
        operation: "POSE_PREPROCESS",
        payload: {
          keypoints: createSyntheticKeypoints(),
          imageWidth: 640,
          imageHeight: 480,
          timestampMs: 1000,
        },
        timeoutMs: 5000,
      };

      const result = validateVtoWorkerRequest(validReq);
      assert.equal(result.valid, true);
      assert.equal(result.error, undefined);
    });

    it("1.2 fails closed when envelope is missing requestId or operation", () => {
      const invalidReq1 = {
        protocolVersion: VTO_WORKER_PROTOCOL_VERSION,
        operation: "POSE_PREPROCESS",
        payload: {},
      };
      const res1 = validateVtoWorkerRequest(invalidReq1);
      assert.equal(res1.valid, false);
      assert.equal(res1.errorCode, "INVALID_ENVELOPE");

      const invalidReq2 = {
        protocolVersion: VTO_WORKER_PROTOCOL_VERSION,
        requestId: "req-002",
        payload: {},
      };
      const res2 = validateVtoWorkerRequest(invalidReq2);
      assert.equal(res2.valid, false);
      assert.equal(res2.errorCode, "INVALID_ENVELOPE");
    });

    it("1.3 rejects request with unsupported protocol version", () => {
      const invalidReq = {
        protocolVersion: "99.0.0",
        requestId: "req-003",
        operation: "POSE_PREPROCESS",
        payload: {},
      };
      const res = validateVtoWorkerRequest(invalidReq);
      assert.equal(res.valid, false);
      assert.equal(res.errorCode, "UNSUPPORTED_PROTOCOL_VERSION");
      assert.ok(res.error?.message.includes("Unsupported protocol version"));
    });

    it("1.4 rejects request with unknown operation", () => {
      const invalidReq = {
        protocolVersion: VTO_WORKER_PROTOCOL_VERSION,
        requestId: "req-004",
        operation: "UNKNOWN_MALICIOUS_OP",
        payload: {},
      };
      const res = validateVtoWorkerRequest(invalidReq);
      assert.equal(res.valid, false);
      assert.equal(res.errorCode, "UNKNOWN_OPERATION");
      assert.ok(res.error?.message.includes("Unknown operation"));
    });

    it("1.5 rejects non-object or null request", () => {
      assert.equal(validateVtoWorkerRequest(null).valid, false);
      assert.equal(validateVtoWorkerRequest("string").valid, false);
      assert.equal(validateVtoWorkerRequest(undefined).valid, false);
    });
  });

  // =========================================================================
  // 2. WORKER LIFECYCLE STATE MACHINE
  // =========================================================================
  describe("2. Worker Lifecycle State Machine", () => {
    it("2.1 transitions through UNINITIALIZED -> READY -> TERMINATED upon lifecycle progression", async () => {
      const worker = new SimulatedWebWorker();
      const adapter = new WebWorkerVtoExecutionAdapter({
        workerInstance: worker,
      });

      assert.equal(adapter.status, "UNINITIALIZED");

      await adapter.initialize();
      assert.equal(adapter.status, "READY");

      await adapter.terminate();
      assert.equal(adapter.status, "TERMINATED");
    });

    it("2.2 prevents double initialization and returns cleanly if already READY", async () => {
      const worker = new SimulatedWebWorker();
      const adapter = new WebWorkerVtoExecutionAdapter({
        workerInstance: worker,
      });

      await adapter.initialize();
      assert.equal(adapter.status, "READY");

      // Second init should be idempotent
      await adapter.initialize();
      assert.equal(adapter.status, "READY");

      await adapter.terminate();
    });

    it("2.3 transitions to DRAINING then TERMINATED when gracefully drained", async () => {
      const worker = new SimulatedWebWorker({ simulatedDelayMs: 30 });
      const adapter = new WebWorkerVtoExecutionAdapter({
        workerInstance: worker,
      });
      await adapter.initialize();

      // Launch an async task
      const taskPromise = adapter.execute({
        protocolVersion: VTO_WORKER_PROTOCOL_VERSION,
        requestId: "drain-task-1",
        operation: "POSE_PREPROCESS",
        payload: {
          keypoints: createSyntheticKeypoints(),
          imageWidth: 640,
          imageHeight: 480,
          timestampMs: 1000,
        },
      });

      // Request drain
      const drainPromise = adapter.drain();
      assert.equal(adapter.status, "DRAINING");

      // While draining, new tasks are rejected
      await assert.rejects(
        adapter.execute({
          protocolVersion: VTO_WORKER_PROTOCOL_VERSION,
          requestId: "drain-task-2",
          operation: "POSE_PREPROCESS",
          payload: {
            keypoints: createSyntheticKeypoints(),
            imageWidth: 640,
            imageHeight: 480,
            timestampMs: 1000,
          },
        }),
        /Adapter is draining/
      );

      const [res] = await Promise.all([taskPromise, drainPromise]);
      assert.equal(res.status, "SUCCESS");
      assert.equal(adapter.status, "TERMINATED");
    });

    it("2.4 marks lifecycle as FAILED and rejects pending tasks if worker triggers an unrecoverable error", async () => {
      const worker = new SimulatedWebWorker({ simulatedDelayMs: 100 });
      const adapter = new WebWorkerVtoExecutionAdapter({
        workerInstance: worker,
      });
      await adapter.initialize();

      const taskPromise = adapter.execute({
        protocolVersion: VTO_WORKER_PROTOCOL_VERSION,
        requestId: "crash-task-1",
        operation: "POSE_PREPROCESS",
        payload: {
          keypoints: createSyntheticKeypoints(),
          imageWidth: 640,
          imageHeight: 480,
          timestampMs: 1000,
        },
      });

      // Simulate worker failure event
      worker.simulateError(new Error("Worker out-of-memory fatal crash"));

      await assert.rejects(taskPromise, /Worker error: Worker out-of-memory fatal crash/);
      assert.equal(adapter.status, "FAILED");

      // Subsequent execution rejected due to FAILED status
      await assert.rejects(
        adapter.execute({
          protocolVersion: VTO_WORKER_PROTOCOL_VERSION,
          requestId: "crash-task-2",
          operation: "POSE_PREPROCESS",
          payload: {
            keypoints: createSyntheticKeypoints(),
            imageWidth: 640,
            imageHeight: 480,
            timestampMs: 1000,
          },
        }),
        /Adapter is in FAILED state/
      );

      await adapter.terminate();
    });
  });

  // =========================================================================
  // 3. ASYNCHRONOUS OPERATIONS EXECUTION
  // =========================================================================
  describe("3. Asynchronous Execution of Computer Vision & Neural Operations", () => {
    it("3.1 executes POSE_PREPROCESS off-main-thread with real simulated worker", async () => {
      const worker = new SimulatedWebWorker();
      const adapter = new WebWorkerVtoExecutionAdapter({
        workerInstance: worker,
      });
      await adapter.initialize();

      const response = await adapter.execute({
        protocolVersion: VTO_WORKER_PROTOCOL_VERSION,
        requestId: "pose-op-1",
        operation: "POSE_PREPROCESS",
        payload: {
          keypoints: createSyntheticKeypoints(),
          imageWidth: 640,
          imageHeight: 480,
          timestampMs: 1000,
        },
      });

      assert.equal(response.status, "SUCCESS");
      assert.equal(response.requestId, "pose-op-1");
      assert.equal(response.operation, "POSE_PREPROCESS");
      assert.ok(response.payload);
      assert.ok(response.payload.confidenceScore > 0);
      assert.ok(response.metrics.workerExecutionMs >= 0);
      assert.ok(response.metrics.roundTripLatencyMs >= 0);
      assert.ok(response.metrics.serializedPayloadBytes > 0);

      await adapter.terminate();
    });

    it("3.2 executes GARMENT_WARP off-main-thread", async () => {
      const worker = new SimulatedWebWorker();
      const adapter = new WebWorkerVtoExecutionAdapter({
        workerInstance: worker,
      });
      await adapter.initialize();

      const response = await adapter.execute({
        protocolVersion: VTO_WORKER_PROTOCOL_VERSION,
        requestId: "warp-op-1",
        operation: "GARMENT_WARP",
        payload: {
          garmentPixels: [255, 0, 0, 255, 0, 255, 0, 255],
          sourceWidth: 2,
          sourceHeight: 1,
          targetWidth: 2,
          targetHeight: 1,
          warpFieldDx: [0.1, -0.1],
          warpFieldDy: [0.0, 0.0],
          warpFieldConf: [1.0, 1.0],
        },
      });

      assert.equal(response.status, "SUCCESS");
      assert.equal(response.requestId, "warp-op-1");
      assert.equal(response.operation, "GARMENT_WARP");
      assert.ok(response.payload);
      assert.equal(response.payload.warpedPixels.length, 8);
      assert.equal(response.payload.targetWidth, 2);
      assert.equal(response.payload.targetHeight, 1);

      await adapter.terminate();
    });

    it("3.3 executes NEURAL_INFERENCE off-main-thread with CPU provider inside worker", async () => {
      const worker = new SimulatedWebWorker();
      const adapter = new WebWorkerVtoExecutionAdapter({
        workerInstance: worker,
      });
      await adapter.initialize();

      const inputValues = new Array(32).fill(0).map((_, i) => (i + 1) * 0.05);

      const response = await adapter.execute({
        protocolVersion: VTO_WORKER_PROTOCOL_VERSION,
        requestId: "infer-op-1",
        operation: "NEURAL_INFERENCE",
        payload: {
          modelId: CANONICAL_VTO_MICRO_MODEL_ID,
          modelVersion: "1.0.0",
          inputTensor: {
            shape: [1, 32],
            dataType: "FLOAT32",
            data: inputValues,
          },
        },
      });

      assert.equal(response.status, "SUCCESS");
      assert.equal(response.requestId, "infer-op-1");
      assert.equal(response.operation, "NEURAL_INFERENCE");
      assert.ok(response.payload);
      assert.deepEqual(response.payload.outputTensor.shape, [1, 16]);
      assert.equal(response.payload.outputTensor.data.length, 16);
      assert.equal(response.payload.backend, "CPU_IN_WORKER");

      await adapter.terminate();
    });
  });

  // =========================================================================
  // 4. CONCURRENCY, OUT-OF-ORDER CORRELATION & BACKPRESSURE
  // =========================================================================
  describe("4. Concurrency, Correlation by RequestId & Backpressure", () => {
    it("4.1 correlates concurrent requests executed out-of-order by requestId", async () => {
      const worker = new SimulatedWebWorker({ simulatedDelayMs: 20 });
      const adapter = new WebWorkerVtoExecutionAdapter({
        workerInstance: worker,
        maxConcurrentTasks: 10,
      });
      await adapter.initialize();

      const taskIds = ["task-A", "task-B", "task-C", "task-D", "task-E"];
      const promises = taskIds.map((id, index) =>
        adapter.execute({
          protocolVersion: VTO_WORKER_PROTOCOL_VERSION,
          requestId: id,
          operation: "POSE_PREPROCESS",
          payload: {
            keypoints: createSyntheticKeypoints(),
            imageWidth: 640 + index * 10,
            imageHeight: 480 + index * 10,
            timestampMs: 1000 + index * 100,
          },
        })
      );

      const responses = await Promise.all(promises);
      assert.equal(responses.length, 5);

      // Verify strict 1:1 correlation
      taskIds.forEach((id, index) => {
        const matching = responses.find((r) => r.requestId === id);
        assert.ok(matching, `Expected response for ${id}`);
        assert.equal(matching.status, "SUCCESS");
      });

      const stats = adapter.getStats();
      assert.equal(stats.totalDispatched, 5);
      assert.equal(stats.totalCompleted, 5);
      assert.equal(stats.totalFailed, 0);
      assert.equal(stats.activeTasks, 0);
      assert.ok(stats.peakConcurrentTasks >= 1);

      await adapter.terminate();
    });

    it("4.2 rejects requests when backpressure maxQueueSize is exceeded", async () => {
      const worker = new SimulatedWebWorker({ simulatedDelayMs: 100 });
      const adapter = new WebWorkerVtoExecutionAdapter({
        workerInstance: worker,
        maxConcurrentTasks: 1,
        maxQueueSize: 2,
      });
      await adapter.initialize();

      // Launch 1 task (active) + 2 tasks (queued up to maxQueueSize = 2)
      const t1 = adapter.execute({
        protocolVersion: VTO_WORKER_PROTOCOL_VERSION,
        requestId: "q-1",
        operation: "POSE_PREPROCESS",
        payload: { keypoints: createSyntheticKeypoints(), imageWidth: 640, imageHeight: 480, timestampMs: 1000 },
      });
      const t2 = adapter.execute({
        protocolVersion: VTO_WORKER_PROTOCOL_VERSION,
        requestId: "q-2",
        operation: "POSE_PREPROCESS",
        payload: { keypoints: createSyntheticKeypoints(), imageWidth: 640, imageHeight: 480, timestampMs: 1000 },
      });
      const t3 = adapter.execute({
        protocolVersion: VTO_WORKER_PROTOCOL_VERSION,
        requestId: "q-3",
        operation: "POSE_PREPROCESS",
        payload: { keypoints: createSyntheticKeypoints(), imageWidth: 640, imageHeight: 480, timestampMs: 1000 },
      });

      // 4th task exceeds queue size of 2 -> should reject immediately with backpressure error
      await assert.rejects(
        adapter.execute({
          protocolVersion: VTO_WORKER_PROTOCOL_VERSION,
          requestId: "q-4",
          operation: "POSE_PREPROCESS",
          payload: { keypoints: createSyntheticKeypoints(), imageWidth: 640, imageHeight: 480, timestampMs: 1000 },
        }),
        /Backpressure limit exceeded: pending queue size 2 reached maximum 2/
      );

      await Promise.all([t1, t2, t3]);
      await adapter.terminate();
    });
  });

  // =========================================================================
  // 5. CANCELLATION & TIMEOUTS
  // =========================================================================
  describe("5. Cancellation & Execution Timeouts", () => {
    it("5.1 times out when task exceeds timeoutMs", async () => {
      const worker = new SimulatedWebWorker({ simulatedDelayMs: 150 });
      const adapter = new WebWorkerVtoExecutionAdapter({
        workerInstance: worker,
        taskTimeoutMs: 50, // 50ms timeout < 150ms worker delay
      });
      await adapter.initialize();

      await assert.rejects(
        adapter.execute({
          protocolVersion: VTO_WORKER_PROTOCOL_VERSION,
          requestId: "timeout-task",
          operation: "POSE_PREPROCESS",
          payload: {
            keypoints: createSyntheticKeypoints(),
            imageWidth: 640,
            imageHeight: 480,
            timestampMs: 1000,
          },
          timeoutMs: 50,
        }),
        /Task timeout-task timed out after 50ms/
      );

      const stats = adapter.getStats();
      assert.equal(stats.totalFailed, 1);

      await adapter.terminate();
    });

    it("5.2 aborts and rejects when AbortSignal triggers cancellation", async () => {
      const worker = new SimulatedWebWorker({ simulatedDelayMs: 200 });
      const adapter = new WebWorkerVtoExecutionAdapter({
        workerInstance: worker,
      });
      await adapter.initialize();

      const controller = new AbortController();

      const taskPromise = adapter.execute(
        {
          protocolVersion: VTO_WORKER_PROTOCOL_VERSION,
          requestId: "abort-task",
          operation: "POSE_PREPROCESS",
          payload: {
            keypoints: createSyntheticKeypoints(),
            imageWidth: 640,
            imageHeight: 480,
            timestampMs: 1000,
          },
        },
        controller.signal
      );

      // Abort after 20ms
      setTimeout(() => controller.abort(), 20);

      await assert.rejects(taskPromise, /Task abort-task was aborted/);

      const stats = adapter.getStats();
      assert.equal(stats.totalCancelled, 1);

      await adapter.terminate();
    });

    it("5.3 rejects immediately if AbortSignal is already aborted", async () => {
      const worker = new SimulatedWebWorker();
      const adapter = new WebWorkerVtoExecutionAdapter({
        workerInstance: worker,
      });
      await adapter.initialize();

      const controller = new AbortController();
      controller.abort();

      await assert.rejects(
        adapter.execute(
          {
            protocolVersion: VTO_WORKER_PROTOCOL_VERSION,
            requestId: "pre-aborted-task",
            operation: "POSE_PREPROCESS",
            payload: {
              keypoints: createSyntheticKeypoints(),
              imageWidth: 640,
              imageHeight: 480,
              timestampMs: 1000,
            },
          },
          controller.signal
        ),
        /Task pre-aborted-task was already aborted/
      );

      await adapter.terminate();
    });
  });

  // =========================================================================
  // 6. IN-WORKER DISPATCHER SECURITY & SANDBOX PURITY
  // =========================================================================
  describe("6. In-Worker Dispatcher Security, Error Handlers & Boundary Isolation", () => {
    it("6.1 rejects unknown operations gracefully with UNKNOWN_OPERATION error code", async () => {
      const dispatcher = new VtoWorkerRuntimeDispatcher();
      const response = await dispatcher.dispatch({
        protocolVersion: VTO_WORKER_PROTOCOL_VERSION,
        requestId: "sec-op-1",
        operation: "MALICIOUS_EXEC" as any,
        payload: { command: "eval('malicious')" },
      });

      assert.equal(response.status, "ERROR");
      assert.equal(response.requestId, "sec-op-1");
      assert.ok(response.error);
      assert.equal(response.error.code, "UNKNOWN_OPERATION");
      assert.ok(response.error.message.includes("MALICIOUS_EXEC"));
    });

    it("6.2 handles malformed payload without uncaught exceptions", async () => {
      const dispatcher = new VtoWorkerRuntimeDispatcher();
      const response = await dispatcher.dispatch({
        protocolVersion: VTO_WORKER_PROTOCOL_VERSION,
        requestId: "sec-op-2",
        operation: "POSE_PREPROCESS",
        payload: { invalidKeypoints: "not-an-array" },
      });

      assert.equal(response.status, "ERROR");
      assert.equal(response.requestId, "sec-op-2");
      assert.ok(response.error);
      assert.equal(response.error.code, "INVALID_PAYLOAD");
    });

    it("6.3 confirms WorkerRuntimeDispatcher source has ZERO eval or new Function", () => {
      const dispatcherPath = path.resolve(
        process.cwd(),
        "src/application/vto/worker-runtime-dispatcher.ts"
      );
      const content = fs.readFileSync(dispatcherPath, "utf-8");

      assert.equal(content.includes("eval("), false, "WorkerRuntimeDispatcher must not contain eval()");
      assert.equal(content.includes("new Function("), false, "WorkerRuntimeDispatcher must not contain new Function()");
    });
  });

  // =========================================================================
  // 7. HEXAGONAL ARCHITECTURAL BOUNDARY PURITY
  // =========================================================================
  describe("7. Hexagonal Architectural Boundary Purity", () => {
    it("7.1 verifies src/domain/vto/ contains ZERO references to browser Worker APIs", () => {
      const domainDir = path.resolve(process.cwd(), "src/domain/vto");
      const files = fs.readdirSync(domainDir).filter((f) => f.endsWith(".ts"));

      const forbiddenSymbols = [
        "new Worker(",
        "postMessage(",
        "navigator.",
        "window.",
        "document.",
        "GPUDevice",
        "GPUBuffer",
        "importScripts(",
      ];

      for (const file of files) {
        const fullPath = path.join(domainDir, file);
        const content = fs.readFileSync(fullPath, "utf-8");

        for (const symbol of forbiddenSymbols) {
          const hasForbidden = content.includes(symbol);
          assert.equal(
            hasForbidden,
            false,
            `Forbidden symbol '${symbol}' found in domain file: ${file}`
          );
        }
      }
    });

    it("7.2 verifies Worker execution port is an abstract neutral contract", () => {
      const portPath = path.resolve(
        process.cwd(),
        "src/domain/vto/async-worker-port.ts"
      );
      const content = fs.readFileSync(portPath, "utf-8");

      // Port must only export interfaces/types
      assert.ok(content.includes("export interface AsyncOffMainThreadExecutionPort"));
      assert.ok(content.includes("export type WorkerLifecycleStatus"));
      assert.equal(content.includes("class WebWorker"), false);
      assert.equal(content.includes("new Worker("), false);
    });
  });
});

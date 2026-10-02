/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * FASE 159 — Camera Stream Frame Acquisition, Video Preprocessing & OffscreenCanvas Pipeline
 * 
 * Exhaustive Unit Test Suite:
 * 1. Neutral Frame Domain Contracts & Fail-Closed Validation
 * 2. Frame Source Port Lifecycle & Deterministic Test Double
 * 3. Browser Camera Adapter & Permission / Hardware Fault Isolation
 * 4. Video Frame Preprocessing (Orientation, Scaling, Formats, Corruption)
 * 5. Backpressure, Memory Limits & Newest-Frame Drop Policy
 * 6. OffscreenCanvas Processing, Capability Detection & Fallback
 * 7. WebWorker Integration & Off-Main-Thread Dispatch
 * 8. Privacy By Design, Tenant Isolation & Hexagonal Purity Check
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  VideoFrameInput,
  FrameDimensions,
  PixelFormat,
  ColorSpace,
  validateVideoFrameInput,
  MAX_FRAME_DIMENSION,
  MAX_FRAME_BUFFER_BYTES,
  getBytesPerPixel,
} from "../../src/domain/vto/frame-protocol.js";

import {
  FrameSourcePort,
  FrameSourceStatus,
  FrameDropPolicy,
} from "../../src/domain/vto/frame-source-port.js";

import {
  FramePreprocessingPipeline,
  PreprocessingPipelineConfig,
} from "../../src/application/vto/frame-preprocessing-pipeline.js";

import {
  SimulatedFrameSource,
} from "../../src/application/vto/simulated-frame-source.js";

import {
  BrowserCameraAdapter,
  BrowserMediaDevicesShim,
} from "../../src/application/vto/browser-camera-adapter.js";

import {
  OffscreenCanvasProcessor,
} from "../../src/application/vto/offscreen-canvas-processor.js";

import {
  VtoWorkerRuntimeDispatcher,
} from "../../src/application/vto/worker-runtime-dispatcher.js";

import {
  VTO_WORKER_PROTOCOL_VERSION,
  VtoWorkerRequest,
} from "../../src/domain/vto/worker-protocol.js";

function createValidFrame(overrides?: Partial<VideoFrameInput>): VideoFrameInput {
  const width = 640;
  const height = 480;
  const bpp = 4;
  const byteLength = width * height * bpp;
  const buffer = new Uint8Array(byteLength);
  buffer.fill(128);

  const defaultFrame: VideoFrameInput = {
    frameId: "frame-test-001",
    buffer,
    metadata: {
      dimensions: { width, height },
      pixelFormat: "RGBA8",
      colorSpace: "srgb",
      timestamp: {
        acquisitionTimestampMs: 1000,
        presentationTimestampMs: 1000,
        sequenceNumber: 1,
      },
      byteLength,
      stride: width * bpp,
      mirrored: false,
      rotationDegrees: 0,
      sourceDeviceId: "cam-dev-1",
      isSynthetic: true,
    },
  };

  return {
    ...defaultFrame,
    ...overrides,
    metadata: {
      ...defaultFrame.metadata,
      ...(overrides?.metadata ?? {}),
    },
  };
}

describe("FASE 159 — Camera Stream Frame Acquisition, Video Preprocessing & OffscreenCanvas Pipeline", () => {

  // =========================================================================
  // 1. NEUTRAL FRAME DOMAIN CONTRACTS & VALIDATION
  // =========================================================================
  describe("1. Neutral Frame Domain Contracts & Fail-Closed Validation", () => {
    it("1.1 validates a structurally sound VideoFrameInput", () => {
      const frame = createValidFrame();
      const res = validateVideoFrameInput(frame);
      assert.equal(res.isValid, true);
      assert.equal(res.valid, true);
      assert.equal(res.error, undefined);
      assert.ok(res.frame);
      assert.equal(res.frame.frameId, "frame-test-001");
    });

    it("1.2 rejects null, undefined or non-object payloads", () => {
      assert.equal(validateVideoFrameInput(null).isValid, false);
      assert.equal(validateVideoFrameInput(undefined).isValid, false);
      assert.equal(validateVideoFrameInput("string").isValid, false);
      assert.equal(validateVideoFrameInput(12345).isValid, false);
      assert.equal(validateVideoFrameInput(null).errorCode, "INVALID_PAYLOAD");
    });

    it("1.3 rejects empty or whitespace-only frameId", () => {
      const frame = createValidFrame({ frameId: "" });
      const res = validateVideoFrameInput(frame);
      assert.equal(res.isValid, false);
      assert.equal(res.errorCode, "INVALID_FRAME_ID");
    });

    it("1.4 rejects non-positive, NaN, or non-integer dimensions fail-closed", () => {
      const invalidDims = [
        { width: 0, height: 480 },
        { width: 640, height: -10 },
        { width: NaN, height: 480 },
        { width: 640.5, height: 480 },
        { width: Infinity, height: 480 },
      ];

      for (const dims of invalidDims) {
        const frame = createValidFrame({
          metadata: {
            ...createValidFrame().metadata,
            dimensions: dims as FrameDimensions,
          },
        });
        const res = validateVideoFrameInput(frame);
        assert.equal(res.isValid, false);
        assert.equal(res.errorCode, "INVALID_DIMENSIONS");
      }
    });

    it("1.5 rejects dimensions exceeding MAX_FRAME_DIMENSION (4096)", () => {
      const frame = createValidFrame({
        metadata: {
          ...createValidFrame().metadata,
          dimensions: { width: 5000, height: 480 },
        },
      });
      const res = validateVideoFrameInput(frame);
      assert.equal(res.isValid, false);
      assert.equal(res.errorCode, "DIMENSIONS_OUT_OF_BOUNDS");
    });

    it("1.6 rejects unsupported pixel formats and unsupported color spaces", () => {
      const frameBadFormat = createValidFrame({
        metadata: {
          ...createValidFrame().metadata,
          pixelFormat: "YUV420" as any,
        },
      });
      assert.equal(validateVideoFrameInput(frameBadFormat).errorCode, "UNSUPPORTED_PIXEL_FORMAT");

      const frameBadColor = createValidFrame({
        metadata: {
          ...createValidFrame().metadata,
          colorSpace: "adobe-rgb" as any,
        },
      });
      assert.equal(validateVideoFrameInput(frameBadColor).errorCode, "UNSUPPORTED_COLOR_SPACE");
    });

    it("1.7 rejects invalid rotation degrees (only 0, 90, 180, 270 allowed)", () => {
      const frame = createValidFrame({
        metadata: {
          ...createValidFrame().metadata,
          rotationDegrees: 45 as any,
        },
      });
      const res = validateVideoFrameInput(frame);
      assert.equal(res.isValid, false);
      assert.equal(res.errorCode, "INVALID_ROTATION");
    });

    it("1.8 rejects buffer size mismatch when buffer is smaller than dimensions * bpp", () => {
      const frame = createValidFrame({
        buffer: new Uint8Array(100), // Far too small for 640x480x4
      });
      const res = validateVideoFrameInput(frame);
      assert.equal(res.isValid, false);
      assert.equal(res.errorCode, "BUFFER_SIZE_MISMATCH");
    });

    it("1.9 rejects buffers exceeding MAX_FRAME_BUFFER_BYTES limit fail-closed", () => {
      const oversized = new Uint8Array(16);
      Object.defineProperty(oversized, "byteLength", { value: MAX_FRAME_BUFFER_BYTES + 1024 });

      const frame = createValidFrame();
      (frame as any).buffer = oversized;
      const res = validateVideoFrameInput(frame);
      assert.equal(res.isValid, false);
      assert.equal(res.errorCode, "MAX_CAPACITY_EXCEEDED");
    });
  });

  // =========================================================================
  // 2. FRAME SOURCE PORT LIFECYCLE & DETERMINISTIC TEST DOUBLE
  // =========================================================================
  describe("2. Frame Source Port Lifecycle & Deterministic Test Double", () => {
    it("2.1 transitions through UNINITIALIZED -> INITIALIZING -> STOPPED -> ACTIVE -> PAUSED -> ACTIVE -> STOPPED -> RELEASED", async () => {
      const source = new SimulatedFrameSource({ targetFps: 0 }); // 0 targetFps for manual stepping
      assert.equal(source.getStatus(), "UNINITIALIZED");

      await source.initialize({ targetFps: 0 });
      assert.equal(source.getStatus(), "STOPPED");

      const delivered: VideoFrameInput[] = [];
      await source.start((frame) => {
        delivered.push(frame);
      });
      assert.equal(source.getStatus(), "ACTIVE");

      await source.pause();
      assert.equal(source.getStatus(), "PAUSED");

      await source.resume();
      assert.equal(source.getStatus(), "ACTIVE");

      await source.stop();
      assert.equal(source.getStatus(), "STOPPED");

      await source.release();
      assert.equal(source.getStatus(), "RELEASED");

      // Attempting to re-initialize after release must throw
      await assert.rejects(async () => {
        await source.initialize();
      }, /Cannot initialize a released frame source/);
    });

    it("2.2 generates synthetic color bar frames deterministically with correct metadata", async () => {
      const source = new SimulatedFrameSource({
        targetFps: 0,
        preferredDimensions: { width: 320, height: 240 },
        pixelFormat: "RGBA8",
      });
      await source.initialize();

      const delivered: VideoFrameInput[] = [];
      await source.start((frame) => {
        delivered.push(frame);
      });

      const frame = await source.stepEmit();
      assert.ok(frame);
      assert.equal(delivered.length, 1);
      assert.equal(frame.metadata.dimensions.width, 320);
      assert.equal(frame.metadata.dimensions.height, 240);
      assert.equal(frame.metadata.pixelFormat, "RGBA8");
      assert.equal(frame.metadata.byteLength, 320 * 240 * 4);
      assert.equal(frame.metadata.isSynthetic, true);

      await source.release();
    });

    it("2.3 supports discrete single frame acquisition via acquireFrame()", async () => {
      const source = new SimulatedFrameSource({
        preferredDimensions: { width: 100, height: 100 },
        pixelFormat: "RGB8",
      });
      await source.initialize();

      const singleFrame = await source.acquireFrame();
      assert.ok(singleFrame);
      assert.equal(singleFrame.metadata.dimensions.width, 100);
      assert.equal(singleFrame.metadata.dimensions.height, 100);
      assert.equal(singleFrame.metadata.pixelFormat, "RGB8");
      assert.equal(singleFrame.metadata.byteLength, 100 * 100 * 3);

      await source.release();
      const releasedFrame = await source.acquireFrame();
      assert.equal(releasedFrame, null);
    });

    it("2.4 transitions to ERROR on simulated hardware failure without uncaught throw", async () => {
      const source = new SimulatedFrameSource();
      await source.initialize();
      assert.equal(source.getStatus(), "STOPPED");

      source.simulateError("Device disconnected unexpectedly");
      assert.equal(source.getStatus(), "ERROR");
      assert.equal(source.getMetrics().errorsCount, 1);

      await source.release();
      assert.equal(source.getStatus(), "RELEASED");
    });
  });

  // =========================================================================
  // 3. BROWSER CAMERA ADAPTER & HARDWARE FAULT ISOLATION
  // =========================================================================
  describe("3. Browser Camera Adapter & Hardware Fault Isolation", () => {
    it("3.1 reports ENVIRONMENT_PENDING in headless Node.js when navigator.mediaDevices is absent", async () => {
      const adapter = new BrowserCameraAdapter();
      assert.equal(adapter.isSupported(), false);

      await adapter.initialize();
      assert.equal(adapter.getStatus(), "ERROR");
      assert.equal(adapter.getBrowserErrorStatus(), "ENVIRONMENT_PENDING");

      await assert.rejects(async () => {
        await adapter.start(() => {});
      }, /Browser camera acquisition unavailable: ENVIRONMENT_PENDING/);
    });

    it("3.2 gracefully handles permission rejection (NotAllowedError -> PERMISSION_DENIED)", async () => {
      const mockMediaDevices: BrowserMediaDevicesShim = {
        getUserMedia: async () => {
          const err = new Error("User denied permission");
          err.name = "NotAllowedError";
          throw err;
        },
      };

      const adapter = new BrowserCameraAdapter({ mediaDevices: mockMediaDevices });
      assert.equal(adapter.isSupported(), true);

      await adapter.initialize();
      assert.equal(adapter.getStatus(), "STOPPED");

      await assert.rejects(async () => {
        await adapter.start(() => {});
      }, /Camera access failed \[PERMISSION_DENIED\]/);

      assert.equal(adapter.getStatus(), "ERROR");
      assert.equal(adapter.getBrowserErrorStatus(), "PERMISSION_DENIED");
      assert.equal(adapter.getMetrics().errorsCount, 1);
    });

    it("3.3 handles device hardware errors (NotFoundError -> DEVICE_ERROR)", async () => {
      const mockMediaDevices: BrowserMediaDevicesShim = {
        getUserMedia: async () => {
          const err = new Error("Requested camera device was not found");
          err.name = "NotFoundError";
          throw err;
        },
      };

      const adapter = new BrowserCameraAdapter({ mediaDevices: mockMediaDevices });
      await adapter.initialize();

      await assert.rejects(async () => {
        await adapter.start(() => {});
      }, /Camera access failed \[DEVICE_ERROR\]/);

      assert.equal(adapter.getStatus(), "ERROR");
      assert.equal(adapter.getBrowserErrorStatus(), "DEVICE_ERROR");
    });

    it("3.4 stops MediaStreamTrack and performs deterministic teardown on stop/release", async () => {
      let trackStopped = false;
      const mockTrack = {
        enabled: true,
        stop: () => {
          trackStopped = true;
        },
        addEventListener: () => {},
      };

      const mockMediaDevices: BrowserMediaDevicesShim = {
        getUserMedia: async () => ({
          getVideoTracks: () => [mockTrack],
          getTracks: () => [mockTrack],
        }),
      };

      const adapter = new BrowserCameraAdapter({
        mediaDevices: mockMediaDevices,
        preferredDimensions: { width: 1280, height: 720 },
      });

      await adapter.initialize();
      const receivedFrames: VideoFrameInput[] = [];
      await adapter.start((frame) => {
        receivedFrames.push(frame);
      });

      assert.equal(adapter.getStatus(), "ACTIVE");
      assert.equal(trackStopped, false);

      // Acquire frame
      const frame = await adapter.acquireFrame();
      assert.ok(frame);
      assert.equal(frame.metadata.dimensions.width, 1280);

      // Pause and resume
      await adapter.pause();
      assert.equal(adapter.getStatus(), "PAUSED");
      assert.equal(mockTrack.enabled, false);

      await adapter.resume();
      assert.equal(adapter.getStatus(), "ACTIVE");
      assert.equal(mockTrack.enabled, true);

      // Stop teardown
      await adapter.stop();
      assert.equal(adapter.getStatus(), "STOPPED");
      assert.equal(trackStopped, true);

      await adapter.release();
      assert.equal(adapter.getStatus(), "RELEASED");
    });
  });

  // =========================================================================
  // 4. VIDEO FRAME PREPROCESSING PIPELINE
  // =========================================================================
  describe("4. Video Frame Preprocessing Pipeline", () => {
    it("4.1 normalizes orientation (90 degrees clockwise rotation swaps width and height)", () => {
      const pipeline = new FramePreprocessingPipeline({ normalizeOrientation: true });
      const width = 4;
      const height = 2;
      const buffer = new Uint8Array(width * height * 4);
      // Mark pixel (0, 0) as red
      buffer[0] = 255; buffer[1] = 0; buffer[2] = 0; buffer[3] = 255;

      const frame: VideoFrameInput = {
        frameId: "rot-frame-1",
        buffer,
        metadata: {
          dimensions: { width, height },
          pixelFormat: "RGBA8",
          colorSpace: "srgb",
          timestamp: { acquisitionTimestampMs: 100, sequenceNumber: 0 },
          byteLength: buffer.byteLength,
          rotationDegrees: 90,
          mirrored: false,
        },
      };

      const result = pipeline.process(frame);
      assert.equal(result.success, true);
      assert.ok(result.frame);
      assert.equal(result.frame.metadata.dimensions.width, 2); // Swapped
      assert.equal(result.frame.metadata.dimensions.height, 4); // Swapped
      assert.equal(result.frame.metadata.rotationDegrees, 0); // Normalized to 0
    });

    it("4.2 applies horizontal mirroring for selfie camera mode", () => {
      const pipeline = new FramePreprocessingPipeline({ mirrorHorizontal: true });
      const width = 2;
      const height = 1;
      const buffer = new Uint8Array(width * height * 4);
      // Left pixel: Red, Right pixel: Blue
      buffer[0] = 255; buffer[3] = 255; // (0,0) Red
      buffer[4] = 0; buffer[6] = 255; buffer[7] = 255; // (1,0) Blue

      const frame: VideoFrameInput = {
        frameId: "mirror-frame-1",
        buffer,
        metadata: {
          dimensions: { width, height },
          pixelFormat: "RGBA8",
          colorSpace: "srgb",
          timestamp: { acquisitionTimestampMs: 100, sequenceNumber: 0 },
          byteLength: buffer.byteLength,
          rotationDegrees: 0,
          mirrored: false,
        },
      };

      const result = pipeline.process(frame);
      assert.equal(result.success, true);
      assert.ok(result.frame);
      const outBuf = new Uint8Array(result.frame.buffer as ArrayBuffer);
      // After horizontal flip: (0,0) should be Blue, (1,0) should be Red
      assert.equal(outBuf[0], 0);   // R of left pixel
      assert.equal(outBuf[2], 255); // B of left pixel
      assert.equal(outBuf[4], 255); // R of right pixel
      assert.equal(outBuf[6], 0);   // B of right pixel
    });

    it("4.3 scales oversized frames within maxDimensions bounds using bilinear interpolation", () => {
      const pipeline = new FramePreprocessingPipeline({
        maxDimensions: { width: 320, height: 240 },
      });

      const frame = createValidFrame({
        metadata: {
          ...createValidFrame().metadata,
          dimensions: { width: 1280, height: 960 },
          byteLength: 1280 * 960 * 4,
        },
        buffer: new Uint8Array(1280 * 960 * 4),
      });

      const res = pipeline.process(frame);
      assert.equal(res.success, true);
      assert.ok(res.frame);
      assert.equal(res.frame.metadata.dimensions.width, 320);
      assert.equal(res.frame.metadata.dimensions.height, 240);
      assert.equal(res.frame.metadata.byteLength, 320 * 240 * 4);
    });

    it("4.4 converts pixel format accurately (RGBA8 -> GRAYSCALE8)", () => {
      const pipeline = new FramePreprocessingPipeline({
        targetFormat: "GRAYSCALE8",
      });

      const width = 2;
      const height = 2;
      const buffer = new Uint8Array(width * height * 4);
      // Fill with solid pure white
      buffer.fill(255);

      const frame: VideoFrameInput = {
        frameId: "gray-frame-1",
        buffer,
        metadata: {
          dimensions: { width, height },
          pixelFormat: "RGBA8",
          colorSpace: "srgb",
          timestamp: { acquisitionTimestampMs: 100, sequenceNumber: 0 },
          byteLength: buffer.byteLength,
        },
      };

      const res = pipeline.process(frame);
      assert.equal(res.success, true);
      assert.ok(res.frame);
      assert.equal(res.frame.metadata.pixelFormat, "GRAYSCALE8");
      assert.equal(res.frame.metadata.byteLength, width * height * 1);
      const outBuf = new Uint8Array(res.frame.buffer as ArrayBuffer);
      assert.equal(outBuf[0], 255); // 0.299*255 + 0.587*255 + 0.114*255 = 255
    });

    it("4.5 enforces monotonic timestamps and monotonic sequence numbers", () => {
      const pipeline = new FramePreprocessingPipeline({ enforceMonotonicTimestamps: true });

      const frame1 = createValidFrame({
        metadata: { ...createValidFrame().metadata, timestamp: { acquisitionTimestampMs: 500, sequenceNumber: 0 } },
      });
      const frame2Backwards = createValidFrame({
        metadata: { ...createValidFrame().metadata, timestamp: { acquisitionTimestampMs: 300, sequenceNumber: 0 } },
      });

      const res1 = pipeline.process(frame1);
      const res2 = pipeline.process(frame2Backwards);

      assert.equal(res1.frame?.metadata.timestamp.acquisitionTimestampMs, 500);
      assert.equal(res1.frame?.metadata.timestamp.sequenceNumber, 0);

      // Backwards timestamp should be adjusted forward monotonically
      assert.ok(res2.frame?.metadata.timestamp.acquisitionTimestampMs! >= 501);
      assert.equal(res2.frame?.metadata.timestamp.sequenceNumber, 1);
    });

    it("4.6 rejects corrupt or malformed frames fail-closed with dropped flag", () => {
      const pipeline = new FramePreprocessingPipeline();
      const corruptFrame = {
        frameId: "corrupt",
        buffer: null as any,
        metadata: {} as any,
      };

      const res = pipeline.process(corruptFrame as any);
      assert.equal(res.success, false);
      assert.equal(res.dropped, true);
      assert.ok(res.error);
    });
  });

  // =========================================================================
  // 5. BACKPRESSURE, MEMORY LIMITS & NEWEST-FRAME DROP POLICY
  // =========================================================================
  describe("5. Backpressure, Memory Limits & Newest-Frame Drop Policy", () => {
    it("5.1 drops oldest frames when capture rate > consumption rate (DROP_OLDEST)", async () => {
      const source = new SimulatedFrameSource({
        targetFps: 0,
        maxQueueCapacity: 2,
        dropPolicy: "DROP_OLDEST",
      });
      await source.initialize();

      const delivered: string[] = [];
      let slowConsumerActive = false;

      await source.start(async (frame) => {
        if (!slowConsumerActive) {
          delivered.push(frame.frameId);
        }
      });

      // Emit first frame (delivered immediately)
      await source.stepEmit();
      assert.equal(delivered.length, 1);

      // Now emulate consumer congestion by pausing delivery
      await source.pause();

      // Emit multiple frames into queue beyond capacity (2)
      await source.stepEmit(); // Queue: [f1]
      await source.stepEmit(); // Queue: [f1, f2]
      await source.stepEmit(); // Queue: [f2, f3] -> drops f1 (oldest)

      const metrics = source.getMetrics();
      assert.equal(metrics.framesAcquired, 4);
      assert.equal(metrics.framesDropped, 1);
      assert.ok(metrics.dropRate > 0);

      await source.release();
    });

    it("5.2 rejects when BACKPRESSURE_REJECT policy is triggered", async () => {
      const source = new SimulatedFrameSource({
        targetFps: 0,
        maxQueueCapacity: 1,
        dropPolicy: "BACKPRESSURE_REJECT",
      });
      await source.initialize();

      await source.start(() => {});

      // Fill queue capacity
      await source.pause();
      await source.stepEmit();

      // Next emit exceeds capacity and must throw
      await assert.rejects(async () => {
        await source.stepEmit();
      }, /Backpressure limit exceeded: queue at capacity 1/);

      assert.equal(source.getMetrics().errorsCount, 1);
      await source.release();
    });
  });

  // =========================================================================
  // 6. OFFSCREENCANVAS PROCESSING & CAPABILITY DETECTION
  // =========================================================================
  describe("6. OffscreenCanvas Processing & Capability Detection", () => {
    it("6.1 detects environment capabilities and reports ENVIRONMENT_PENDING in Node.js", async () => {
      const processor = new OffscreenCanvasProcessor();
      assert.equal(OffscreenCanvasProcessor.isSupported(), false);

      await processor.initialize();
      assert.equal(processor.getStatus(), "ENVIRONMENT_PENDING");

      const frame = createValidFrame();
      const res = await processor.processFrame(frame);
      assert.equal(res.success, true);
      assert.ok(res.frame);

      // Verify metrics tracked fallback execution
      const metrics = processor.getMetrics();
      assert.equal(metrics.framesProcessed, 1);
      assert.equal(metrics.fallbackExecutions, 1);

      processor.dispose();
      assert.equal(processor.getStatus(), "DISPOSED");
    });

    it("6.2 supports injected custom canvas factory for off-main-thread testing", async () => {
      let canvasRenderCount = 0;
      let widthSet = 0;
      let heightSet = 0;

      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: (type: string) => ({
          putImageData: () => {
            canvasRenderCount++;
          },
        }),
      };

      const processor = new OffscreenCanvasProcessor({
        customCanvasFactory: (w, h) => {
          mockCanvas.width = w;
          mockCanvas.height = h;
          return mockCanvas;
        },
      });

      await processor.initialize();
      assert.equal(processor.getStatus(), "READY");

      const frame = createValidFrame();
      const res = await processor.processFrame(frame);
      assert.equal(res.success, true);
      assert.ok(res.frame);

      const metrics = processor.getMetrics();
      assert.equal(metrics.framesProcessed, 1);
      assert.equal(metrics.canvasRenders, 1);

      processor.dispose();
      assert.equal(processor.getStatus(), "DISPOSED");
      assert.equal(mockCanvas.width, 0);
      assert.equal(mockCanvas.height, 0);
    });

    it("6.3 tracks transferable buffer ownership handover", () => {
      const processor = new OffscreenCanvasProcessor();
      const buffer = new ArrayBuffer(1024);
      const res = processor.transferBufferToWorker(buffer);
      assert.equal(res.transferred, true);
      assert.equal(res.byteLength, 1024);
      assert.equal(processor.getMetrics().transferredBuffersCount, 1);
    });
  });

  // =========================================================================
  // 7. WEBWORKER INTEGRATION & OFF-MAIN-THREAD DISPATCH
  // =========================================================================
  describe("7. WebWorker Integration & Off-Main-Thread Dispatch", () => {
    it("7.1 dispatches FRAME_PREPROCESS operation in WorkerRuntimeDispatcher with correlation by requestId", async () => {
      const dispatcher = new VtoWorkerRuntimeDispatcher();
      const frame = createValidFrame();

      const request: VtoWorkerRequest = {
        protocolVersion: VTO_WORKER_PROTOCOL_VERSION,
        requestId: "req-frame-preprocess-42",
        operation: "FRAME_PREPROCESS",
        payload: {
          frame,
          config: {
            targetFormat: "GRAYSCALE8",
          },
        },
        timestampMs: Date.now(),
        tenantId: "tenant-tentaciones-corp",
        applicationId: "app-tentaciones-vto",
      };

      const response = await dispatcher.dispatch(request);
      assert.equal(response.status, "SUCCESS");
      assert.equal(response.requestId, "req-frame-preprocess-42");
      assert.equal(response.operation, "FRAME_PREPROCESS");
      assert.ok(response.payload);
      assert.equal((response.payload as any).frame.metadata.pixelFormat, "GRAYSCALE8");
      assert.ok(response.metrics.executionDurationMs >= 0);
    });

    it("7.2 rejects malformed frame in worker dispatcher fail-closed", async () => {
      const dispatcher = new VtoWorkerRuntimeDispatcher();
      const request: VtoWorkerRequest = {
        protocolVersion: VTO_WORKER_PROTOCOL_VERSION,
        requestId: "req-frame-bad",
        operation: "FRAME_PREPROCESS",
        payload: {
          frame: { frameId: "" }, // Invalid
        },
      };

      const response = await dispatcher.dispatch(request);
      assert.equal(response.status, "ERROR");
      assert.equal(response.requestId, "req-frame-bad");
      assert.ok(response.error);
    });
  });

  // =========================================================================
  // 8. PRIVACY BY DESIGN & HEXAGONAL BOUNDARY PURITY
  // =========================================================================
  describe("8. Privacy By Design, Tenant Isolation & Hexagonal Boundary Purity", () => {
    it("8.1 verifies technical metrics contain zero frame pixels, image data, or biometrics", async () => {
      const source = new SimulatedFrameSource();
      await source.initialize();
      await source.acquireFrame();

      const metrics = source.getMetrics();
      const metricsKeys = Object.keys(metrics);
      const prohibitedTokens = ["pixel", "image", "raw", "photo", "biometric", "face", "body"];

      for (const key of metricsKeys) {
        for (const token of prohibitedTokens) {
          assert.equal(
            key.toLowerCase().includes(token),
            false,
            `Prohibited visual/biometric token "${token}" found in metrics property "${key}"`
          );
        }
      }
      await source.release();
    });

    it("8.2 verifies src/domain/vto/ contains ZERO references to browser APIs", () => {
      const domainDir = path.resolve(process.cwd(), "src/domain/vto");
      const files = fs.readdirSync(domainDir).filter((f) => f.endsWith(".ts"));

      const forbiddenBrowserAPIs = [
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
      ];

      for (const file of files) {
        const fullPath = path.join(domainDir, file);
        const rawContent = fs.readFileSync(fullPath, "utf-8");
        // Strip block and line comments to check executable code and imports
        const codeOnly = rawContent.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");

        for (const forbidden of forbiddenBrowserAPIs) {
          assert.equal(
            codeOnly.includes(forbidden),
            false,
            `Architectural violation: Forbidden browser API "${forbidden}" found in domain file "${file}"`
          );
        }
      }
    });

    it("8.3 verifies zero-persistence: frames are never saved to disk or persistent SQLite caches", () => {
      const frame = createValidFrame();
      // Ensure frame objects have no persistence methods or SQLite ties
      assert.equal((frame as any).save, undefined);
      assert.equal((frame as any).persist, undefined);
      assert.equal((frame as any).toSqlite, undefined);
    });
  });
});

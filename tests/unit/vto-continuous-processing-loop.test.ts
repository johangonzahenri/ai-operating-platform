/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * FASE 160: Real-Time Computer Vision Continuous Processing Loop,
 * Frame Temporal Synchronization & Spatial Warping Compositor Unit Test Suite.
 * 
 * Coverage:
 * 1. Lifecycle State Machine & Valid/Invalid Transitions
 * 2. Monotonic Temporal Synchronization & Generation Tracking
 * 3. Latest-Frame Priority, Coalescing & Backpressure
 * 4. Stale-Result Protection & Out-of-Order Rejection (12 before 10 and 11)
 * 5. Cooperative Cancellation via AbortSignal & Superseding
 * 6. Spatial Warping Composition & Canonical Z-Ordering (WarpField2D, non-TPS)
 * 7. Graceful Degradation & Partial Result Policies
 * 8. Privacy by Design & Zero Biometric Persistence in Telemetry
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Domain imports
import {
  ContinuousLoopConfig,
  ContinuousLoopMetrics,
  ContinuousLoopSnapshot,
  ContinuousLoopState,
  DEFAULT_CONTINUOUS_LOOP_CONFIG,
  isValidLoopStateTransition,
} from "../../src/domain/vto/continuous-processing-loop.js";
import {
  TemporalSynchronizer,
  ResultClassification,
} from "../../src/domain/vto/temporal-synchronizer.js";
import {
  SpatialWarpingCompositor,
  SpatialCompositionInput,
  CANONICAL_SPATIAL_Z_INDEX,
} from "../../src/domain/vto/spatial-warping-compositor.js";
import {
  createAffineWarpField,
  createIdentityWarpField,
  WarpField2D,
} from "../../src/domain/vto/warp-field.js";

// Application imports
import {
  ContinuousProcessingCoordinator,
  FrameProcessingContext,
  FrameProcessingOutput,
} from "../../src/application/vto/continuous-processing-coordinator.js";
import {
  SimulatedContinuousPipeline,
  createSyntheticVideoFrame,
} from "../../src/application/vto/simulated-continuous-pipeline.js";

describe("Phase 160: Continuous Processing Loop, Temporal Sync & Spatial Warping Compositor", () => {
  let pipelineDouble: SimulatedContinuousPipeline;

  beforeEach(() => {
    pipelineDouble = new SimulatedContinuousPipeline();
  });

  // =========================================================================
  // 1. LIFECYCLE STATE MACHINE
  // =========================================================================
  describe("1. Lifecycle State Machine & State Transitions", () => {
    it("1.1 enforces canonical state transitions and rejects illegal transitions", () => {
      // Valid transitions
      assert.equal(isValidLoopStateTransition("UNINITIALIZED", "STARTING"), true);
      assert.equal(isValidLoopStateTransition("STARTING", "RUNNING"), true);
      assert.equal(isValidLoopStateTransition("RUNNING", "PAUSED"), true);
      assert.equal(isValidLoopStateTransition("PAUSED", "RUNNING"), true);
      assert.equal(isValidLoopStateTransition("RUNNING", "STOPPING"), true);
      assert.equal(isValidLoopStateTransition("STOPPING", "STOPPED"), true);
      assert.equal(isValidLoopStateTransition("STOPPED", "STARTING"), true);
      assert.equal(isValidLoopStateTransition("STOPPED", "DISPOSED"), true);

      // Illegal transitions
      assert.equal(isValidLoopStateTransition("UNINITIALIZED", "RUNNING"), false);
      assert.equal(isValidLoopStateTransition("UNINITIALIZED", "STOPPED"), false);
      assert.equal(isValidLoopStateTransition("DISPOSED", "STARTING"), false);
      assert.equal(isValidLoopStateTransition("DISPOSED", "RUNNING"), false);
    });

    it("1.2 orchestrates coordinator lifecycle through start -> pause -> resume -> stop -> dispose", async () => {
      const coordinator = new ContinuousProcessingCoordinator();
      assert.equal(coordinator.getState(), "UNINITIALIZED");

      await coordinator.start();
      assert.equal(coordinator.getState(), "RUNNING");

      coordinator.pause();
      assert.equal(coordinator.getState(), "PAUSED");

      coordinator.resume();
      assert.equal(coordinator.getState(), "RUNNING");

      await coordinator.stop();
      assert.equal(coordinator.getState(), "STOPPED");

      await coordinator.dispose();
      assert.equal(coordinator.getState(), "DISPOSED");
    });

    it("1.3 rejects incoming frames when not in RUNNING state", async () => {
      const coordinator = new ContinuousProcessingCoordinator();
      const frame = createSyntheticVideoFrame({ sequenceNumber: 1 });

      // In UNINITIALIZED
      const acceptedWhenUninit = await coordinator.feedFrame(frame);
      assert.equal(acceptedWhenUninit, false);
      assert.equal(coordinator.getMetrics().framesDropped, 1);

      await coordinator.start();
      coordinator.pause();

      // In PAUSED
      const acceptedWhenPaused = await coordinator.feedFrame(frame);
      assert.equal(acceptedWhenPaused, false);
      assert.equal(coordinator.getMetrics().framesDropped, 2);

      await coordinator.dispose();
    });
  });

  // =========================================================================
  // 2. MONOTONIC TEMPORAL SYNCHRONIZATION
  // =========================================================================
  describe("2. Monotonic Temporal Synchronization & Generation Tracking", () => {
    it("2.1 generates strictly increasing generation epochs and monotonic sequence numbers", () => {
      const synchronizer = new TemporalSynchronizer();
      const frame1 = createSyntheticVideoFrame({ sequenceNumber: 10 });
      const frame2 = createSyntheticVideoFrame({ sequenceNumber: 11 });
      const frame3 = createSyntheticVideoFrame({ sequenceNumber: 12 });

      const res1 = synchronizer.registerFrame(frame1);
      const res2 = synchronizer.registerFrame(frame2);
      const res3 = synchronizer.registerFrame(frame3);

      assert.equal(res1.sequenceNumber, 10);
      assert.equal(res2.sequenceNumber, 11);
      assert.equal(res3.sequenceNumber, 12);

      assert.ok(res2.generation > res1.generation);
      assert.ok(res3.generation > res2.generation);
    });

    it("2.2 maintains bounded historical record window to prevent memory leaks", () => {
      const synchronizer = new TemporalSynchronizer({ maxRecordWindowSize: 5 });

      for (let i = 1; i <= 20; i++) {
        const frame = createSyntheticVideoFrame({ sequenceNumber: i });
        synchronizer.registerFrame(frame);
      }

      // Old records outside window should be pruned
      assert.equal(synchronizer.getRecord(1), undefined);
      assert.equal(synchronizer.getRecord(5), undefined);
      // Recent records inside window should exist
      assert.ok(synchronizer.getRecord(19));
      assert.ok(synchronizer.getRecord(20));
    });
  });

  // =========================================================================
  // 3. LATEST-FRAME PRIORITY & COALESCING
  // =========================================================================
  describe("3. Latest-Frame Priority, Coalescing & Backpressure", () => {
    it("3.1 coalesces pending queued frames, prioritizing the latest frame", async () => {
      pipelineDouble.setSimulatedDelay(-1); // Manual resolution mode

      const coordinator = new ContinuousProcessingCoordinator({
        processingHandler: pipelineDouble.createProcessingHandler(),
        config: { enableCoalescing: true, maxQueueDepth: 1 },
      });
      await coordinator.start();

      // Frame 1 arrives and starts processing
      await coordinator.feedFrame(createSyntheticVideoFrame({ sequenceNumber: 1 }));
      assert.equal(coordinator.getMetrics().activeProcessing, true);

      // Frame 2 arrives while Frame 1 is processing: placed in queue
      await coordinator.feedFrame(createSyntheticVideoFrame({ sequenceNumber: 2 }));
      assert.equal(coordinator.getMetrics().currentQueueDepth, 1);

      // Frame 3 arrives while Frame 1 is still processing: supersedes Frame 2 in queue
      await coordinator.feedFrame(createSyntheticVideoFrame({ sequenceNumber: 3 }));
      assert.equal(coordinator.getMetrics().framesSuperseded >= 1, true);

      // Resolve Frame 1
      pipelineDouble.resolveFrameManually(1);
      await new Promise((r) => setTimeout(r, 10));

      // After Frame 1 completes, Frame 3 (latest) should be active, NOT Frame 2
      assert.equal(pipelineDouble.getPendingSequences().includes(3), true);
      assert.equal(pipelineDouble.getPendingSequences().includes(2), false);

      pipelineDouble.resolveFrameManually(3);
      await new Promise((r) => setTimeout(r, 10));

      assert.equal(coordinator.getMetrics().resultsAccepted >= 1, true);
      await coordinator.dispose();
    });

    it("3.2 drops oldest frame when queue depth limit is exceeded and coalescing is disabled", async () => {
      pipelineDouble.setSimulatedDelay(-1);

      const coordinator = new ContinuousProcessingCoordinator({
        processingHandler: pipelineDouble.createProcessingHandler(),
        config: { enableCoalescing: false, maxQueueDepth: 1 },
      });
      await coordinator.start();

      await coordinator.feedFrame(createSyntheticVideoFrame({ sequenceNumber: 1 })); // Active
      await coordinator.feedFrame(createSyntheticVideoFrame({ sequenceNumber: 2 })); // Queued
      await coordinator.feedFrame(createSyntheticVideoFrame({ sequenceNumber: 3 })); // Exceeds limit -> drops oldest (2)

      assert.equal(coordinator.getMetrics().framesDropped, 1);

      pipelineDouble.resolveFrameManually(1);
      await new Promise((r) => setTimeout(r, 10));

      // Frame 3 is dispatched next
      assert.equal(pipelineDouble.getPendingSequences().includes(3), true);

      pipelineDouble.resolveFrameManually(3);
      await new Promise((r) => setTimeout(r, 10));

      await coordinator.dispose();
    });
  });

  // =========================================================================
  // 4. STALE-RESULT REJECTION & OUT-OF-ORDER HANDLING
  // =========================================================================
  describe("4. Stale-Result Protection & Out-of-Order Rejection", () => {
    it("4.1 rejects stale results and preserves latest accepted state (Frame 12 before 10 and 11)", () => {
      const synchronizer = new TemporalSynchronizer();

      const f10 = synchronizer.registerFrame(createSyntheticVideoFrame({ sequenceNumber: 10 }));
      const f11 = synchronizer.registerFrame(createSyntheticVideoFrame({ sequenceNumber: 11 }));
      const f12 = synchronizer.registerFrame(createSyntheticVideoFrame({ sequenceNumber: 12 }));

      // Frame 12 finishes first (e.g. faster execution path)
      const class12 = synchronizer.classifyResult(f12.generation, 12);
      assert.equal(class12, "CURRENT");
      const commit12 = synchronizer.commitResult(f12.generation, 12);
      assert.equal(commit12, true);
      assert.equal(synchronizer.getLatestCommittedSequence(), 12);

      // Frame 10 arrives later: must be classified as STALE / SUPERSEDED
      const class10 = synchronizer.classifyResult(f10.generation, 10);
      assert.ok(class10 === "STALE" || class10 === "SUPERSEDED");
      const commit10 = synchronizer.commitResult(f10.generation, 10);
      assert.equal(commit10, false); // Rejected!
      assert.equal(synchronizer.getLatestCommittedSequence(), 12); // Unaltered!

      // Frame 11 arrives later: must be classified as STALE / SUPERSEDED
      const class11 = synchronizer.classifyResult(f11.generation, 11);
      assert.ok(class11 === "STALE" || class11 === "SUPERSEDED");
      const commit11 = synchronizer.commitResult(f11.generation, 11);
      assert.equal(commit11, false); // Rejected!
      assert.equal(synchronizer.getLatestCommittedSequence(), 12); // Unaltered!
    });

    it("4.2 rejects duplicate results for the same committed sequence number", () => {
      const synchronizer = new TemporalSynchronizer();
      const f1 = synchronizer.registerFrame(createSyntheticVideoFrame({ sequenceNumber: 5 }));

      assert.equal(synchronizer.classifyResult(f1.generation, 5), "CURRENT");
      assert.equal(synchronizer.commitResult(f1.generation, 5), true);

      // Duplicate delivery attempt
      assert.equal(synchronizer.classifyResult(f1.generation, 5), "DUPLICATE");
      assert.equal(synchronizer.commitResult(f1.generation, 5), false);
    });
  });

  // =========================================================================
  // 5. COOPERATIVE CANCELLATION VIA ABORTSIGNAL
  // =========================================================================
  describe("5. Cooperative Cancellation & Worker Failure Handling", () => {
    it("5.1 triggers AbortSignal on in-flight frame when superseded by newer incoming frame", async () => {
      let observedAbort = false;

      const coordinator = new ContinuousProcessingCoordinator({
        abortOnSupersede: true,
        processingHandler: async (frame, context) => {
          context.signal.addEventListener("abort", () => {
            observedAbort = true;
          });
          // Wait long enough to allow superseding
          await new Promise((r) => setTimeout(r, 60));
          return {
            frameId: frame.frameId,
            sequenceNumber: context.sequenceNumber,
            generation: context.generation,
            isCancelled: context.signal.aborted,
          };
        },
      });

      await coordinator.start();
      await coordinator.feedFrame(createSyntheticVideoFrame({ sequenceNumber: 1 }));
      await new Promise((r) => setTimeout(r, 10));

      // Feed Frame 2 to supersede Frame 1
      await coordinator.feedFrame(createSyntheticVideoFrame({ sequenceNumber: 2 }));
      await new Promise((r) => setTimeout(r, 80));

      assert.equal(observedAbort, true);
      assert.ok(coordinator.getMetrics().framesSuperseded >= 1);

      await coordinator.dispose();
    });

    it("5.2 increments processingErrors counter on unexpected handler exception without crashing loop", async () => {
      pipelineDouble.setShouldFail(true, "Simulated GPU Out of Memory");

      let reportedError: Error | null = null;
      const coordinator = new ContinuousProcessingCoordinator({
        processingHandler: pipelineDouble.createProcessingHandler(),
        eventListener: {
          onError: (err) => {
            reportedError = err;
          },
        },
      });

      await coordinator.start();
      await coordinator.feedFrame(createSyntheticVideoFrame({ sequenceNumber: 1 }));
      await new Promise((r) => setTimeout(r, 20));

      assert.equal(coordinator.getMetrics().processingErrors, 1);
      assert.ok(reportedError);
      assert.equal((reportedError as Error).message, "Simulated GPU Out of Memory");
      assert.equal(coordinator.getState(), "RUNNING"); // Loop remains healthy and running

      await coordinator.dispose();
    });
  });

  // =========================================================================
  // 6. SPATIAL WARPING COMPOSITION (WARPFIELD2D, NON-TPS)
  // =========================================================================
  describe("6. Spatial Warping Composition & Canonical Z-Ordering", () => {
    it("6.1 assembles multi-layer composite respecting canonical Z-index hierarchy", () => {
      const warp = createAffineWarpField(8, 8, {
        scale: { x: 1.1, y: 1.05 },
        rotationDegrees: 10,
        translation: { x: 0.02, y: -0.01 },
        anchorOrigin: { x: 0.5, y: 0.5 },
        boundingBox: { xMin: 0.2, yMin: 0.2, xMax: 0.8, yMax: 0.8 },
      });

      const composite = SpatialWarpingCompositor.compose({
        frameId: "frame-test-01",
        sequenceNumber: 1,
        generation: 1,
        timestampMs: 1000,
        dimensions: { width: 640, height: 480 },
        warpField: warp,
        alignmentScore: 0.96,
      });

      assert.ok(composite);
      assert.equal(composite.status, "SUCCESS");
      assert.equal(composite.warpQuality, "AFFINE");

      // Verify canonical Z-index ordering
      const layerKinds = composite.layers.map((l) => l.layerKind);
      assert.ok(layerKinds.includes("BASE"));
      assert.ok(layerKinds.includes("GARMENT"));
      assert.ok(layerKinds.includes("FINAL_COMPOSITE"));

      // Base layer must be index 0
      assert.equal(composite.layers[0].layerKind, "BASE");
      assert.equal(composite.layers[0].zIndex, CANONICAL_SPATIAL_Z_INDEX.BASE);

      // Verify mathematical nature: WarpField2D (dx, dy arrays of 64 elements), NOT TPS
      const garmentLayer = composite.layers.find((l) => l.layerKind === "GARMENT");
      assert.ok(garmentLayer);
      assert.ok(garmentLayer.warpField);
      assert.equal(garmentLayer.warpField.gridWidth, 8);
      assert.equal(garmentLayer.warpField.gridHeight, 8);
      assert.equal(garmentLayer.warpField.dx.length, 64);
      assert.equal(garmentLayer.warpField.dy.length, 64);
    });

    it("6.2 reuses previous valid garment warp when current frame warp is temporarily missing", () => {
      const validWarp = createIdentityWarpField(8, 8);
      const prevComposite = SpatialWarpingCompositor.compose({
        frameId: "frame-prev",
        sequenceNumber: 1,
        generation: 1,
        timestampMs: 1000,
        dimensions: { width: 640, height: 480 },
        warpField: validWarp,
      });

      // New frame without warpField passes previousValidComposite
      const currentComposite = SpatialWarpingCompositor.compose({
        frameId: "frame-current",
        sequenceNumber: 2,
        generation: 2,
        timestampMs: 1033,
        dimensions: { width: 640, height: 480 },
        previousValidComposite: prevComposite,
      });

      assert.equal(currentComposite.status, "DEGRADED");
      assert.ok(currentComposite.warpQuality.includes("TEMPORAL_REUSE"));
      const garmentLayer = currentComposite.layers.find((l) => l.layerKind === "GARMENT");
      assert.ok(garmentLayer);
      assert.ok(garmentLayer.warpField);
    });
  });

  // =========================================================================
  // 7. PRIVACY BY DESIGN & METRICS
  // =========================================================================
  describe("7. Privacy by Design & Zero Biometric Persistence", () => {
    it("7.1 verifies snapshot and metrics aggregate purely numeric values with zero raw pixels or biometrics", async () => {
      const coordinator = new ContinuousProcessingCoordinator();
      await coordinator.start();

      await coordinator.feedFrame(createSyntheticVideoFrame({ sequenceNumber: 1 }));
      await new Promise((r) => setTimeout(r, 20));

      const snapshot = coordinator.getSnapshot();
      assert.ok(snapshot);
      assert.equal(typeof snapshot.metrics.framesReceived, "number");
      assert.equal(typeof snapshot.metrics.averageLoopLatencyMs, "number");
      assert.equal(typeof snapshot.metrics.maxLoopLatencyMs, "number");

      // Verify zero binary frame buffers or biometrics in snapshot
      const snapshotKeys = Object.keys(snapshot);
      assert.equal(snapshotKeys.includes("buffer"), false);
      assert.equal(snapshotKeys.includes("pixels"), false);
      assert.equal(snapshotKeys.includes("imageBytes"), false);
      assert.equal(snapshotKeys.includes("biometrics"), false);
      assert.equal(snapshotKeys.includes("faceLandmarks"), false);

      const metricsKeys = Object.keys(snapshot.metrics);
      for (const k of metricsKeys) {
        const val = (snapshot.metrics as unknown as Record<string, unknown>)[k];
        const isNumericOrBool = typeof val === "number" || typeof val === "boolean";
        assert.equal(isNumericOrBool, true, `Metric ${k} must be number or boolean`);
      }

      await coordinator.dispose();
    });
  });
});

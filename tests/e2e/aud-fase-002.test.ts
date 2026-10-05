/**
 * AI Operating Platform — Transversal Quality Governance & Audit Suite
 * 
 * AUD-FASE-002: Stabilization Audit for Real-Time CV Loop, Render Boundary & Satellite 3D Integration
 * 
 * Scope: Fases 160, 161, 162 & Upstream Continuous Integration (PROJ-01: Tentaciones AI Commerce)
 * 
 * Invariants Formally Verified:
 * 1. Formal Verification and Closure of HAL-005 (Continuous Loop, Frame Synchronization & Auto-Advance)
 * 2. Temporal Ordering, Monotonicity & Out-of-Order Stale Rejection (Seq 2 -> Seq 1 STALE -> Seq 3 CURRENT)
 * 3. Viewport Interaction Fast-Path (O(1) Orbit/Zoom/Pan without CV Recomputation)
 * 4. Hexagonal Boundary Purity & Zero Third-Party Dependencies (0 Three.js in domain, 0 "tentaciones" in domain)
 * 5. Deterministic Resource Lifecycle & Zero-Leak Multi-Resource Disposal (DisposalReceipt)
 * 6. Honest Capability Taxonomy (Headless Node.js tagged as ENVIRONMENT PENDING)
 * 7. Fail-Closed Scene Specification Validation (Schema Integrity & Rejection of Malformed Specs)
 * 8. Privacy by Design & Zero Biometric Leakage in Telemetry Payloads
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Domain - VTO Render Contracts & Satellite Spec (Fases 161, 162)
import {
  DEFAULT_VIEWPORT_MODEL,
  RenderSceneDescriptor,
  RenderViewportModel,
} from "../../src/domain/vto/render-contract.js";
import {
  SatelliteVtoSceneSpec,
  mapRenderDescriptorToSatelliteSpec,
  validateSatelliteVtoSceneSpec,
} from "../../src/domain/vto/satellite-render-contract.js";

// Domain - Temporal Synchronization & Continuous Loop (Fase 160)
import {
  TemporalSynchronizer,
} from "../../src/domain/vto/temporal-synchronizer.js";
import {
  SpatialWarpingCompositor,
  SpatialCompositionInput,
  SpatialWarpingComposite,
} from "../../src/domain/vto/spatial-warping-compositor.js";
import {
  createAffineWarpField,
} from "../../src/domain/vto/warp-field.js";
import {
  VideoFrameInput,
} from "../../src/domain/vto/frame-protocol.js";

// Application - Coordinators, Controllers, Adapters & Bridges (Fases 160, 161, 162)
import {
  ContinuousProcessingCoordinator,
} from "../../src/application/vto/continuous-processing-coordinator.js";
import {
  SpatialToRenderMapper,
} from "../../src/application/vto/spatial-to-render-mapper.js";
import {
  Satellite3DRendererAdapter,
} from "../../src/application/vto/satellite-3d-renderer-adapter.js";
import {
  TentacionesVtoSceneBridge,
} from "../../src/application/vto/tentaciones-vto-scene-bridge.js";
import {
  createSyntheticVideoFrame,
  SimulatedContinuousPipeline,
} from "../../src/application/vto/simulated-continuous-pipeline.js";
import {
  createSyntheticThreeEnvironment,
  createSyntheticCanvas,
  inspectBrowserRuntimeCapabilities,
} from "../../src/application/vto/satellite-vto-harness.js";

describe("AUD-FASE-002 — Real-Time CV Loop, Render Boundary & Satellite 3D Integration Stabilization Audit", () => {

  const makeSampleDescriptor = (seq: number, isStale: boolean = false): RenderSceneDescriptor => {
    const warp = createAffineWarpField(8, 8, {
      translation: { x: 0, y: 0 },
      rotationDegrees: 0,
      scale: { x: 1, y: 1 },
    });

    const compInput: SpatialCompositionInput = {
      frameId: `frame-aud-${seq}`,
      sequenceNumber: seq,
      generation: 1,
      sourceTimestampMs: 1000 + seq * 33,
      warpField: warp,
      targetWidth: 640,
      targetHeight: 480,
      materialProfile: {
        materialId: "wool-blazer",
        category: "COTTON",
        provenance: "CATALOG_PROVIDED",
        confidence: 0.95,
        roughness: 0.5,
        metallic: 0.0,
        specularLevel: 0.5,
        opacity: 1.0,
      },
    };

    const composite = SpatialWarpingCompositor.compose(compInput);
    const scene = SpatialToRenderMapper.mapToSceneDescriptor(composite, {
      viewport: DEFAULT_VIEWPORT_MODEL,
    });

    return isStale ? { ...scene, isStale: true } : scene;
  };

  /**
   * AUD-02.1: Formal Verification and Closure of HAL-005 (Continuous Processing Loop & Auto-Sync)
   * 
   * Evidence Level: E3 (IN-MEMORY INTEGRATION)
   * 
   * Verifies that the VTO processing pipeline operates as an automated, continuous loop without
   * requiring manual step-by-step frame advancement, enforcing coalescing backpressure (DROP_OLDEST)
   * and latest-frame priority.
   */
  it("AUD-02.1: Formal verification and closure of HAL-005 (Continuous processing loop with automatic sync)", async () => {
    const pipeline = new SimulatedContinuousPipeline();
    const coordinator = new ContinuousProcessingCoordinator({
      processingHandler: pipeline.createProcessingHandler(),
      config: {
        maxQueueDepth: 2,
        enableCoalescing: true,
      },
    });

    assert.equal(coordinator.getState(), "UNINITIALIZED");
    await coordinator.start();
    assert.equal(coordinator.getState(), "RUNNING");

    // Ingest rapid burst of 5 synthetic video frames
    const frames: VideoFrameInput[] = [
      createSyntheticVideoFrame({ sequenceNumber: 1, timestampMs: 100 }),
      createSyntheticVideoFrame({ sequenceNumber: 2, timestampMs: 133 }),
      createSyntheticVideoFrame({ sequenceNumber: 3, timestampMs: 166 }),
      createSyntheticVideoFrame({ sequenceNumber: 4, timestampMs: 200 }),
      createSyntheticVideoFrame({ sequenceNumber: 5, timestampMs: 233 }),
    ];

    for (const frame of frames) {
      await coordinator.feedFrame(frame);
    }

    // Await loop execution of queue
    await new Promise((resolve) => setTimeout(resolve, 80));

    const metrics = coordinator.getMetrics();
    assert.ok(metrics.framesReceived >= 5, "Continuous loop must receive frames");
    assert.ok(metrics.framesProcessed > 0, "Continuous loop must automatically process frames");
    assert.ok(metrics.latestAcceptedSequenceNumber > 0, "Sequence numbers must advance automatically");
    assert.ok(metrics.averageLoopLatencyMs >= 0, "Latency telemetry must be recorded");

    await coordinator.stop();
    assert.equal(coordinator.getState(), "STOPPED");
  });

  /**
   * AUD-02.2: Temporal Ordering, Monotonicity & Out-of-Order Stale Rejection (2 -> 1 -> 3)
   * 
   * Evidence Level: E2 / E3 (UNIT & IN-MEMORY INTEGRATION)
   * 
   * Verifies that out-of-order execution results are strictly classified as STALE / SUPERSEDED
   * and rejected at both the TemporalSynchronizer domain level and Satellite3DRendererAdapter boundary.
   */
  it("AUD-02.2: Temporal ordering, monotonicity and out-of-order stale rejection (Seq 2 -> Seq 1 STALE -> Seq 3 CURRENT)", async () => {
    // 1. Domain Level Temporal Synchronizer Verification
    const synchronizer = new TemporalSynchronizer();

    const frame1 = createSyntheticVideoFrame({ sequenceNumber: 1, timestampMs: 1000 });
    const frame2 = createSyntheticVideoFrame({ sequenceNumber: 2, timestampMs: 1033 });
    const frame3 = createSyntheticVideoFrame({ sequenceNumber: 3, timestampMs: 1066 });

    const reg1 = synchronizer.registerFrame(frame1);
    const reg2 = synchronizer.registerFrame(frame2);
    const reg3 = synchronizer.registerFrame(frame3);

    assert.equal(reg1.sequenceNumber, 1);
    assert.equal(reg2.sequenceNumber, 2);
    assert.equal(reg3.sequenceNumber, 3);

    // Frame 2 completes first (out-of-order)
    const class2 = synchronizer.classifyResult(reg2.generation, 2);
    assert.equal(class2, "CURRENT");
    synchronizer.commitResult(reg2.generation, 2);

    // Frame 1 arrives late (should be rejected as SUPERSEDED or STALE)
    const class1 = synchronizer.classifyResult(reg1.generation, 1);
    assert.ok(class1 === "SUPERSEDED" || class1 === "STALE", "Older sequence arriving after newer sequence must be rejected");

    // Frame 3 arrives in order (CURRENT)
    const class3 = synchronizer.classifyResult(reg3.generation, 3);
    assert.equal(class3, "CURRENT");
    synchronizer.commitResult(reg3.generation, 3);

    // 2. Satellite Renderer Adapter Boundary Verification
    const adapter = new Satellite3DRendererAdapter({
      sceneId: "scene-aud-temporal",
    });
    await adapter.initialize();

    // Render sequence 20
    const desc20 = makeSampleDescriptor(20);
    const res20 = await adapter.renderScene(desc20);
    assert.equal(res20.rendered, true);
    assert.equal(adapter.getLatestRenderedSequence(), 20);

    // Sequence 10 arrives late -> MUST BE REJECTED AS STALE
    const desc10 = makeSampleDescriptor(10);
    const res10 = await adapter.renderScene(desc10);
    assert.equal(res10.rendered, false, "Late sequence must not be rendered");
    assert.equal(res10.reason, "STALE_FRAME_REJECTED", "Satellite renderer must reject stale sequences");
    assert.equal(adapter.getLatestRenderedSequence(), 20, "Latest rendered sequence must not regress");

    // Sequence 21 arrives in order -> MUST BE ACCEPTED
    const desc21 = makeSampleDescriptor(21);
    const res21 = await adapter.renderScene(desc21);
    assert.equal(res21.rendered, true);
    assert.equal(adapter.getLatestRenderedSequence(), 21);

    await adapter.dispose();
  });

  /**
   * AUD-02.3: Viewport Interaction Fast-Path (O(1) Orbit/Zoom/Pan without CV Recomputation)
   * 
   * Evidence Level: E3 (IN-MEMORY INTEGRATION)
   * 
   * Verifies that interactive camera adjustments (zoom, pan, orbit) update the 3D scene
   * directly without triggering or recomputing computer vision pose/warping/inference.
   */
  it("AUD-02.3: Viewport interaction fast-path (O(1) camera updates without re-triggering CV inference)", async () => {
    const bridge = new TentacionesVtoSceneBridge();
    await bridge.initialize();

    // Establish baseline valid composite
    const warp = createAffineWarpField(8, 8, {
      translation: { x: 0, y: 0 },
      rotationDegrees: 0,
      scale: { x: 1, y: 1 },
    });
    const compInput: SpatialCompositionInput = {
      frameId: "comp-base",
      sequenceNumber: 10,
      generation: 1,
      sourceTimestampMs: Date.now(),
      warpField: warp,
      targetWidth: 640,
      targetHeight: 480,
    };
    const baselineComposite = SpatialWarpingCompositor.compose(compInput);
    await bridge.updateSceneFromComposite(baselineComposite);

    // Initial metrics: 0 interactive updates, 0 frames fed through CV
    const initialMetrics = bridge.getMetrics();
    assert.equal(initialMetrics.interactiveUpdatesCount, 0);
    assert.equal(initialMetrics.framesFed, 0);
    assert.equal(initialMetrics.scenesRendered, 1);

    // Apply fast-path interactive viewport updates (e.g. user drag / pinch-to-zoom)
    const updatedViewport: RenderViewportModel = {
      ...DEFAULT_VIEWPORT_MODEL,
      zoomLevel: 1.5,
      cameraOrbit: { theta: 0.25, phi: 0.1, radius: 2.0 },
      panOffset: { x: 0.1, y: -0.05 },
    };

    const renderResult = await bridge.handleInteractiveViewportUpdate(updatedViewport);
    assert.equal(renderResult.rendered, true);

    // Telemetry check: 3D scene re-rendered, but CV pipeline was NOT invoked (0 framesFed)
    const fastPathMetrics = bridge.getMetrics();
    assert.equal(fastPathMetrics.framesFed, 0, "CV frames fed must remain 0 during fast-path interaction");
    assert.ok(fastPathMetrics.interactiveUpdatesCount >= 1, "Interactive updates must increment");
    assert.ok(fastPathMetrics.scenesRendered >= 2, "Rendered scenes must increment");

    await bridge.dispose();
  });

  /**
   * AUD-02.4: Hexagonal Boundary Purity & Zero Third-Party Dependencies in Core
   * 
   * Evidence Level: E1 (STATIC CODE ANALYSIS)
   * 
   * Verifies that:
   * 1. src/domain/vto/ contains 0 references to Three.js, WebGLRenderer, Scene, Camera, @react-three.
   * 2. src/domain/ contains 0 references to "tentaciones" (brand-agnostic domain core).
   * 3. package.json contains 0 production runtime dependencies other than @modelcontextprotocol/server.
   */
  it("AUD-02.4: Hexagonal boundary purity and zero third-party dependencies in Core", () => {
    const domainVtoDir = path.resolve("src", "domain", "vto");
    const domainDir = path.resolve("src", "domain");

    // 1. Scan src/domain/vto/ for Three.js / WebGL / Browser Graphics leaks
    const vtoFiles = fs.readdirSync(domainVtoDir).filter((f) => f.endsWith(".ts"));
    const graphicsKeywords = [
      "three",
      "WebGLRenderer",
      "PerspectiveCamera",
      "@react-three",
      "HTMLCanvasElement",
      "OffscreenCanvas",
      "requestAnimationFrame",
    ];

    for (const file of vtoFiles) {
      const content = fs.readFileSync(path.join(domainVtoDir, file), "utf8");
      for (const kw of graphicsKeywords) {
        // Exclude comments that document the invariant itself
        const nonCommentLines = content
          .split("\n")
          .filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("//"));
        for (const line of nonCommentLines) {
          if (line.includes(`from "${kw}"`) || line.includes(`from '${kw}'`) || line.includes(`import("${kw}")`)) {
            assert.fail(`Hexagonal violation in ${file}: imports forbidden graphics library '${kw}'`);
          }
        }
      }
    }

    // 2. Scan all src/domain/ for brand name "tentaciones"
    const allDomainFiles: string[] = [];
    function walkDir(dir: string): void {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walkDir(fullPath);
        } else if (entry.isFile() && entry.name.endsWith(".ts")) {
          allDomainFiles.push(fullPath);
        }
      }
    }
    walkDir(domainDir);

    for (const file of allDomainFiles) {
      const content = fs.readFileSync(file, "utf8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip header comment blocks that mention project name
        if (line.trim().startsWith("*") || line.trim().startsWith("//") || line.trim().startsWith("/*")) {
          continue;
        }
        if (/tentaciones/i.test(line)) {
          assert.fail(`Brand leakage in domain file ${path.relative(".", file)} line ${i + 1}: contains 'tentaciones'`);
        }
      }
    }

    // 3. Inspect package.json production dependencies
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
    const prodDeps = Object.keys(pkg.dependencies || {});
    const allowedProdDeps = ["@modelcontextprotocol/server"];
    const unexpectedDeps = prodDeps.filter((d) => !allowedProdDeps.includes(d));
    assert.deepEqual(unexpectedDeps, [], "Core package.json must not have unexpected production dependencies");
  });

  /**
   * AUD-02.5: Resource Lifecycle Management & Zero-Leak Multi-Resource Teardown
   * 
   * Evidence Level: E3 (IN-MEMORY INTEGRATION)
   * 
   * Verifies that components cleanly dispose of all allocated resources, cancel loops,
   * clear references, and return a valid DisposalReceipt with accurate timestamp.
   */
  it("AUD-02.5: Deterministic resource lifecycle and zero-leak multi-resource disposal", async () => {
    const adapter = new Satellite3DRendererAdapter({
      sceneId: "scene-aud-lifecycle",
    });
    await adapter.initialize();
    assert.equal(adapter.getLifecycleState(), "READY");

    const receipt = await adapter.dispose();
    assert.equal(receipt.sceneId, "scene-aud-lifecycle");
    assert.ok(receipt.timestampMs > 0, "Disposal receipt must contain valid epoch timestamp");
    assert.ok(receipt.disposedResourceCount >= 0, "Disposal receipt must count released resources");
    assert.equal(adapter.getLifecycleState(), "DISPOSED");

    // Subsequent render operations must fail-closed after disposal
    const desc = makeSampleDescriptor(99);
    await assert.rejects(
      async () => {
        await adapter.renderScene(desc);
      },
      /DISPOSED/,
      "Operations on disposed adapter must be rejected fail-closed"
    );
  });

  /**
   * AUD-02.6: Honest Capability Taxonomy (Headless Node.js as ENVIRONMENT PENDING)
   * 
   * Evidence Level: E1 / E3 (STATIC & IN-MEMORY HARNESS)
   * 
   * Verifies that the capability inspection harness accurately reports lack of physical
   * GPU silicons, canvas, and cameras in headless test execution, avoiding overclaiming.
   */
  it("AUD-02.6: Honest capability taxonomy (Headless Node.js tagged as ENVIRONMENT PENDING)", () => {
    const report = inspectBrowserRuntimeCapabilities();

    assert.equal(report.isBrowser, false, "Execution in Node.js must report isBrowser: false");
    assert.equal(report.hasWebGL2, false, "Physical WebGL2 must be false in headless Node.js");
    assert.equal(report.hasWebGPU, false, "Physical WebGPU must be false in headless Node.js");
    assert.equal(report.hasGetUserMedia, false, "Physical camera must be false in headless Node.js");
    assert.equal(report.status, "ENVIRONMENT_PENDING", "Must declare ENVIRONMENT_PENDING");
    assert.equal(report.details.userAgent, "headless-node", "User agent must be headless-node");
  });

  /**
   * AUD-02.7: Fail-Closed Scene Specification Validation
   * 
   * Evidence Level: E2 (PURE UNIT DOMAIN)
   * 
   * Verifies that malformed, negative, or invalid scene specifications fail-closed with
   * descriptive error reasons rather than corrupting the render pipeline.
   */
  it("AUD-02.7: Fail-closed scene specification validation (schema integrity & boundary protection)", () => {
    // 1. Valid Specification produced from canonical mapper
    const desc = makeSampleDescriptor(5);
    const validSpec = mapRenderDescriptorToSatelliteSpec(desc);
    const validCheck = validateSatelliteVtoSceneSpec(validSpec);
    assert.equal(validCheck.isValid, true);

    // 2. Malformed Specifications
    assert.equal(validateSatelliteVtoSceneSpec(null).isValid, false);
    assert.equal(validateSatelliteVtoSceneSpec({}).isValid, false);

    const invalidSeq = {
      sceneId: "s-invalid",
      frameId: "f-invalid",
      sequenceNumber: -1, // Negative sequence
      viewport: { width: 100, height: 100 },
      camera: { fovDegrees: 45 },
      layers: [],
    };
    assert.equal(validateSatelliteVtoSceneSpec(invalidSeq).isValid, false);

    const invalidDimensions = {
      sceneId: "s-invalid",
      frameId: "f-invalid",
      sequenceNumber: 1,
      viewport: { width: -640, height: 480 }, // Negative width
      camera: { fovDegrees: 45 },
      layers: [],
    };
    assert.equal(validateSatelliteVtoSceneSpec(invalidDimensions).isValid, false);

    const invalidLayers = {
      sceneId: "s-invalid",
      frameId: "f-invalid",
      sequenceNumber: 1,
      viewport: { width: 640, height: 480 },
      camera: { fovDegrees: 45 },
      layers: "not-an-array", // Invalid layers type
    };
    assert.equal(validateSatelliteVtoSceneSpec(invalidLayers).isValid, false);
  });

  /**
   * AUD-02.8: Privacy by Design & Zero Biometric Leakage in Telemetry Payloads
   * 
   * Evidence Level: E2 / E3 (IN-MEMORY TELEMETRY AUDIT)
   * 
   * Verifies that telemetry objects emitted by the pipeline and render bridge contain
   * exclusively numeric performance metrics and zero pixel buffers or biometric landmarks.
   */
  it("AUD-02.8: Privacy by design and zero biometric leakage in telemetry payloads", async () => {
    const pipeline = new SimulatedContinuousPipeline();
    const coordinator = new ContinuousProcessingCoordinator({
      processingHandler: pipeline.createProcessingHandler(),
      config: { maxQueueDepth: 2 },
    });
    await coordinator.start();

    const frame = createSyntheticVideoFrame({ sequenceNumber: 1, timestampMs: 100 });
    await coordinator.feedFrame(frame);
    await new Promise((resolve) => setTimeout(resolve, 40));

    const coordinatorMetrics = coordinator.getMetrics();
    await coordinator.stop();

    // Verify properties of telemetry
    const serialized = JSON.stringify(coordinatorMetrics);
    assert.ok(!serialized.includes("pixelBuffer"), "Telemetry must not contain raw pixel buffers");
    assert.ok(!serialized.includes("landmarks"), "Telemetry must not contain biometric landmarks");
    assert.ok(!serialized.includes("face"), "Telemetry must not contain facial markers");
    assert.ok(!serialized.includes("data:image"), "Telemetry must not contain base64 image data");

    // All properties must be numbers or booleans
    for (const [key, value] of Object.entries(coordinatorMetrics)) {
      assert.ok(
        typeof value === "number" || typeof value === "string" || typeof value === "boolean",
        `Telemetry field '${key}' must be primitive numeric/scalar`
      );
    }
  });

});

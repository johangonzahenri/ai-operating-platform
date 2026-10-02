/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * FASE 162: Integración Real de Browser Runtime, Renderer 3D del Satélite y Validación Visual del Pipeline VTO.
 * Unit Test Suite.
 * 
 * Coverage:
 * 1. Satellite Browser Integration Contract & Fail-Closed Validation
 * 2. Neutral Platform-to-Satellite Mapping (Float32Array vertices/uvs, Uint16Array indices)
 * 3. Satellite 3D Renderer Adapter with Synthetic Three.js Environment
 * 4. Stale Frame Rejection at Satellite Renderer Boundary (LATEST_VALID_RESULT > STALE_RESULT)
 * 5. Dynamic Resize, Aspect Ratio & Camera Projection Updates
 * 6. Deterministic Resource Lifecycle & Zero-Leak Disposal Receipt
 * 7. Tentaciones VTO Scene Bridge & Computational Decoupling (Render != CV)
 * 8. Interactive Viewport Fast-Path Manipulation (O(1) Viewport Update)
 * 9. Honest Browser Capability Inspection (ENVIRONMENT_PENDING in Headless Node.js)
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Domain imports
import {
  DEFAULT_VIEWPORT_MODEL,
  RenderSceneDescriptor,
} from "../../src/domain/vto/render-contract.js";
import {
  mapRenderDescriptorToSatelliteSpec,
  validateSatelliteVtoSceneSpec,
  SatelliteVtoSceneSpec,
} from "../../src/domain/vto/satellite-render-contract.js";
import {
  SpatialWarpingCompositor,
  SpatialCompositionInput,
  SpatialWarpingComposite,
} from "../../src/domain/vto/spatial-warping-compositor.js";
import {
  createAffineWarpField,
} from "../../src/domain/vto/warp-field.js";

// Application imports
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
  ContinuousProcessingCoordinator,
} from "../../src/application/vto/continuous-processing-coordinator.js";
import {
  SimulatedContinuousPipeline,
  createSyntheticVideoFrame,
} from "../../src/application/vto/simulated-continuous-pipeline.js";
import {
  createSyntheticThreeEnvironment,
  createSyntheticCanvas,
  inspectBrowserRuntimeCapabilities,
} from "../../src/application/vto/satellite-vto-harness.js";

describe("Phase 162: Satellite Browser Integration, 3D Renderer & Visual Pipeline Validation", () => {
  const makeSampleDescriptor = (seq = 1, isStale = false): RenderSceneDescriptor => {
    const warp = createAffineWarpField(8, 8, {
      translation: { x: 0.02, y: -0.01 },
      scale: { x: 1.02, y: 1.01 },
      rotationDegrees: 1.0,
      anchorOrigin: { x: 0.5, y: 0.5 },
    });

    const compInput: SpatialCompositionInput = {
      frameId: `frame-${seq}`,
      sequenceNumber: seq,
      generation: 1,
      timestampMs: 1000 + seq * 33,
      dimensions: { width: 1280, height: 720 },
      warpField: warp,
      materialProfile: {
        materialId: "silk-blouse",
        category: "SILK",
        provenance: "CATALOG_PROVIDED",
        confidence: 0.95,
        roughness: 0.3,
        metallic: 0.1,
        specularLevel: 0.8,
        opacity: 1.0,
      },
    };

    const composite = SpatialWarpingCompositor.compose(compInput);
    const scene = SpatialToRenderMapper.mapToSceneDescriptor(composite, {
      viewport: DEFAULT_VIEWPORT_MODEL,
    });

    return isStale ? { ...scene, isStale: true } : scene;
  };

  describe("1. Satellite Integration Contract & Schema Validation", () => {
    it("translates RenderSceneDescriptor to canonical SatelliteVtoSceneSpec", () => {
      const desc = makeSampleDescriptor(5);
      const spec = mapRenderDescriptorToSatelliteSpec(desc);

      assert.equal(spec.sceneId, desc.sceneId);
      assert.equal(spec.sequenceNumber, 5);
      assert.equal(spec.generation, 1);
      assert.equal(spec.isStale, false);
      assert.ok(spec.layers.length > 0);

      // Verify garment mesh spec
      const garmentLayer = spec.layers.find((l) => l.layerKind === "GARMENT");
      assert.ok(garmentLayer);
      assert.equal(garmentLayer.renderMode, "MESH");
      assert.equal(garmentLayer.material.type, "PBR_PHYSICAL");
      assert.equal(garmentLayer.material.sheen, 0.8);
      assert.ok(garmentLayer.geometry.vertexPositions instanceof Float32Array);
      assert.ok(garmentLayer.geometry.uvCoordinates instanceof Float32Array);
      assert.ok(garmentLayer.geometry.triangleIndices instanceof Uint16Array);
      assert.equal(garmentLayer.geometry.gridDimensions?.cols, 8);
      assert.equal(garmentLayer.geometry.gridDimensions?.rows, 8);

      // Validate spec fail-closed
      const validation = validateSatelliteVtoSceneSpec(spec);
      assert.equal(validation.isValid, true);
    });

    it("rejects malformed scene specifications fail-closed", () => {
      assert.equal(validateSatelliteVtoSceneSpec(null).isValid, false);
      assert.equal(validateSatelliteVtoSceneSpec({}).isValid, false);

      const invalidSeq = {
        sceneId: "s-1",
        frameId: "f-1",
        sequenceNumber: -1, // Negative sequence
        viewport: { width: 100, height: 100 },
        camera: { fovDegrees: 45 },
        layers: [],
      };
      assert.equal(validateSatelliteVtoSceneSpec(invalidSeq).isValid, false);

      const invalidLayer = {
        sceneId: "s-1",
        frameId: "f-1",
        sequenceNumber: 1,
        viewport: { width: 100, height: 100 },
        camera: { fovDegrees: 45 },
        layers: [{ layerId: "l-1", geometry: { vertexPositions: [1, 2, 3] }, material: {} }], // Not Float32Array
      };
      assert.equal(validateSatelliteVtoSceneSpec(invalidLayer).isValid, false);
    });
  });

  describe("2. Satellite 3D Renderer Adapter & Three.js Bridge", () => {
    it("operates gracefully in headless Node.js reporting ENVIRONMENT_PENDING", async () => {
      const adapter = new Satellite3DRendererAdapter({ sceneId: "headless-adapter" });
      await adapter.initialize();

      assert.equal(adapter.getLifecycleState(), "READY");
      assert.equal(adapter.getEnvironmentMode(), "ENVIRONMENT_PENDING");

      const desc = makeSampleDescriptor(1);
      const res = await adapter.renderScene(desc);
      assert.equal(res.rendered, true);
      assert.equal(res.sequenceNumber, 1);
      assert.equal(res.environmentMode, "ENVIRONMENT_PENDING");

      const receipt = await adapter.dispose();
      assert.equal(adapter.getLifecycleState(), "DISPOSED");
      assert.ok(receipt.disposedResourceCount >= 0);
    });

    it("connects to synthetic Three.js environment and updates scene graph", async () => {
      const env = createSyntheticThreeEnvironment();
      const canvas = createSyntheticCanvas(1280, 720);

      const adapter = new Satellite3DRendererAdapter({
        sceneId: "three-adapter-test",
        canvas,
        threeJsInstance: env.three,
      });

      await adapter.initialize();
      assert.equal(adapter.getLifecycleState(), "READY");
      assert.equal(adapter.getEnvironmentMode(), "WEBGL");

      // Verify Three.js scene and camera creation
      assert.equal(env.sceneInstances.length, 1);
      assert.equal(env.cameraInstances.length, 1);
      assert.equal(env.rendererInstances.length, 1);

      // Render frame
      const desc = makeSampleDescriptor(10);
      const res = await adapter.renderScene(desc);
      assert.equal(res.rendered, true);
      assert.equal(res.sequenceNumber, 10);

      // Verify meshes and render calls
      assert.ok(env.meshInstances.length > 0);
      assert.equal(env.rendererInstances[0].renderCallsCount, 1);

      // Verify in-place geometry buffer updates on subsequent frame
      const descNext = makeSampleDescriptor(11);
      await adapter.renderScene(descNext);
      assert.equal(env.rendererInstances[0].renderCallsCount, 2);

      await adapter.dispose();
      assert.equal(adapter.getLifecycleState(), "DISPOSED");
      assert.equal(env.geometryInstances[0].isDisposed, true);
      assert.equal(env.materialInstances[0].isDisposed, true);
    });

    it("rejects stale and out-of-order descriptors to prevent visual regressions", async () => {
      const adapter = new Satellite3DRendererAdapter({ sceneId: "stale-test" });
      await adapter.initialize();

      // Render sequence 20
      const desc20 = makeSampleDescriptor(20);
      const res20 = await adapter.renderScene(desc20);
      assert.equal(res20.rendered, true);
      assert.equal(adapter.getLatestRenderedSequence(), 20);

      // Older sequence 18 arrives late -> MUST be rejected
      const desc18 = makeSampleDescriptor(18);
      const res18 = await adapter.renderScene(desc18);
      assert.equal(res18.rendered, false);
      assert.equal(res18.reason, "STALE_FRAME_REJECTED");
      assert.equal(adapter.getLatestRenderedSequence(), 20);

      // Duplicate sequence 20 -> rejected
      const res20Dup = await adapter.renderScene(desc20);
      assert.equal(res20Dup.rendered, false);
      assert.equal(res20Dup.reason, "STALE_FRAME_REJECTED");

      // Descriptor flagged with isStale -> rejected
      const desc21Stale = makeSampleDescriptor(21, true);
      const res21Stale = await adapter.renderScene(desc21Stale);
      assert.equal(res21Stale.rendered, false);
      assert.equal(res21Stale.reason, "STALE_FRAME_REJECTED");

      // Newer sequence 22 -> accepted
      const desc22 = makeSampleDescriptor(22);
      const res22 = await adapter.renderScene(desc22);
      assert.equal(res22.rendered, true);
      assert.equal(adapter.getLatestRenderedSequence(), 22);

      await adapter.dispose();
    });

    it("handles dynamic resize without restarting the scene lifecycle", async () => {
      const env = createSyntheticThreeEnvironment();
      const canvas = createSyntheticCanvas(1280, 720);
      const adapter = new Satellite3DRendererAdapter({
        canvas,
        threeJsInstance: env.three,
      });
      await adapter.initialize();

      adapter.resize(1920, 1080, 2.0);
      assert.equal(canvas.width, 1920);
      assert.equal(canvas.height, 1080);
      assert.equal(env.cameraInstances[0].aspect, 1920 / 1080);
      assert.equal(env.rendererInstances[0].width, 1920);
      assert.equal(env.rendererInstances[0].height, 1080);
      assert.equal(env.rendererInstances[0].pixelRatio, 2.0);

      await adapter.dispose();
    });
  });

  describe("3. Tentaciones VTO Scene Bridge & Computational Decoupling", () => {
    it("decouples CV loop from 3D scene rendering and updates telemetry", async () => {
      const pipelineDouble = new SimulatedContinuousPipeline();
      const coordinator = new ContinuousProcessingCoordinator({
        processingHandler: pipelineDouble.createProcessingHandler(),
      });

      const bridge = new TentacionesVtoSceneBridge({ coordinator });
      await bridge.initialize();

      // 1. Feed video frame
      const frame1 = createSyntheticVideoFrame({ sequenceNumber: 1 });
      const fed = await bridge.feedVideoFrame(frame1);
      assert.equal(fed, true);

      // Allow async pipeline execution
      await new Promise((r) => setTimeout(r, 20));

      const composite = coordinator.getLatestValidResult();
      assert.ok(composite);

      // 2. Consume composite into 3D scene
      const renderRes = await bridge.updateSceneFromComposite(composite);
      assert.equal(renderRes.rendered, true);
      assert.equal(renderRes.sequenceNumber, 1);

      // Verify metrics
      const metrics = bridge.getMetrics();
      assert.equal(metrics.framesFed, 1);
      assert.equal(metrics.compositesReceived, 1);
      assert.equal(metrics.scenesRendered, 1);
      assert.equal(metrics.staleCompositesDropped, 0);

      // 3. Stale composite arrives -> dropped
      const staleComp = { ...composite, sequenceNumber: 0, isStale: true };
      const staleRes = await bridge.updateSceneFromComposite(staleComp);
      assert.equal(staleRes.rendered, false);
      assert.equal(staleRes.reason, "STALE_FRAME_REJECTED");
      assert.equal(bridge.getMetrics().staleCompositesDropped, 1);

      await bridge.dispose();
    });

    it("triggers fast-path 3D redraw on interactive viewport changes without restarting CV", async () => {
      const bridge = new TentacionesVtoSceneBridge();
      await bridge.initialize();

      // Establish baseline valid composite
      const warp = createAffineWarpField(8, 8, {
        translation: { x: 0, y: 0 },
        scale: { x: 1, y: 1 },
        rotationDegrees: 0,
      });
      const comp = SpatialWarpingCompositor.compose({
        frameId: "f-interactive",
        sequenceNumber: 10,
        generation: 1,
        timestampMs: Date.now(),
        dimensions: { width: 1280, height: 720 },
        warpField: warp,
      });
      await bridge.updateSceneFromComposite(comp);

      // Perform camera interaction (zoom and pan)
      const vp = bridge.getViewportController();
      vp.zoomBy(1.5);
      vp.pan(20, -10);

      // Allow microtask resolution
      await new Promise((r) => setTimeout(r, 10));

      const metrics = bridge.getMetrics();
      assert.ok(metrics.interactiveUpdatesCount >= 2);
      assert.ok(metrics.scenesRendered >= 2);

      await bridge.dispose();
    });
  });

  describe("4. Browser Capability Inspection Harness", () => {
    it("reports honest capability report in headless Node.js environment", () => {
      const report = inspectBrowserRuntimeCapabilities();
      assert.equal(report.hasWindow, false);
      assert.equal(report.hasDocument, false);
      assert.equal(report.hasWebGL, false);
      assert.equal(report.hasWebGPU, false);
      assert.equal(report.hasMediaDevices, false);
      assert.equal(report.status, "ENVIRONMENT_PENDING");
      assert.ok(report.details.nodeVersion !== undefined);
    });
  });
});

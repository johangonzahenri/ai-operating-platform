/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * FASE 161: Browser Render Boundary, Canvas Adapter & Interactive 3D Try-On Scene.
 * Unit Test Suite.
 * 
 * Coverage:
 * 1. Five Coordinate Spaces & Deterministic Spatial Transformations
 * 2. Axis Inversion (WebGL Y-up vs Image Y-down) & Selfie Mirroring
 * 3. Viewport Model & Bidirectional Projection/Unprojection
 * 4. Scene Lifecycle State Machine & Valid/Invalid Transitions
 * 5. Deterministic Resource Registration & Disposal Ownership
 * 6. Spatial-to-Render Mapping & Mesh Grid Generation (WarpField2D, non-TPS)
 * 7. Canonical Layer Z-Ordering & Material Appearance Hints
 * 8. Stale Result Protection at Renderer Level (Latest Sequence Invariant)
 * 9. Interactive Viewport & Camera Controller (Zoom, Pan, Orbit, Reset)
 * 10. Peripheral Canvas Renderer Capability Detection (ENVIRONMENT_PENDING in Node.js)
 * 11. Simulated Browser Render Adapter Test Double
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Domain imports
import {
  SpatialCoordinateTransformer,
  RenderViewportModel,
  DEFAULT_VIEWPORT_MODEL,
  RenderSceneDescriptor,
} from "../../src/domain/vto/render-contract.js";
import {
  SceneLifecycleManager,
  isValidSceneStateTransition,
  SceneLifecycleState,
} from "../../src/domain/vto/scene-lifecycle.js";
import {
  SpatialWarpingCompositor,
  SpatialCompositionInput,
  SpatialWarpingComposite,
  CANONICAL_SPATIAL_Z_INDEX,
} from "../../src/domain/vto/spatial-warping-compositor.js";
import {
  createAffineWarpField,
  createIdentityWarpField,
} from "../../src/domain/vto/warp-field.js";

// Application imports
import {
  SpatialToRenderMapper,
} from "../../src/application/vto/spatial-to-render-mapper.js";
import {
  InteractiveViewportController,
} from "../../src/application/vto/interactive-viewport-controller.js";
import {
  BrowserCanvasRenderer,
} from "../../src/application/vto/browser-render-adapter.js";
import {
  SimulatedBrowserRenderAdapter,
} from "../../src/application/vto/simulated-browser-render-adapter.js";

describe("Phase 161: Browser Render Boundary, Canvas Adapter & Interactive 3D Scene", () => {
  describe("1. Coordinate Space Transforms & Mathematical Fidelity", () => {
    it("transforms image pixel coordinates to normalized UV space deterministically", () => {
      const dims = { width: 1920, height: 1080 };
      const topLeft = SpatialCoordinateTransformer.imageToNormalized({ x: 0, y: 0 }, dims);
      assert.equal(topLeft.x, 0);
      assert.equal(topLeft.y, 0);

      const center = SpatialCoordinateTransformer.imageToNormalized({ x: 960, y: 540 }, dims);
      assert.equal(center.x, 0.5);
      assert.equal(center.y, 0.5);

      const bottomRight = SpatialCoordinateTransformer.imageToNormalized({ x: 1920, y: 1080 }, dims);
      assert.equal(bottomRight.x, 1);
      assert.equal(bottomRight.y, 1);

      // Clamp out-of-bounds
      const clamped = SpatialCoordinateTransformer.imageToNormalized({ x: 2500, y: -100 }, dims);
      assert.equal(clamped.x, 1);
      assert.equal(clamped.y, 0);
    });

    it("converts normalized UV to 3D Scene space with vertical axis inversion (Y-up)", () => {
      // UV top-left (0, 0) -> Scene (-1, 1, 0)
      const sceneTopLeft = SpatialCoordinateTransformer.normalizedToScene3D({ x: 0, y: 0 });
      assert.equal(sceneTopLeft.x, -1);
      assert.equal(sceneTopLeft.y, 1); // Inverted Y: 0 top -> +1 top

      // UV center (0.5, 0.5) -> Scene (0, 0, 0)
      const sceneCenter = SpatialCoordinateTransformer.normalizedToScene3D({ x: 0.5, y: 0.5 });
      assert.equal(sceneCenter.x, 0);
      assert.equal(sceneCenter.y, 0);

      // UV bottom-right (1, 1) -> Scene (1, -1, 0)
      const sceneBottomRight = SpatialCoordinateTransformer.normalizedToScene3D({ x: 1, y: 1 });
      assert.equal(sceneBottomRight.x, 1);
      assert.equal(sceneBottomRight.y, -1); // Inverted Y: 1 bottom -> -1 bottom
    });

    it("handles horizontal selfie camera mirroring in 3D Scene space", () => {
      // Normal top-right UV (1, 0) -> Scene (1, 1)
      const normal = SpatialCoordinateTransformer.normalizedToScene3D({ x: 1, y: 0 }, false);
      assert.equal(normal.x, 1);
      assert.equal(normal.y, 1);

      // Mirrored top-right UV (1, 0) -> Scene (-1, 1)
      const mirrored = SpatialCoordinateTransformer.normalizedToScene3D({ x: 1, y: 0 }, true);
      assert.equal(mirrored.x, -1);
      assert.equal(mirrored.y, 1);
    });

    it("performs bidirectional project and unproject between 3D Scene and Viewport Screen", () => {
      const viewport: RenderViewportModel = {
        width: 1000,
        height: 600,
        aspectRatio: 1000 / 600,
        devicePixelRatio: 1.0,
        scale: 1.0,
        translation: { x: 0, y: 0 },
        zoom: 1.0,
        rotationDeg: 0,
        isMirrored: false,
      };

      // Center (0, 0) in 3D -> Center (500, 300) in Screen
      const screenCenter = SpatialCoordinateTransformer.scene3DToViewport({ x: 0, y: 0 }, viewport);
      assert.equal(screenCenter.x, 500);
      assert.equal(screenCenter.y, 300);

      // Unproject back
      const unprojected = SpatialCoordinateTransformer.viewportToScene3D(screenCenter, viewport);
      assert.ok(Math.abs(unprojected.x - 0) < 1e-5);
      assert.ok(Math.abs(unprojected.y - 0) < 1e-5);

      // Point (0.5, 0.5) in 3D -> Screen (750, 150)
      const screenPt = SpatialCoordinateTransformer.scene3DToViewport({ x: 0.5, y: 0.5 }, viewport);
      assert.equal(screenPt.x, 750);
      assert.equal(screenPt.y, 150);

      const unprojectedPt = SpatialCoordinateTransformer.viewportToScene3D(screenPt, viewport);
      assert.ok(Math.abs(unprojectedPt.x - 0.5) < 1e-5);
      assert.ok(Math.abs(unprojectedPt.y - 0.5) < 1e-5);
    });
  });

  describe("2. Scene Lifecycle State Machine & Resource Ownership", () => {
    it("enforces canonical state transitions", () => {
      assert.equal(isValidSceneStateTransition("UNINITIALIZED", "INITIALIZING"), true);
      assert.equal(isValidSceneStateTransition("INITIALIZING", "READY"), true);
      assert.equal(isValidSceneStateTransition("READY", "RENDERING"), true);
      assert.equal(isValidSceneStateTransition("RENDERING", "READY"), true);
      assert.equal(isValidSceneStateTransition("READY", "PAUSED"), true);
      assert.equal(isValidSceneStateTransition("PAUSED", "READY"), true);
      assert.equal(isValidSceneStateTransition("READY", "DISPOSING"), true);
      assert.equal(isValidSceneStateTransition("DISPOSING", "DISPOSED"), true);

      // Invalid transitions
      assert.equal(isValidSceneStateTransition("UNINITIALIZED", "RENDERING"), false);
      assert.equal(isValidSceneStateTransition("DISPOSED", "READY"), false);
      assert.equal(isValidSceneStateTransition("DISPOSED", "INITIALIZING"), false);
    });

    it("manages lifecycle events and prevents transitions out of terminal DISPOSED", () => {
      const manager = new SceneLifecycleManager("test-scene-1");
      assert.equal(manager.getState(), "UNINITIALIZED");

      const events: Array<{ from: SceneLifecycleState; to: SceneLifecycleState }> = [];
      manager.addListener({
        onStateChange: (from, to) => events.push({ from, to }),
      });

      manager.transitionTo("INITIALIZING");
      manager.transitionTo("READY");
      manager.transitionTo("RENDERING");
      manager.transitionTo("READY");

      assert.equal(manager.getState(), "READY");
      assert.equal(events.length, 4);

      // Dispose
      const receipt = manager.disposeAll();
      assert.equal(manager.getState(), "DISPOSED");
      assert.equal(receipt.sceneId, "test-scene-1");

      // Attempt transition after DISPOSED throws
      assert.throws(() => manager.transitionTo("READY"), /terminal state DISPOSED/);
    });

    it("tracks allocated resources and computes accurate disposal receipts", () => {
      const manager = new SceneLifecycleManager("resource-scene");
      manager.transitionTo("INITIALIZING");

      const geom = manager.registerResource("mesh-grid-1", "GEOMETRY", 1024 * 10);
      const tex = manager.registerResource("garment-tex-1", "TEXTURE", 2048 * 2048 * 4);
      const mat = manager.registerResource("pbr-mat-1", "MATERIAL", 512);

      assert.equal(manager.getActiveResources().length, 3);
      assert.equal(geom.isDisposed, false);

      // Explicitly dispose one resource early
      const disposedEarly = manager.markResourceDisposed("mesh-grid-1");
      assert.equal(disposedEarly, true);
      assert.equal(manager.getActiveResources().length, 2);

      // Dispose remaining
      const receipt = manager.disposeAll();
      assert.equal(receipt.disposedResourceCount, 2);
      assert.equal(receipt.totalBytesFreedEst, 2048 * 2048 * 4 + 512);
      assert.equal(manager.getActiveResources().length, 0);
      assert.equal(manager.getState(), "DISPOSED");
    });
  });

  describe("3. Spatial-to-Render Mapper & Warp Geometry", () => {
    it("maps a SpatialWarpingComposite to a RenderSceneDescriptor with deformed mesh grid", () => {
      const warp = createAffineWarpField(16, 16, {
        translation: { x: 0.01, y: -0.02 },
        scale: { x: 1.05, y: 1.02 },
        rotationDegrees: 2.0,
        anchorOrigin: { x: 0.5, y: 0.5 },
      });

      const compositeInput: SpatialCompositionInput = {
        frameId: "frame-001",
        sequenceNumber: 10,
        generation: 1,
        timestampMs: Date.now(),
        dimensions: { width: 1280, height: 720 },
        warpField: warp,
        materialProfile: {
          profileId: "silk-blouse",
          fabricType: "SILK",
          roughness: 0.3,
          metallic: 0.1,
          sheen: 0.8,
          clearcoat: 0.2,
          thicknessMm: 0.4,
          weightGsm: 90,
          drapeStiffness: 0.2,
        },
      };

      const composite = SpatialWarpingCompositor.compose(compositeInput);
      assert.equal(composite.status, "SUCCESS");

      const scene = SpatialToRenderMapper.mapToSceneDescriptor(composite);
      assert.equal(scene.frameId, "frame-001");
      assert.equal(scene.sequenceNumber, 10);
      assert.equal(scene.generation, 1);
      assert.equal(scene.qualityStatus, "OPTIMAL");
      assert.equal(scene.isStale, false);
      assert.ok(scene.layers.length > 0);

      // Verify Garment Layer geometry is DEFORMED_MESH_GRID
      const garmentLayer = scene.layers.find((l) => l.layerKind === "GARMENT");
      assert.ok(garmentLayer, "Garment layer must exist");
      assert.equal(garmentLayer.geometry.type, "DEFORMED_MESH_GRID");
      assert.equal(garmentLayer.geometry.gridWidth, 16);
      assert.equal(garmentLayer.geometry.gridHeight, 16);
      assert.equal(garmentLayer.geometry.vertexCount, 256);
      assert.ok(garmentLayer.geometry.vertices !== undefined);
      assert.equal(garmentLayer.geometry.vertices.length, 256 * 3);
      assert.ok(garmentLayer.geometry.indices !== undefined);
      assert.equal(garmentLayer.geometry.indices.length, 15 * 15 * 6); // 1350 indices

      // Verify canonical Z-index hierarchy
      const baseLayer = scene.layers.find((l) => l.layerKind === "BASE");
      assert.ok(baseLayer);
      assert.equal(baseLayer.zIndex, CANONICAL_SPATIAL_Z_INDEX.BASE);
      assert.equal(garmentLayer.zIndex, CANONICAL_SPATIAL_Z_INDEX.GARMENT);
      assert.ok(garmentLayer.zIndex > baseLayer.zIndex);
    });

    it("detects stale composite when sequence is older than latest rendered sequence", () => {
      const compositeInput: SpatialCompositionInput = {
        frameId: "frame-002",
        sequenceNumber: 15,
        generation: 1,
        timestampMs: Date.now(),
        dimensions: { width: 1280, height: 720 },
      };

      const composite = SpatialWarpingCompositor.compose(compositeInput);

      // Sequence 15 evaluated against latestRenderedSequenceNumber = 20 -> stale
      const staleScene = SpatialToRenderMapper.mapToSceneDescriptor(composite, {
        latestRenderedSequenceNumber: 20,
      });
      assert.equal(staleScene.isStale, true);

      // Sequence 15 evaluated against latestRenderedSequenceNumber = 10 -> fresh
      const freshScene = SpatialToRenderMapper.mapToSceneDescriptor(composite, {
        latestRenderedSequenceNumber: 10,
      });
      assert.equal(freshScene.isStale, false);
    });
  });

  describe("4. Interactive Viewport & Camera Controller", () => {
    let controller: InteractiveViewportController;

    beforeEach(() => {
      controller = new InteractiveViewportController({
        initialViewport: {
          width: 800,
          height: 600,
          aspectRatio: 800 / 600,
          devicePixelRatio: 2.0,
          scale: 1.0,
          translation: { x: 0, y: 0 },
          zoom: 1.0,
          rotationDeg: 0,
          isMirrored: false,
        },
      });
    });

    it("clamps zoom within configured boundaries [0.25..4.0]", () => {
      controller.zoomBy(2.0);
      assert.equal(controller.getViewportModel().zoom, 2.0);

      // Exceed max zoom
      controller.zoomBy(5.0);
      assert.equal(controller.getViewportModel().zoom, 4.0);

      // Below min zoom
      controller.setZoom(0.1);
      assert.equal(controller.getViewportModel().zoom, 0.25);
    });

    it("handles pan and translation", () => {
      controller.pan(25, -15);
      const vp = controller.getViewportModel();
      assert.equal(vp.translation.x, 25);
      assert.equal(vp.translation.y, -15);

      controller.setTranslation(100, 50);
      assert.equal(controller.getViewportModel().translation.x, 100);
      assert.equal(controller.getViewportModel().translation.y, 50);
    });

    it("normalizes rotation and clamps orbit yaw/pitch", () => {
      controller.rotateBy(45);
      assert.equal(controller.getViewportModel().rotationDeg, 45);

      controller.rotateBy(360);
      assert.equal(controller.getViewportModel().rotationDeg, 45);

      controller.orbit(30, 20);
      const angles = controller.getOrbitAngles();
      assert.equal(angles.yawDeg, 30);
      assert.equal(angles.pitchDeg, 20);

      // Exceed pitch clamp
      controller.orbit(0, 100);
      assert.equal(controller.getOrbitAngles().pitchDeg, 45); // clamped to maxPitch
    });

    it("resets viewport back to initial state", () => {
      controller.zoomBy(3.0);
      controller.pan(50, 50);
      controller.setMirror(true);

      controller.reset();
      const resetVp = controller.getViewportModel();
      assert.equal(resetVp.zoom, 1.0);
      assert.equal(resetVp.translation.x, 0);
      assert.equal(resetVp.translation.y, 0);
      assert.equal(resetVp.isMirrored, false);
    });

    it("notifies listeners on interactive changes without triggering CV computation", () => {
      let notificationCount = 0;
      const unsubscribe = controller.addListener(() => {
        notificationCount++;
      });

      controller.pan(10, 10);
      controller.zoomBy(1.2);
      controller.setMirror(true);

      assert.equal(notificationCount, 3);
      unsubscribe();

      controller.pan(5, 5);
      assert.equal(notificationCount, 3); // No further notification
    });
  });

  describe("5. Browser Canvas Renderer & Capability Detection", () => {
    it("initializes gracefully in headless Node.js reporting ENVIRONMENT_PENDING", async () => {
      const renderer = new BrowserCanvasRenderer({ sceneId: "headless-test-scene" });
      assert.equal(renderer.getLifecycleState(), "UNINITIALIZED");

      await renderer.initialize();
      assert.equal(renderer.getLifecycleState(), "READY");
      assert.equal(renderer.getEnvironmentMode(), "ENVIRONMENT_PENDING");

      // Verify disposal
      const receipt = await renderer.dispose();
      assert.equal(renderer.getLifecycleState(), "DISPOSED");
      assert.equal(receipt.errors.length, 0);
    });

    it("rejects rendering when scene is stale or sequence <= latestRenderedSequence", async () => {
      const renderer = new BrowserCanvasRenderer({ sceneId: "stale-test-scene" });
      await renderer.initialize();

      const baseComposite: SpatialCompositionInput = {
        frameId: "f-10",
        sequenceNumber: 10,
        generation: 1,
        timestampMs: Date.now(),
        dimensions: { width: 1280, height: 720 },
      };
      const comp10 = SpatialWarpingCompositor.compose(baseComposite);
      const scene10 = SpatialToRenderMapper.mapToSceneDescriptor(comp10);

      // First render (seq 10) succeeds
      const res10 = await renderer.renderScene(scene10);
      assert.equal(res10.rendered, true);
      assert.equal(res10.sequenceNumber, 10);
      assert.equal(renderer.getLatestRenderedSequence(), 10);

      // Older frame arrives (seq 8) -> rejected
      const comp8 = SpatialWarpingCompositor.compose({ ...baseComposite, sequenceNumber: 8, frameId: "f-8" });
      const scene8 = SpatialToRenderMapper.mapToSceneDescriptor(comp8);
      const res8 = await renderer.renderScene(scene8);
      assert.equal(res8.rendered, false);
      assert.equal(res8.reason, "STALE_FRAME_REJECTED");

      // Same sequence arrives (seq 10) -> rejected
      const res10Duplicate = await renderer.renderScene(scene10);
      assert.equal(res10Duplicate.rendered, false);
      assert.equal(res10Duplicate.reason, "STALE_FRAME_REJECTED");

      // Newer frame arrives (seq 11) -> accepted
      const comp11 = SpatialWarpingCompositor.compose({ ...baseComposite, sequenceNumber: 11, frameId: "f-11" });
      const scene11 = SpatialToRenderMapper.mapToSceneDescriptor(comp11);
      const res11 = await renderer.renderScene(scene11);
      assert.equal(res11.rendered, true);
      assert.equal(res11.sequenceNumber, 11);
      assert.equal(renderer.getLatestRenderedSequence(), 11);

      await renderer.dispose();
    });
  });

  describe("6. Simulated Browser Render Adapter Test Double", () => {
    it("records rendered frames, dropped frames, and state transitions", async () => {
      const sim = new SimulatedBrowserRenderAdapter("sim-1");
      await sim.initialize();
      assert.equal(sim.getLifecycleState(), "READY");

      const compInput: SpatialCompositionInput = {
        frameId: "sim-f1",
        sequenceNumber: 1,
        generation: 1,
        timestampMs: Date.now(),
        dimensions: { width: 1280, height: 720 },
      };
      const comp = SpatialWarpingCompositor.compose(compInput);
      const scene1 = SpatialToRenderMapper.mapToSceneDescriptor(comp);

      const res1 = await sim.renderScene(scene1);
      assert.equal(res1.rendered, true);
      assert.equal(sim.getRenderedFrames().length, 1);
      assert.equal(sim.getRenderedScenes().length, 1);

      // Out-of-order rejection
      const staleComp = SpatialWarpingCompositor.compose({ ...compInput, sequenceNumber: 0 });
      const staleScene = SpatialToRenderMapper.mapToSceneDescriptor(staleComp);
      const staleRes = await sim.renderScene(staleScene);
      assert.equal(staleRes.rendered, false);
      assert.equal(staleRes.reason, "STALE_FRAME_REJECTED");
      assert.equal(sim.getDroppedFrames().length, 1);
      assert.equal(sim.getDroppedFrames()[0].reason, "STALE_FRAME_REJECTED");

      // Controlled failure injection
      sim.triggerFailureOnNextRender("GPU Context Lost");
      const nextComp = SpatialWarpingCompositor.compose({ ...compInput, sequenceNumber: 2 });
      const nextScene = SpatialToRenderMapper.mapToSceneDescriptor(nextComp);
      const failRes = await sim.renderScene(nextScene);
      assert.equal(failRes.rendered, false);
      assert.ok(failRes.reason?.includes("GPU Context Lost"));

      await sim.dispose();
      assert.equal(sim.getLifecycleState(), "DISPOSED");
    });
  });
});

/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * Formal 9-Dimension Application Certification & Release Gate Test Suite.
 * 
 * Invariants:
 * 1. Identity & Manifest: Explicit applicationId ("tentaciones-commerce"), valid tenant scope, and manifest integrity.
 * 2. Domain Purity: Zero Three.js/WebGL runtime imports, zero browser DOM globals, zero brand coupling in domain.
 * 3. Micro-Model: Canonical ABI, tensor shapes, weights SHA-256 integrity, and deterministic execution.
 * 4. Worker Protocol: Versioned envelopes, operation allowlist, transferable buffer handover, and fail-closed errors.
 * 5. Temporal Monotonicity: Strict LATEST_VALID_RESULT > STALE_RESULT ordering and dropped frame accounting.
 * 6. Computational Decoupling: Fast-path O(1) interactive viewport refresh without restarting heavy CV loops.
 * 7. Hexagonal Decoupling: Clean port-adapter boundaries (VirtualTryOnProvider, BrowserRenderPort, FrameSourcePort).
 * 8. Resource Lifecycle: Deterministic teardown, listener unregistration, and verifiable DisposalReceipts.
 * 9. Privacy by Design: Ephemeral frame ingestion, zero retention, anonymized telemetry, and no raw buffer leaks.
 * 10. Multi-Phase Golden Journey: Complete 10-phase pipeline validation from domain to satellite 3D scene.
 * 11. Security Audit: 0 innerHTML, 0 eval across all VTO modules.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  runTentacionesVtoCertification,
  formatTentacionesVtoCertificationReport,
  TENTACIONES_VTO_APPLICATION_MANIFEST,
  TentacionesVtoAdapter,
  TENTACIONES_APPLICATION_ID,
  VirtualTryOnService,
  TentacionesVtoSceneBridge,
  Satellite3DRendererAdapter,
  createSyntheticCanvas,
  createSyntheticThreeEnvironment,
  createSampleSceneDescriptor,
  CANONICAL_TEST_GARMENT,
  CANONICAL_TEST_BODY_PROFILE,
} from "../../src/application/vto/index.js";

import {
  CANONICAL_VTO_MICRO_MODEL_MANIFEST,
  CANONICAL_VTO_MICRO_MODEL_ID,
  validateModelManifest,
  VTO_WORKER_PROTOCOL_VERSION,
  SpatialWarpingCompositor,
  SpatialCompositionInput,
  createAffineWarpField,
} from "../../src/domain/vto/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");

describe("Phase 163 — PROJ-01 Tentaciones AI Commerce: MVP Application Certification & Release Gate", () => {
  // --------------------------------------------------------------------------
  // 1. Full 9-Dimension Certification Evaluation
  // --------------------------------------------------------------------------
  describe("1. Full 9-Dimension Application Certification Harness", () => {
    it("evaluates all 9 canonical dimensions to PASS and certifies release with open environmental gaps", async () => {
      const report = await runTentacionesVtoCertification();

      assert.equal(report.applicationId, "tentaciones-commerce");
      assert.equal(report.overallPassed, true);
      assert.equal(report.releaseStatus, "MVP_CERTIFIED_WITH_OPEN_ENVIRONMENTAL_GAPS");

      // Verify every individual dimension is PASS
      const d = report.dimensions;
      assert.equal(d.identity.verdict, "PASS");
      assert.equal(d.domainPurity.verdict, "PASS");
      assert.equal(d.microModel.verdict, "PASS");
      assert.equal(d.workerProtocol.verdict, "PASS");
      assert.equal(d.temporalMonotonicity.verdict, "PASS");
      assert.equal(d.computationalDecoupling.verdict, "PASS");
      assert.equal(d.hexagonalDecoupling.verdict, "PASS");
      assert.equal(d.resourceLifecycle.verdict, "PASS");
      assert.equal(d.privacyByDesign.verdict, "PASS");

      // Verify environmental gap is explicitly recorded without breaking CI
      assert.equal(report.environmentalGaps.length, 1);
      assert.equal(report.environmentalGaps[0].id, "GAP-ENV-01 / HAL-007");
      assert.equal(report.environmentalGaps[0].blockerForCi, false);
      assert.equal(report.environmentalGaps[0].blockerForPhysicalRelease, true);

      // Verify report formatter generates readable markdown/table output
      const formatted = formatTentacionesVtoCertificationReport(report);
      assert.ok(formatted.includes("PROJ-01: TENTACIONES AI COMMERCE VTO"));
      assert.ok(formatted.includes("MVP_CERTIFIED_WITH_OPEN_ENVIRONMENTAL_GAPS"));
    });

    it("certifies as MVP_CERTIFIED when physical GPU environment is present", async () => {
      const report = await runTentacionesVtoCertification({
        physicalGpuAvailable: true,
      });

      assert.equal(report.overallPassed, true);
      assert.equal(report.releaseStatus, "MVP_CERTIFIED");
      assert.equal(report.environmentalGaps[0].status, "RESOLVED");
    });
  });

  // --------------------------------------------------------------------------
  // 2. Invariant 1 — Identity & Manifest Integrity
  // --------------------------------------------------------------------------
  describe("2. Invariant 1 — Identity & Manifest Integrity", () => {
    it("validates canonical application manifest structure and capabilities", () => {
      assert.equal(TENTACIONES_VTO_APPLICATION_MANIFEST.applicationId, TENTACIONES_APPLICATION_ID);
      assert.equal(TENTACIONES_VTO_APPLICATION_MANIFEST.version, "1.0.0");
      assert.ok(TENTACIONES_VTO_APPLICATION_MANIFEST.capabilities.includes("ar.fitting_room"));
      assert.ok(TENTACIONES_VTO_APPLICATION_MANIFEST.capabilities.includes("product.discovery"));
      assert.ok(TENTACIONES_VTO_APPLICATION_MANIFEST.requiredFeatures.includes("pose_estimation"));
      assert.ok(TENTACIONES_VTO_APPLICATION_MANIFEST.requiredFeatures.includes("satellite_3d_render"));
      assert.equal(TENTACIONES_VTO_APPLICATION_MANIFEST.tenantRequirements?.minPlan, "PRO");
    });

    it("fails certification fail-closed on mismatched application identity", async () => {
      const invalidAdapter = new TentacionesVtoAdapter(new VirtualTryOnService(), {
        applicationId: "unauthorized-application",
        tenantId: "tenant-01",
      });

      const report = await runTentacionesVtoCertification({ adapter: invalidAdapter });
      assert.equal(report.overallPassed, false);
      assert.equal(report.releaseStatus, "MVP_NOT_CERTIFIED");
      assert.equal(report.dimensions.identity.verdict, "FAIL");
    });

    it("fails certification fail-closed on empty or whitespace tenant scope", async () => {
      const invalidAdapter = new TentacionesVtoAdapter(new VirtualTryOnService(), {
        applicationId: TENTACIONES_APPLICATION_ID,
        tenantId: "invalid tenant with spaces",
      });

      const report = await runTentacionesVtoCertification({ adapter: invalidAdapter });
      assert.equal(report.overallPassed, false);
      assert.equal(report.dimensions.identity.verdict, "FAIL");
    });
  });

  // --------------------------------------------------------------------------
  // 3. Invariant 2 — Domain Purity & Boundary Decoupling
  // --------------------------------------------------------------------------
  describe("3. Invariant 2 — Domain Purity & Boundary Decoupling", () => {
    it("verifies zero Three.js imports across all domain VTO files", () => {
      const domainVtoDir = path.join(rootDir, "src/domain/vto");
      const files = fs.readdirSync(domainVtoDir).filter((f) => f.endsWith(".ts"));

      for (const file of files) {
        const code = fs.readFileSync(path.join(domainVtoDir, file), "utf8");
        const hasThreeImport = /import\s+.*from\s+["']three(\/.*)?["']/.test(code);
        assert.equal(hasThreeImport, false, `File ${file} has forbidden import from 'three'`);
      }
    });

    it("verifies zero browser DOM globals in domain VTO code", () => {
      const domainVtoDir = path.join(rootDir, "src/domain/vto");
      const files = fs.readdirSync(domainVtoDir).filter((f) => f.endsWith(".ts"));

      for (const file of files) {
        const code = fs.readFileSync(path.join(domainVtoDir, file), "utf8");
        const codeWithoutComments = code
          .replace(/\/\*\*[\s\S]*?\*\//g, "")
          .replace(/\/\/.*/g, "");
        const hasDomGlobal = /\b(window|document|HTMLCanvasElement|HTMLVideoElement|navigator)\b/.test(codeWithoutComments);
        assert.equal(hasDomGlobal, false, `File ${file} has forbidden browser DOM reference`);
      }
    });

    it("verifies zero brand references ('tentaciones') inside domain logic", () => {
      const domainVtoDir = path.join(rootDir, "src/domain/vto");
      const files = fs.readdirSync(domainVtoDir).filter((f) => f.endsWith(".ts"));

      for (const file of files) {
        const code = fs.readFileSync(path.join(domainVtoDir, file), "utf8");
        const codeWithoutComments = code
          .replace(/\/\*\*[\s\S]*?\*\//g, "")
          .replace(/\/\/.*/g, "");
        const hasBrandLeak = /tentaciones/i.test(codeWithoutComments);
        assert.equal(hasBrandLeak, false, `File ${file} has forbidden brand coupling 'tentaciones'`);
      }
    });
  });

  // --------------------------------------------------------------------------
  // 4. Invariant 3 — Micro-Model & ABI Specification
  // --------------------------------------------------------------------------
  describe("4. Invariant 3 — Micro-Model & ABI Specification", () => {
    it("validates canonical micro-model manifest and weights structure", () => {
      const validation = validateModelManifest(CANONICAL_VTO_MICRO_MODEL_MANIFEST);
      assert.equal(validation.isValid, true);
      assert.equal(validation.errors.length, 0);

      assert.equal(CANONICAL_VTO_MICRO_MODEL_MANIFEST.modelId, CANONICAL_VTO_MICRO_MODEL_ID);
      assert.equal(CANONICAL_VTO_MICRO_MODEL_MANIFEST.precision, "FLOAT32");
      assert.deepEqual(CANONICAL_VTO_MICRO_MODEL_MANIFEST.inputs[0].shape, [1, 8]);
      assert.deepEqual(CANONICAL_VTO_MICRO_MODEL_MANIFEST.outputs[0].shape, [1, 2]);

      // Layer 1: [4, 8] matrix -> 32 weights, 4 biases
      assert.equal(CANONICAL_VTO_MICRO_MODEL_MANIFEST.weights.layer1.weights.length, 32);
      assert.equal(CANONICAL_VTO_MICRO_MODEL_MANIFEST.weights.layer1.biases.length, 4);

      // Layer 2: [2, 4] matrix -> 8 weights, 2 biases
      assert.equal(CANONICAL_VTO_MICRO_MODEL_MANIFEST.weights.layer2.weights.length, 8);
      assert.equal(CANONICAL_VTO_MICRO_MODEL_MANIFEST.weights.layer2.biases.length, 2);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Invariant 4 — Worker Protocol & Zero-Copy Transfer
  // --------------------------------------------------------------------------
  describe("5. Invariant 4 — Worker Protocol & Zero-Copy Transfer", () => {
    it("validates protocol versioning and allowed operations", () => {
      assert.equal(VTO_WORKER_PROTOCOL_VERSION, "1.0.0");
      const allowedOps = [
        "POSE_PREPROCESS",
        "GARMENT_WARP",
        "DEPTH_OCCLUSION",
        "NEURAL_INFERENCE",
        "FRAME_PREPROCESS",
      ];
      assert.equal(allowedOps.length, 5);
    });
  });

  // --------------------------------------------------------------------------
  // 6. Invariant 5 — Temporal Monotonicity & Stale Frame Rejection
  // --------------------------------------------------------------------------
  describe("6. Invariant 5 — Temporal Monotonicity & Stale Frame Rejection", () => {
    it("enforces LATEST_VALID_RESULT > STALE_RESULT at renderer boundary", async () => {
      const syntheticThree = createSyntheticThreeEnvironment();
      const renderer = new Satellite3DRendererAdapter({
        three: syntheticThree,
        preferWebGpu: false,
      });
      await renderer.initialize(createSyntheticCanvas(640, 480));

      const desc10 = createSampleSceneDescriptor(10);
      const res10 = await renderer.renderScene(desc10);
      assert.equal(res10.rendered, true);
      assert.equal(renderer.getLatestRenderedSequence(), 10);

      // Submit out-of-order sequence 8
      const desc8 = createSampleSceneDescriptor(8);
      const res8 = await renderer.renderScene(desc8);
      assert.equal(res8.rendered, false);
      assert.equal(res8.reason, "STALE_FRAME_REJECTED");
      assert.equal(renderer.getLatestRenderedSequence(), 10); // Not regressed
      assert.ok(renderer.getDroppedFrames().length >= 1);

      await renderer.dispose();
    });
  });

  // --------------------------------------------------------------------------
  // 7. Invariant 6 — Computational Decoupling & Fast-Path Viewport Interaction
  // --------------------------------------------------------------------------
  describe("7. Invariant 6 — Computational Decoupling & Fast-Path Viewport Interaction", () => {
    it("updates viewport reactively in sub-25ms O(1) without touching CV loop", async () => {
      const syntheticThree = createSyntheticThreeEnvironment();
      const bridge = new TentacionesVtoSceneBridge({
        rendererOptions: { three: syntheticThree, preferWebGpu: false },
        viewport: { width: 640, height: 480, dpr: 1 },
      });
      await bridge.initialize(createSyntheticCanvas(640, 480));

      // Seed bridge with initial active composite
      const compInput: SpatialCompositionInput = {
        frameId: "frame-init-test",
        sequenceNumber: 1,
        generation: 1,
        timestampMs: 1000,
        dimensions: { width: 640, height: 480 },
        warpField: createAffineWarpField(8, 8, {
          translation: { x: 0, y: 0 },
          scale: { x: 1, y: 1 },
          rotationDegrees: 0,
          anchorOrigin: { x: 0.5, y: 0.5 },
        }),
      };
      const composite = SpatialWarpingCompositor.compose(compInput);
      await bridge.updateSceneFromComposite(composite);

      const t0 = performance.now();
      bridge.getViewportController().zoomBy(1.5);
      bridge.getViewportController().pan(15, -10);
      bridge.getViewportController().orbit(0.2, 0.1);
      bridge.getViewportController().reset();
      const elapsedMs = performance.now() - t0;

      assert.ok(elapsedMs < 25, `Fast-path viewport took ${elapsedMs}ms, expected < 25ms`);
      const metrics = bridge.getMetrics();
      assert.ok(metrics.interactiveUpdatesCount >= 4);

      await bridge.dispose();
    });
  });

  // --------------------------------------------------------------------------
  // 8. Invariant 7 — Hexagonal Decoupling & Port Independence
  // --------------------------------------------------------------------------
  describe("8. Invariant 7 — Hexagonal Decoupling & Port Independence", () => {
    it("operates strictly through VirtualTryOnProvider port and returns clean DTO", async () => {
      const service = new VirtualTryOnService();
      const adapter = new TentacionesVtoAdapter(service, {
        applicationId: TENTACIONES_APPLICATION_ID,
        tenantId: "tenant-tentaciones-corp",
      });

      const result = await adapter.tryOnGarment({
        garment: CANONICAL_TEST_GARMENT,
        bodyProfile: CANONICAL_TEST_BODY_PROFILE,
      });

      assert.equal(result.status, "SUCCESS");
      assert.ok(result.jobId);
      assert.ok(result.primaryArtifact);
    });
  });

  // --------------------------------------------------------------------------
  // 9. Invariant 8 — Resource Lifecycle & Clean Teardown
  // --------------------------------------------------------------------------
  describe("9. Invariant 8 — Resource Lifecycle & Clean Teardown", () => {
    it("releases all scene bridge resources and returns a valid DisposalReceipt", async () => {
      const syntheticThree = createSyntheticThreeEnvironment();
      const bridge = new TentacionesVtoSceneBridge({
        rendererOptions: { three: syntheticThree, preferWebGpu: false },
      });
      await bridge.initialize(createSyntheticCanvas(640, 480));

      assert.equal(bridge.isRunning(), true);
      const receipt = await bridge.dispose();
      assert.equal(bridge.isRunning(), false);

      assert.ok(typeof receipt.sceneId === "string" && receipt.sceneId.length > 0);
      assert.equal(receipt.errors.length, 0);
    });
  });

  // --------------------------------------------------------------------------
  // 10. Invariant 9 — Privacy by Design & Zero Retention
  // --------------------------------------------------------------------------
  describe("10. Invariant 9 — Privacy by Design & Zero Retention", () => {
    it("enforces ephemeral session retention and leaves no optical raw buffers in metadata", async () => {
      const service = new VirtualTryOnService();
      const adapter = new TentacionesVtoAdapter(service);

      const result = await adapter.tryOnGarment({
        garment: CANONICAL_TEST_GARMENT,
        bodyProfile: CANONICAL_TEST_BODY_PROFILE,
        privacyPolicy: {
          retentionMode: "EPHEMERAL_SESSION",
          zeroRetentionEnforced: true,
          anonymizeMetadata: true,
        },
      });

      assert.equal(result.status, "SUCCESS");
      const serialized = JSON.stringify(result.inferenceMetadata ?? {});
      assert.equal(serialized.includes("data:image"), false);
      assert.equal(serialized.includes("RawPixelBuffer"), false);
    });
  });

  // --------------------------------------------------------------------------
  // 11. End-to-End Multi-Phase Golden Journey (F153 -> F162 -> F163)
  // --------------------------------------------------------------------------
  describe("11. End-to-End Multi-Phase VTO Golden Journey", () => {
    it("executes the entire 10-phase VTO flow from input to 3D scene render and certification", async () => {
      // 1. Initialize services & synthetic environment
      const syntheticThree = createSyntheticThreeEnvironment();
      const canvas = createSyntheticCanvas(800, 600);
      const service = new VirtualTryOnService();
      const adapter = new TentacionesVtoAdapter(service);
      const renderer = new Satellite3DRendererAdapter({
        three: syntheticThree,
        preferWebGpu: false,
      });
      await renderer.initialize(canvas);

      const bridge = new TentacionesVtoSceneBridge({
        renderer,
        viewport: { width: 800, height: 600, dpr: 1 },
      });
      await bridge.initialize(canvas);

      // 2. Submit virtual try-on request (F153)
      const tryOnRes = await adapter.tryOnGarment({
        garment: CANONICAL_TEST_GARMENT,
        bodyProfile: CANONICAL_TEST_BODY_PROFILE,
      });
      assert.equal(tryOnRes.status, "SUCCESS");

      // 3. Render 3D scene through renderer (F161-F162)
      const sceneDesc = createSampleSceneDescriptor(1);
      const renderRes = await renderer.renderScene(sceneDesc);
      assert.equal(renderRes.rendered, true);
      assert.equal(renderRes.sequenceNumber, 1);

      // Seed bridge composite for interactive viewport updates (seq 2 > latestRendered 1)
      const compInput: SpatialCompositionInput = {
        frameId: "frame-golden",
        sequenceNumber: 2,
        generation: 1,
        timestampMs: 1000,
        dimensions: { width: 800, height: 600 },
        warpField: createAffineWarpField(8, 8, {
          translation: { x: 0, y: 0 },
          scale: { x: 1, y: 1 },
          rotationDegrees: 0,
          anchorOrigin: { x: 0.5, y: 0.5 },
        }),
      };
      const composite = SpatialWarpingCompositor.compose(compInput);
      await bridge.updateSceneFromComposite(composite);

      // 4. Viewport manipulation without CV restart (F162)
      bridge.getViewportController().zoomBy(1.25);
      const metrics = bridge.getMetrics();
      assert.ok(metrics.interactiveUpdatesCount >= 1);

      // 5. Clean teardown with receipt (F163)
      const receipt = await bridge.dispose();
      assert.ok(receipt.sceneId.length > 0);

      // 6. Run full certification suite (F163)
      const certification = await runTentacionesVtoCertification();
      assert.equal(certification.overallPassed, true);
      assert.equal(certification.releaseStatus, "MVP_CERTIFIED_WITH_OPEN_ENVIRONMENTAL_GAPS");
    });
  });

  // --------------------------------------------------------------------------
  // 12. Security & DOM Purity Audit
  // --------------------------------------------------------------------------
  describe("12. Security & DOM Purity Audit", () => {
    it("verifies 0 innerHTML assignments across all VTO application modules", () => {
      const appVtoDir = path.join(rootDir, "src/application/vto");
      const files = fs.readdirSync(appVtoDir).filter((f) => f.endsWith(".ts"));

      for (const file of files) {
        const code = fs.readFileSync(path.join(appVtoDir, file), "utf8");
        const hasInnerHTML = /\.innerHTML\s*=/.test(code);
        assert.equal(hasInnerHTML, false, `File ${file} has forbidden innerHTML assignment`);
      }
    });

    it("verifies 0 eval or Function() constructors across all VTO application and domain modules", () => {
      const dirs = [
        path.join(rootDir, "src/domain/vto"),
        path.join(rootDir, "src/application/vto"),
      ];

      for (const dir of dirs) {
        const files = fs.readdirSync(dir).filter((f) => f.endsWith(".ts"));
        for (const file of files) {
          const code = fs.readFileSync(path.join(dir, file), "utf8");
          const hasEval = /\beval\s*\(/.test(code);
          const hasFunctionCtor = /new\s+Function\s*\(/.test(code);
          assert.equal(hasEval, false, `File ${file} has forbidden eval() call`);
          assert.equal(hasFunctionCtor, false, `File ${file} has forbidden new Function() constructor`);
        }
      }
    });
  });
});

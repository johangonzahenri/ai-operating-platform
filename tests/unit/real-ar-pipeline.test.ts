import test from "node:test";
import assert from "node:assert/strict";
import { ArAssetRegistry } from "../../src/application/platform/ar-asset-registry.js";
import { VirtualTryonEngine } from "../../src/infrastructure/media/virtual-tryon-provider.js";

test("Prompt 74 - AR Asset Registry: seeds default assets with valid URN and SemVer", () => {
  const registry = new ArAssetRegistry();
  const apparel = registry.listByCategory("apparel");
  assert.ok(apparel.length >= 1);

  const dress = registry.get("urn:tentaciones:ar:apparel:silk-evening-dress");
  assert.ok(dress);
  assert.equal(dress?.version, "1.0.0");
  assert.equal(dress?.formats.includes("glb"), true);
  assert.equal(dress?.formats.includes("usdz"), true);
  assert.ok(dress?.boundingBox.heightMeters > 1.0);
  assert.ok(dress?.sha256Checksum.length === 64);
});

test("Prompt 74 - AR Asset Registry: rejects invalid URN and non-SemVer registrations", () => {
  const registry = new ArAssetRegistry();
  assert.throws(
    () =>
      registry.register({
        urn: "invalid-format-urn",
        version: "1.0.0",
        name: "Test Asset",
        category: "props",
        formats: ["glb"],
        primaryUri: "/test.glb",
        thumbnailUri: "/thumb.webp",
        boundingBox: { widthMeters: 1, heightMeters: 1, depthMeters: 1 },
        lods: [],
        sha256Checksum: "abc",
        metadata: {},
        tags: [],
      }),
    /Invalid AR Asset URN format/
  );
});

test("Prompt 74 - Virtual Try-On Engine: accurately computes body fit for standard presets", () => {
  const registry = new ArAssetRegistry();
  const dress = registry.get("urn:tentaciones:ar:apparel:silk-evening-dress")!;

  const novaMeasurements = VirtualTryonEngine.getPresetMeasurements("Nova");
  const analysisNova = VirtualTryonEngine.analyzeFit(novaMeasurements, dress);

  assert.equal(analysisNova.preset, "Nova");
  assert.ok(["S", "M"].includes(analysisNova.recommendedSize));
  assert.ok(analysisNova.fitIndex > 0.5 && analysisNova.fitIndex < 1.5);
  assert.ok(analysisNova.drapeComfort >= 0.7);

  const customTight = VirtualTryonEngine.analyzeFit(
    {
      heightCm: 175,
      chestBustCm: 120,
      waistCm: 105,
      hipsCm: 125,
      inseamCm: 82,
      shoulderWidthCm: 48,
    },
    dress
  );
  assert.ok(["XL", "XXL"].includes(customTight.recommendedSize));
  assert.equal(customTight.fitVerdict, "RECOMMEND_SIZE_UP");
});

test("Prompt 74 - Virtual Try-On Engine: resolves WebXR Experience Mode with fallback hierarchy", () => {
  const registry = new ArAssetRegistry();
  const dress = registry.get("urn:tentaciones:ar:apparel:silk-evening-dress")!;

  // 1. WebXR AR Capable device
  const modeWebXr = VirtualTryonEngine.resolveXrExperienceMode(
    { userAgent: "MetaQuest", isAppleIos: false, isAndroid: false, hasWebXrAr: true, hasWebGL2: true },
    dress
  );
  assert.equal(modeWebXr, "WebXR_AR_Session");

  // 2. Apple iOS device
  const modeIos = VirtualTryonEngine.resolveXrExperienceMode(
    { userAgent: "iPhone Safari", isAppleIos: true, isAndroid: false, hasWebXrAr: false, hasWebGL2: true },
    dress
  );
  assert.equal(modeIos, "QuickLook_USDZ");

  // 3. Android device
  const modeAndroid = VirtualTryonEngine.resolveXrExperienceMode(
    { userAgent: "Chrome Android", isAppleIos: false, isAndroid: true, hasWebXrAr: false, hasWebGL2: true },
    dress
  );
  assert.equal(modeAndroid, "SceneViewer_GLB");

  // 4. Desktop WebGL2 browser
  const modeDesktop = VirtualTryonEngine.resolveXrExperienceMode(
    { userAgent: "Desktop Chrome", isAppleIos: false, isAndroid: false, hasWebXrAr: false, hasWebGL2: true },
    dress
  );
  assert.equal(modeDesktop, "Interactive_3D_Canvas");
});

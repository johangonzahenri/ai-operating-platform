import assert from "node:assert/strict";
import test from "node:test";
import { createPlatform } from "../../src/interfaces/composition.js";
import { PlatformService } from "../../src/platform/api/platform-service.js";
import { createHttpServer } from "../../src/platform/api/http-router.js";
import { createPlatformClient } from "../../src/platform-client/index.js";
import {
  TentacionesPlatformAdapter,
  TENTACIONES_APPLICATION,
} from "../../src/application/platform/tentaciones-platform-adapter.js";
import {
  parseAndValidateUrn,
  isValidSemVer,
  recommendSize,
  AR_PROFILES,
} from "../../src/application/platform/ar-fitting-room.js";
import type { AddressInfo } from "node:net";

test("Prompt 64 - AR Domain: Asset URN grammar and SemVer governance validation", () => {
  // Valid URNs
  const validFootwear = parseAndValidateUrn("urn:tentaciones:ar:footwear:runner-black-pro");
  assert.ok(validFootwear);
  assert.equal(validFootwear.category, "footwear");
  assert.equal(validFootwear.productSlug, "runner-black-pro");

  const validApparel = parseAndValidateUrn("urn:tentaciones:ar:apparel:jacket-leather-black");
  assert.ok(validApparel);
  assert.equal(validApparel.category, "apparel");
  assert.equal(validApparel.productSlug, "jacket-leather-black");

  // Invalid URNs
  assert.equal(parseAndValidateUrn("urn:tentaciones:invalid:runner-black-pro"), null);
  assert.equal(parseAndValidateUrn("urn:other:ar:footwear:runner-black-pro"), null);
  assert.equal(parseAndValidateUrn("not-a-urn"), null);

  // SemVer validation
  assert.equal(isValidSemVer("v1.0.0"), true);
  assert.equal(isValidSemVer("1.2.3"), true);
  assert.equal(isValidSemVer("2.0.0-beta.1"), true);
  assert.equal(isValidSemVer("invalid-version"), false);
  assert.equal(isValidSemVer("1.0"), false);
});

test("Prompt 64 - AR Sizing Engine: Deterministic size recommendation across avatar profiles", () => {
  // 1. Footwear sizing test
  const shoeRecNova = recommendSize({ category: "footwear", footLengthCm: 25.0 });
  assert.equal(shoeRecNova.recommendedSize, "39");
  assert.equal(shoeRecNova.appliedCategory, "footwear");
  assert.ok(shoeRecNova.confidence >= 0.9);

  const shoeRecMateo = recommendSize({ category: "footwear", footLengthCm: 28.5 });
  assert.equal(shoeRecMateo.recommendedSize, "42");

  // 2. Apparel sizing test with profiles
  const apparelNova = recommendSize({ category: "apparel", profile: "Nova" });
  assert.equal(apparelNova.recommendedSize, "S");
  assert.equal(AR_PROFILES.Nova.build, "Athletic / Slim");

  const apparelSora = recommendSize({ category: "apparel", profile: "Sora" });
  assert.equal(apparelSora.recommendedSize, "M");
  assert.equal(AR_PROFILES.Sora.build, "Standard / Regular");

  const apparelMateo = recommendSize({ category: "apparel", profile: "Mateo" });
  assert.equal(apparelMateo.recommendedSize, "L");
  assert.equal(AR_PROFILES.Mateo.build, "Broad / Plus");
});

test("Prompt 64 - AR Virtual Fitting Room: Live resolution via Platform API", async (t) => {
  const platform = createPlatform();
  const service = new PlatformService({
    tasks: platform.tasks,
    executions: platform.executions,
    audit: platform.audit,
    metrics: platform.metrics,
    tools: platform.tools,
    models: platform.modelRegistry,
    agents: platform.agents,
    agentService: platform.agentService,
    submitTask: platform.submitTask,
    executeOrchestration: platform.executeOrchestration,
    eventStore: platform.eventStore,
  });

  const server = createHttpServer(service);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  t.after(() => server.close());

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const client = createPlatformClient({
    baseUrl,
    apiPrefix: "/api/platform/v1",
    apiKey: "key-tentaciones.secret-tentaciones-live",
    defaultHeaders: {
      "X-Tenant-ID": "tenant-tentaciones",
    },
  });

  const adapter = new TentacionesPlatformAdapter({
    client,
    applicationVersion: "1.4.0",
    applicationId: TENTACIONES_APPLICATION,
    tenantId: "tenant-tentaciones",
  });

  const traceId = "trace-ar-fit-001";
  const fitResolution = await adapter.resolveFittingRoom(
    {
      assetUrn: "urn:tentaciones:ar:footwear:runner-black-pro",
      profile: "Nova",
      version: "v1.0.0",
    },
    traceId
  );

  assert.equal(fitResolution.status, "COMPLETED");
  assert.equal(fitResolution.arStatus, "AR_AVAILABLE");
  assert.equal(fitResolution.source, "AI Operating Platform");
  assert.equal(fitResolution.profile, "Nova");
  assert.equal(fitResolution.category, "footwear");
  assert.equal(fitResolution.productSlug, "runner-black-pro");
  assert.equal(fitResolution.fallbackMode, "NONE");
  assert.ok(fitResolution.previewUrl);
  assert.ok(fitResolution.previewUrl.includes("runner-black-pro"));
});

test("Prompt 64 - AR Graceful Fallback: Malformed URN and version degrades safely to 2D view", async () => {
  const adapter = new TentacionesPlatformAdapter({
    applicationVersion: "1.4.0",
    client: {
      tasks: {
        async create() { throw new Error("Should not be called"); },
        async get() { throw new Error("Should not be called"); },
        async execute() { throw new Error("Should not be called"); },
      },
      executions: {
        async get() { throw new Error("Should not be called"); },
        async events() { throw new Error("Should not be called"); },
      },
      health: {
        async get() {
          return { status: "HEALTHY" } as never;
        },
      },
    },
  });

  // Invalid URN
  const resultInvalidUrn = await adapter.resolveFittingRoom({
    assetUrn: "invalid:urn:format",
    profile: "Sora",
    version: "v1.0.0",
  });

  assert.equal(resultInvalidUrn.status, "COMPLETED");
  assert.equal(resultInvalidUrn.arStatus, "AR_ASSET_INVALID");
  assert.equal(resultInvalidUrn.fallbackMode, "STANDARD_2D_VIEW");
  assert.ok(resultInvalidUrn.error);

  // Invalid SemVer
  const resultInvalidVersion = await adapter.resolveFittingRoom({
    assetUrn: "urn:tentaciones:ar:apparel:jacket-pro",
    profile: "Sora",
    version: "not-a-semver",
  });

  assert.equal(resultInvalidVersion.status, "COMPLETED");
  assert.equal(resultInvalidVersion.arStatus, "AR_ASSET_OUTDATED");
  assert.equal(resultInvalidVersion.fallbackMode, "STANDARD_2D_VIEW");
  assert.ok(resultInvalidVersion.error);
});
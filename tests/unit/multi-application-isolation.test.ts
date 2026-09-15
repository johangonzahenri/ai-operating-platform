import test from "node:test";
import assert from "node:assert/strict";
import { TentacionesCommerceEngine } from "../../src/application/platform/tentaciones-commerce-engine.js";
import { VehiclePartsEngine } from "../../src/application/platform/vehicle-parts-engine.js";
import { PlatformService } from "../../src/platform/api/platform-service.js";
import { createPlatform } from "../../src/interfaces/composition.js";

function createMockPlatformService(): PlatformService {
  const platform = createPlatform();
  return new PlatformService({
    ...platform,
    models: platform.modelRegistry,
  });
}

test("Prompt 93 - Multi-Application Isolation: Tentaciones and Vehicle Parts maintain strict domain separation", () => {
  const fashionEngine = new TentacionesCommerceEngine();
  const autoEngine = new VehiclePartsEngine();

  // 1. Fashion catalog must not contain automotive parts
  const fashionProducts = fashionEngine.listProducts();
  assert.ok(fashionProducts.every((p) => p.category === "footwear" || p.category === "apparel" || p.category === "accessories"));
  assert.equal(fashionEngine.getProductById("part-brk-ty-01"), undefined);

  // 2. Auto catalog must not contain fashion items
  const autoParts = autoEngine.listParts();
  assert.ok(autoParts.every((p) => ["brakes", "filters", "ignition", "suspension", "fluids", "electrical"].includes(p.category)));
  const fashionInAuto = autoParts.find((p) => p.id === "prod-carbon-racer");
  assert.equal(fashionInAuto, undefined);

  // 3. Cart isolation
  const fashionCartId = "cart-fashion-001";
  const autoCartId = "cart-auto-001";

  fashionEngine.addToCart(fashionCartId, "PCR-BLK-40", 1);
  autoEngine.addToCart(autoCartId, "BRK-TY-018", 1);

  const fashionCart = fashionEngine.getOrCreateCart(fashionCartId);
  const autoCart = autoEngine.getOrCreateCart(autoCartId);

  assert.equal(fashionCart.items.length, 1);
  assert.equal(fashionCart.items[0]?.sku, "PCR-BLK-40");

  assert.equal(autoCart.items.length, 1);
  assert.equal(autoCart.items[0]?.sku, "BRK-TY-018");

  // Attempting to add auto part to fashion engine must fail
  const crossAdd = fashionEngine.addToCart(fashionCartId, "BRK-TY-018", 1);
  assert.equal(crossAdd.success, false);
  assert.ok(crossAdd.error?.includes("not found"));
});

test("Prompt 93 - Cross-Tenant Boundary: Platform isolates tenant-tentaciones from tenant-automotive", () => {
  const service = createMockPlatformService();

  const tentacionesTenant = service.getTenant("tenant-tentaciones");
  const automotiveTenant = service.getTenant("tenant-automotive");

  assert.ok(tentacionesTenant);
  assert.ok(automotiveTenant);
  assert.notEqual(tentacionesTenant?.id, automotiveTenant?.id);

  // Registered applications in registry
  const apps = service.listApplications();
  const tentacionesApp = apps.find((a) => a.id === "tentaciones-commerce");
  const autoApp = apps.find((a) => a.id === "vehicle-parts-platform");

  assert.ok(tentacionesApp);
  assert.ok(autoApp);
  assert.equal(tentacionesApp?.tenantId, "tenant-tentaciones");
  assert.equal(autoApp?.tenantId, "tenant-automotive");
});

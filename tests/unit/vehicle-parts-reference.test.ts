import test from "node:test";
import assert from "node:assert/strict";
import {
  VehiclePartsEngine,
  VEHICLE_PARTS_REFERENCE_CATALOG,
  type Vehicle,
} from "../../src/application/platform/vehicle-parts-engine.js";

test("Prompt 92 - Vehicle Parts Reference App: Catalog contains realistic multi-category automotive inventory", () => {
  const engine = new VehiclePartsEngine();
  const parts = engine.listParts();

  assert.ok(parts.length >= 6);
  const categories = new Set(parts.map((p) => p.category));
  assert.ok(categories.has("brakes"));
  assert.ok(categories.has("filters"));
  assert.ok(categories.has("ignition"));
  assert.ok(categories.has("suspension"));

  // Check structure
  const ceramicPads = parts.find((p) => p.sku === "BRK-TY-018");
  assert.ok(ceramicPads);
  assert.equal(ceramicPads?.brand, "Akebono Pro");
  assert.equal(ceramicPads?.category, "brakes");
  assert.equal(ceramicPads?.oemReference, "04465-0D150");
  assert.equal(ceramicPads?.isOem, false);
  assert.ok(ceramicPads?.stock > 0);
});

test("Prompt 92 - Compatibility Engine: Deterministically validates part fitment per make, model, year, and engine", () => {
  const engine = new VehiclePartsEngine();

  const yaris2018: Vehicle = {
    make: "Toyota",
    model: "Yaris",
    year: 2018,
    engine: "1.5L Dual VVT-i",
  };

  const civic2019: Vehicle = {
    make: "Honda",
    model: "Civic",
    year: 2019,
    engine: "1.5 i-VTEC Turbo",
  };

  // Brake pads for Yaris should be compatible
  const yarisBrakeCheck = engine.isPartCompatible("BRK-TY-018", yaris2018);
  assert.equal(yarisBrakeCheck.compatible, true);
  assert.ok(yarisBrakeCheck.reason.includes("certified compatible"));

  // Brake pads for Yaris should NOT be compatible with Honda Civic
  const civicBrakeCheck = engine.isPartCompatible("BRK-TY-018", civic2019);
  assert.equal(civicBrakeCheck.compatible, false);
  assert.ok(civicBrakeCheck.reason.includes("NOT compatible"));

  // Oil filter compatible with both
  const yarisOilCheck = engine.isPartCompatible("FLT-TY-OIL-02", yaris2018);
  const civicOilCheck = engine.isPartCompatible("FLT-TY-OIL-02", civic2019);
  assert.equal(yarisOilCheck.compatible, true);
  assert.equal(civicOilCheck.compatible, true);

  // Find all compatible parts for Yaris 2018
  const yarisParts = engine.findCompatibleParts(yaris2018);
  assert.ok(yarisParts.length >= 4);
});

test("Prompt 92 - AI Parts Discovery: Parses Spanish natural language automotive queries", async () => {
  const engine = new VehiclePartsEngine();

  // Query with make, model, and category
  const discovery1 = await engine.searchPartsNaturalLanguage(
    "Necesito pastillas de freno para un Toyota Yaris 2018"
  );
  assert.equal(discovery1.detectedCategory, "brakes");
  assert.equal(discovery1.detectedVehicle?.make, "Toyota");
  assert.equal(discovery1.detectedVehicle?.model, "Yaris");
  assert.equal(discovery1.detectedVehicle?.year, 2018);
  assert.ok(discovery1.matches.length >= 2);
  assert.ok(discovery1.matches.some((p) => p.sku === "BRK-TY-018"));

  // Query for spark plugs
  const discovery2 = await engine.searchPartsNaturalLanguage(
    "Busco bujias de encendido iridium"
  );
  assert.equal(discovery2.detectedCategory, "ignition");
  assert.ok(discovery2.matches.some((p) => p.sku === "SPK-NGK-IRID-4"));
});

test("Prompt 92 - Part Comparison: Side-by-side technical and OEM tradeoff analysis", () => {
  const engine = new VehiclePartsEngine();

  const comparison = engine.compareParts("BRK-TY-018", "BRK-TY-OEM-01");
  assert.ok(comparison.partA);
  assert.ok(comparison.partB);
  assert.equal(comparison.priceDifference, -31.49); // Akebono is EUR 31.49 cheaper than OEM
  assert.ok(comparison.oemComparison.includes("genuine OEM"));
  assert.ok(comparison.specificationsComparison["material"]);
});

test("Prompt 92 - Cart & Pre-Mutation Stock Integrity: Validates inventory and executes checkout", () => {
  const engine = new VehiclePartsEngine();
  const yaris2018: Vehicle = { make: "Toyota", model: "Yaris", year: 2018, engine: "1.5L Dual VVT-i" };
  const cartId = "cart-auto-001";

  // 1. Add compatible part
  const add1 = engine.addToCart(cartId, "BRK-TY-018", 2, yaris2018);
  assert.equal(add1.success, true);
  assert.equal(add1.cart.items.length, 1);
  assert.equal(add1.cart.subtotal, 97.0);
  assert.equal(add1.cart.qualifiesForFreeShipping, false);
  assert.equal(add1.cart.missingForFreeShipping, 23.0);

  // 2. Add incompatible part should succeed with warning
  const civicStrut: Vehicle = { make: "Honda", model: "Civic", year: 2019, engine: "1.5 i-VTEC Turbo" };
  const add2 = engine.addToCart(cartId, "SUS-KYB-STRUT-F", 1, civicStrut);
  assert.equal(add2.success, true);
  assert.ok(add2.warning?.includes("COMPATIBILITY WARNING"));

  // 3. Overselling protection
  const addOversell = engine.addToCart(cartId, "SUS-KYB-STRUT-F", 999);
  assert.equal(addOversell.success, false);
  assert.ok(addOversell.error?.includes("Insufficient warehouse stock"));

  // 4. AI Cart Assistant query
  const cartAssistance = engine.assistCartQuery(cartId, "¿Cuánto me falta para despacho gratis?");
  assert.ok(cartAssistance.answer.includes("despacho gratis"));

  // 5. Checkout
  const checkout = engine.processCheckout(
    cartId,
    { name: "Carlos Taller", email: "taller@carlosmotors.cl", workshopName: "Carlos Motors" },
    { street: "Av. Automotriz 450", city: "Santiago", state: "RM", postalCode: "8320000", country: "Chile" },
    "WEBPAY_DEMO"
  );
  assert.equal(checkout.success, true);
  assert.ok(checkout.order);
  assert.equal(checkout.order?.paymentStatus, "PAID_DEMO");
  assert.equal(checkout.order?.orderStatus, "CONFIRMED");

  // Cart emptied after confirmed checkout
  const freshCart = engine.getOrCreateCart(cartId);
  assert.equal(freshCart.items.length, 0);
});

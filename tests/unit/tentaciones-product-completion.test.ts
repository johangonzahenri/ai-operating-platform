import test from "node:test";
import assert from "node:assert/strict";
import { TentacionesCommerceEngine, TENTACIONES_REFERENCE_CATALOG } from "../../src/application/platform/tentaciones-commerce-engine.js";

test("Prompt 86 - Tentaciones Product Completion: realistic catalog supports all categories, variants, and AR metadata", () => {
  const engine = new TentacionesCommerceEngine();
  const products = engine.listProducts();

  assert.ok(products.length >= 4);
  const footwear = products.find((p) => p.category === "footwear");
  const apparel = products.find((p) => p.category === "apparel");
  const accessories = products.find((p) => p.category === "accessories");

  assert.ok(footwear, "Footwear product should exist");
  assert.ok(apparel, "Apparel product should exist");
  assert.ok(accessories, "Accessories product should exist");

  assert.ok(footwear.variants.length > 0);
  assert.equal(typeof footwear.variants[0]?.sku, "string");
  assert.equal(typeof footwear.variants[0]?.stock, "number");
  assert.equal(typeof footwear.variants[0]?.price, "number");
  assert.ok(footwear.arAvailable);
});

test("Prompt 86 - Tentaciones Product Completion: AI product discovery parses Spanish natural language intent accurately", async () => {
  const engine = new TentacionesCommerceEngine();

  const search1 = await engine.searchProductsNaturalLanguage("zapatillas negras para correr");
  assert.equal(search1.intent.category, "footwear");
  assert.ok(search1.matches.some((m) => m.slug === "pro-carbon-racer"));

  const search2 = await engine.searchProductsNaturalLanguage("vestido elegante para una cena");
  assert.equal(search2.intent.category, "apparel");
  assert.ok(search2.matches.some((m) => m.slug === "silk-evening-dress"));

  const search3 = await engine.searchProductsNaturalLanguage("chaqueta impermeable");
  assert.equal(search3.intent.category, "apparel");
  assert.ok(search3.matches.some((m) => m.slug === "storm-shield-jacket"));
});

test("Prompt 86 - Tentaciones Product Completion: recommendations and comparison operate on authentic attributes", async () => {
  const engine = new TentacionesCommerceEngine();

  const recs = await engine.getRecommendations("prod-carbon-racer");
  assert.ok(recs.length > 0);
  assert.ok(!recs.some((r) => r.id === "prod-carbon-racer"), "Cannot recommend target product itself");

  const comparison = engine.compareProducts(["prod-carbon-racer", "prod-trail-blazer"]);
  assert.equal(comparison.products.length, 2);
  assert.equal(comparison.matrix.length, 2);
  assert.ok(comparison.differentiators.includes("weightGrams"));
});

test("Prompt 86 - Tentaciones Product Completion: cart assistance computes free shipping threshold and prevents overselling", () => {
  const engine = new TentacionesCommerceEngine();
  const cartId = "cart-test-user-1";

  // Check empty cart assistance
  const queryEmpty = engine.assistCartQuery(cartId, "¿Qué tengo en mi carrito?");
  assert.ok(queryEmpty.answer.includes("vacío"));

  // Add 1 carbon racer shoe (149.99 EUR)
  const addResult = engine.addToCart(cartId, "PCR-BLK-42", 1);
  assert.equal(addResult.success, true);
  assert.equal(addResult.cart.subtotal, 149.99);
  assert.equal(addResult.cart.qualifiesForFreeShipping, true);

  // Check free shipping assistance
  const queryShipping = engine.assistCartQuery(cartId, "¿Cuánto me falta para despacho gratis?");
  assert.ok(queryShipping.answer.includes("ya califica"));

  // Try to oversell beyond stock
  const oversell = engine.addToCart(cartId, "PCR-BLK-42", 9999);
  assert.equal(oversell.success, false);
  assert.ok(oversell.error?.includes("Insufficient stock"));
});

test("Prompt 86 - Tentaciones Product Completion: checkout completes with Webpay Demo payment distinction", () => {
  const engine = new TentacionesCommerceEngine();
  const cartId = "cart-checkout-001";

  engine.addToCart(cartId, "SSJ-BLK-M", 1);

  const checkoutResult = engine.processCheckout(
    cartId,
    { name: "Johan G", email: "johan@example.com" },
    { street: "Av. Principal 123", city: "Santiago", state: "RM", postalCode: "7500000", country: "Chile" },
    "WEBPAY_DEMO"
  );

  assert.equal(checkoutResult.success, true);
  assert.ok(checkoutResult.order);
  assert.equal(checkoutResult.order?.paymentMethod, "WEBPAY_DEMO");
  assert.equal(checkoutResult.order?.paymentStatus, "PAID_DEMO");
  assert.equal(checkoutResult.order?.orderStatus, "CONFIRMED");

  // Cart should be reset after confirmed checkout
  const freshCart = engine.getOrCreateCart(cartId);
  assert.equal(freshCart.items.length, 0);
});

test("Prompt 86 - Tentaciones Product Completion: AR Virtual Fitting Room resolves avatar profiles and sizing", async () => {
  const engine = new TentacionesCommerceEngine();

  const fitting = await engine.resolveFittingRoom(
    "urn:tentaciones:ar:footwear:pro-carbon-racer",
    "Nova",
    { footLengthCm: 25.5, footWidthCm: 9.8 }
  );

  assert.equal(fitting.arStatus, "AR_AVAILABLE");
  assert.equal(fitting.profile, "Nova");
  assert.ok(decodeURIComponent(fitting.previewUrl).includes("urn:tentaciones:ar:footwear:pro-carbon-racer"));
  assert.equal(fitting.isLocalEngine, true);
  assert.ok(fitting.recommendedSize);
  assert.equal(fitting.recommendedSize?.recommendedSize, "40");
});

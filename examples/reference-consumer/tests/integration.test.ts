import test from "node:test";
import assert from "node:assert/strict";
import { getApplicationHealth } from "../src/health.js";

test("AOP Reference Consumer Application Health Contract Verification", () => {
  const health = getApplicationHealth();
  assert.equal(health.applicationId, "reference-consumer");
  assert.equal(health.status, "HEALTHY");
  assert.ok(health.capabilities.length >= 1);
});

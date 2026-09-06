import assert from "node:assert/strict";
import test from "node:test";
import { ModelUnavailableError, ModelValidationError, validateModelRequest } from "../../src/domain/model/model-gateway.js";
import { StubModelGateway } from "../../src/infrastructure/model/stub-model-gateway.js";

test("model request validation requires correlation, model and input", () => {
  assert.throws(() => validateModelRequest({ traceId: "", model: "stub", input: { value: 1 } }), ModelValidationError);
  assert.throws(() => validateModelRequest({ traceId: "trace", model: "", input: { value: 1 } }), ModelValidationError);
  assert.throws(() => validateModelRequest({ traceId: "trace", model: "stub", input: {} }), ModelValidationError);
});
test("stub model is deterministic and classifies configured provider failure", async () => {
  const response = await new StubModelGateway().generate({ traceId: "trace", model: "stub", input: { value: 1 } });
  assert.equal(response.provider, "stub"); assert.equal(response.metadata?.deterministic, true);
  await assert.rejects(() => new StubModelGateway(new Error("offline")).generate({ traceId: "trace", model: "stub", input: { value: 1 } }), ModelUnavailableError);
});

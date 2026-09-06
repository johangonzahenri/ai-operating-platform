import assert from "node:assert/strict";
import test from "node:test";
import { ModelGateway } from "../../src/domain/model/model-gateway.js";
import { StubModelGateway } from "../../src/infrastructure/model/stub-model-gateway.js";

const modelGatewayContract = (name: string, gateway: ModelGateway): void => test(`${name} satisfies ModelGateway contract`, async () => {
  const response = await gateway.generate({ traceId: "trace-1", model: "test", input: { key: "value" } });
  assert.equal(typeof response.provider, "string"); assert.ok(response.provider.length > 0); assert.equal(response.model, "test"); assert.equal(typeof response.output, "object"); assert.equal(response.metadata?.deterministic, true);
});
modelGatewayContract("StubModelGateway", new StubModelGateway());

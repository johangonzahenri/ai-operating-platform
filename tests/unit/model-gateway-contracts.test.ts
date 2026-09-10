import assert from "node:assert/strict";
import test from "node:test";
import {
  ModelRequest,
  ModelResponse,
  ModelValidationError,
  ModelAuthenticationError,
  ModelRateLimitError,
  ModelTimeoutError,
  ModelInvalidRequestError,
  ModelInvalidResponseError,
  ModelUnavailableError,
  ModelProviderError,
  validateModelRequest,
} from "../../src/domain/model/model-gateway.js";
import { OpenAIModelGateway } from "../../src/infrastructure/model/openai/openai-model-gateway.js";
import { AnthropicModelGateway } from "../../src/infrastructure/model/anthropic/anthropic-model-gateway.js";
import { OllamaModelGateway } from "../../src/infrastructure/model/ollama/ollama-model-gateway.js";

test("ModelRequest validation rejects missing traceId", () => {
  assert.throws(
    () => validateModelRequest({ traceId: "", model: "gpt-4", input: { text: "hi" } }),
    ModelValidationError
  );
});

test("ModelRequest validation rejects missing model", () => {
  assert.throws(
    () => validateModelRequest({ traceId: "tr-1", model: "  ", input: { text: "hi" } }),
    ModelValidationError
  );
});

test("ModelRequest validation rejects empty input", () => {
  assert.throws(
    () => validateModelRequest({ traceId: "tr-1", model: "gpt-4", input: {} }),
    ModelValidationError
  );
});

test("Model error hierarchy contains unique and distinct error codes", () => {
  const authErr = new ModelAuthenticationError("openai");
  assert.equal(authErr.code, "MODEL_AUTHENTICATION_ERROR");
  assert.equal(authErr.provider, "openai");

  const rateErr = new ModelRateLimitError("anthropic", "Rate limited", 1000);
  assert.equal(rateErr.code, "MODEL_RATE_LIMIT_ERROR");
  assert.equal(rateErr.retryAfterMs, 1000);

  const timeErr = new ModelTimeoutError("ollama");
  assert.equal(timeErr.code, "MODEL_TIMEOUT_ERROR");

  const invReqErr = new ModelInvalidRequestError("openai");
  assert.equal(invReqErr.code, "MODEL_INVALID_REQUEST");

  const invResErr = new ModelInvalidResponseError("anthropic");
  assert.equal(invResErr.code, "MODEL_INVALID_RESPONSE");

  const unavailErr = new ModelUnavailableError("ollama");
  assert.equal(unavailErr.code, "MODEL_UNAVAILABLE");

  const provErr = new ModelProviderError("custom", "Generic failure");
  assert.equal(provErr.code, "MODEL_PROVIDER_ERROR");
});

test("OpenAI Model Gateway throws ModelAuthenticationError if apiKey is omitted", async () => {
  const gateway = new OpenAIModelGateway({ provider: "openai", defaultModel: "gpt-4o" });
  await assert.rejects(
    () => gateway.generate({ traceId: "tr-1", model: "gpt-4o", input: { text: "test" } }),
    ModelAuthenticationError
  );
});

test("Anthropic Model Gateway throws ModelAuthenticationError if apiKey is omitted", async () => {
  const gateway = new AnthropicModelGateway({ provider: "anthropic", defaultModel: "claude-3-opus" });
  await assert.rejects(
    () => gateway.generate({ traceId: "tr-1", model: "claude-3-opus", input: { text: "test" } }),
    ModelAuthenticationError
  );
});

test("Ollama Model Gateway operates locally without requiring API key", async () => {
  const mockFetch = async () =>
    new Response(
      JSON.stringify({
        model: "llama3",
        response: "local test output",
        done: true,
        prompt_eval_count: 8,
        eval_count: 14,
      }),
      { status: 200 }
    );
  const gateway = new OllamaModelGateway(
    { provider: "ollama", defaultModel: "llama3" },
    mockFetch as any
  );
  const res = await gateway.generate({ traceId: "tr-1", model: "llama3", input: { text: "test" } });
  assert.equal(res.provider, "ollama");
  assert.ok(res.usage);
  assert.equal(res.usage.totalTokens, 22);
});

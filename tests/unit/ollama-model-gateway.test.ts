import assert from "node:assert/strict";
import test from "node:test";
import {
  ModelTimeoutError,
  ModelUnavailableError,
  ModelInvalidRequestError,
  ModelInvalidResponseError,
  ModelProviderError,
} from "../../src/domain/model/model-gateway.js";
import { OllamaModelGateway, HttpFetchFn } from "../../src/infrastructure/model/ollama/ollama-model-gateway.js";

function createMockFetch(handler: (url: string, init?: RequestInit) => Promise<Response>): HttpFetchFn {
  return (url: string | URL, init?: RequestInit) => handler(String(url), init);
}

test("OllamaModelGateway (Happy Path): returns normalized ModelResponse on HTTP 200", async () => {
  const mockFetch = createMockFetch(async (url, init) => {
    assert.equal(url, "http://127.0.0.1:11434/api/chat");
    assert.equal(init?.method, "POST");
    const reqBody = JSON.parse(String(init?.body));
    assert.equal(reqBody.model, "llama3");
    assert.equal(reqBody.stream, false);

    const mockResponse = {
      model: "llama3",
      created_at: "2026-09-09T18:00:00.000Z",
      message: { role: "assistant", content: "Plan summary calculation result" },
      done: true,
      done_reason: "stop",
      total_duration: 150000000,
      prompt_eval_count: 20,
      eval_count: 35,
    };

    return new Response(JSON.stringify(mockResponse), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });

  const gateway = new OllamaModelGateway(
    { provider: "ollama", defaultModel: "llama3", baseUrl: "http://127.0.0.1:11434" },
    mockFetch
  );

  const res = await gateway.generate({
    traceId: "tr-ollama-1",
    model: "llama3",
    input: { prompt: "Analyze platform metrics" },
  });

  assert.equal(res.provider, "ollama");
  assert.equal(res.model, "llama3");
  assert.equal(res.content, "Plan summary calculation result");
  assert.equal(res.finishReason, "stop");
  assert.ok(res.usage);
  assert.equal(res.usage.inputTokens, 20);
  assert.equal(res.usage.outputTokens, 35);
  assert.equal(res.usage.totalTokens, 55);
  assert.equal(res.latencyMs, 150);
});

test("OllamaModelGateway (Structured Output): parses JSON format into output object", async () => {
  const mockFetch = createMockFetch(async (_url, init) => {
    const reqBody = JSON.parse(String(init?.body));
    assert.equal(reqBody.format, "json");

    const mockResponse = {
      model: "llama3",
      message: { role: "assistant", content: '{"steps": [{"action": "calc", "input": {"a": 1, "b": 2}}], "status": "READY"}' },
      done: true,
      prompt_eval_count: 10,
      eval_count: 25,
    };

    return new Response(JSON.stringify(mockResponse), { status: 200 });
  });

  const gateway = new OllamaModelGateway(
    { provider: "ollama", defaultModel: "llama3" },
    mockFetch
  );

  const res = await gateway.generate({
    traceId: "tr-ollama-struct",
    model: "llama3",
    input: { prompt: "Generate structured plan" },
    requestedFormat: "json_schema",
  });

  assert.equal(res.provider, "ollama");
  assert.deepEqual(res.output, {
    steps: [{ action: "calc", input: { a: 1, b: 2 } }],
    status: "READY",
  });
});

test("OllamaModelGateway (Structured Output Error): throws ModelInvalidResponseError on unparseable JSON", async () => {
  const mockFetch = createMockFetch(async () => {
    const mockResponse = {
      model: "llama3",
      message: { role: "assistant", content: "This is raw unformatted text, not valid JSON" },
      done: true,
    };
    return new Response(JSON.stringify(mockResponse), { status: 200 });
  });

  const gateway = new OllamaModelGateway(
    { provider: "ollama", defaultModel: "llama3" },
    mockFetch
  );

  await assert.rejects(
    () =>
      gateway.generate({
        traceId: "tr-ollama-bad-json",
        model: "llama3",
        input: { prompt: "test" },
        requestedFormat: "json_object",
      }),
    ModelInvalidResponseError
  );
});

test("OllamaModelGateway (Timeout): maps AbortError to ModelTimeoutError", async () => {
  const mockFetch = createMockFetch(async () => {
    const abortErr = new Error("The operation was aborted.");
    abortErr.name = "AbortError";
    throw abortErr;
  });

  const gateway = new OllamaModelGateway(
    { provider: "ollama", defaultModel: "llama3", timeoutMs: 100 },
    mockFetch
  );

  await assert.rejects(
    () =>
      gateway.generate({
        traceId: "tr-ollama-timeout",
        model: "llama3",
        input: { prompt: "long task" },
      }),
    (err: unknown) => {
      assert.ok(err instanceof ModelTimeoutError);
      assert.equal(err.code, "MODEL_TIMEOUT_ERROR");
      assert.equal(err.provider, "ollama");
      return true;
    }
  );
});

test("OllamaModelGateway (Unavailable): maps connection failure to ModelUnavailableError", async () => {
  const mockFetch = createMockFetch(async () => {
    const connErr = new Error("connect ECONNREFUSED 127.0.0.1:11434");
    (connErr as any).code = "ECONNREFUSED";
    throw connErr;
  });

  const gateway = new OllamaModelGateway(
    { provider: "ollama", defaultModel: "llama3" },
    mockFetch
  );

  await assert.rejects(
    () =>
      gateway.generate({
        traceId: "tr-ollama-unavail",
        model: "llama3",
        input: { prompt: "test" },
      }),
    (err: unknown) => {
      assert.ok(err instanceof ModelUnavailableError);
      assert.equal(err.code, "MODEL_UNAVAILABLE");
      assert.equal(err.provider, "ollama");
      return true;
    }
  );
});

test("OllamaModelGateway (HTTP 404): maps HTTP 404 to ModelInvalidRequestError", async () => {
  const mockFetch = createMockFetch(async () => {
    return new Response(JSON.stringify({ error: "model 'nonexistent' not found" }), {
      status: 404,
      statusText: "Not Found",
    });
  });

  const gateway = new OllamaModelGateway(
    { provider: "ollama", defaultModel: "nonexistent" },
    mockFetch
  );

  await assert.rejects(
    () =>
      gateway.generate({
        traceId: "tr-ollama-404",
        model: "nonexistent",
        input: { prompt: "test" },
      }),
    (err: unknown) => {
      assert.ok(err instanceof ModelInvalidRequestError);
      assert.equal(err.code, "MODEL_INVALID_REQUEST");
      return true;
    }
  );
});

test("OllamaModelGateway (HTTP 500): maps HTTP 500 to ModelProviderError", async () => {
  const mockFetch = createMockFetch(async () => {
    return new Response(JSON.stringify({ error: "CUDA out of memory" }), {
      status: 500,
      statusText: "Internal Server Error",
    });
  });

  const gateway = new OllamaModelGateway(
    { provider: "ollama", defaultModel: "llama3" },
    mockFetch
  );

  await assert.rejects(
    () =>
      gateway.generate({
        traceId: "tr-ollama-500",
        model: "llama3",
        input: { prompt: "test" },
      }),
    (err: unknown) => {
      assert.ok(err instanceof ModelProviderError);
      assert.equal(err.code, "MODEL_PROVIDER_ERROR");
      return true;
    }
  );
});

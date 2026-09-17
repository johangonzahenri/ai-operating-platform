import assert from "node:assert/strict";
import test from "node:test";
import {
  ModelAuthenticationError,
  ModelRateLimitError,
  ModelTimeoutError,
  ModelInvalidRequestError,
  ModelUnavailableError,
  ModelStructuredOutputError,
} from "../../src/domain/model/model-gateway.js";
import { GeminiModelGateway } from "../../src/infrastructure/model/gemini/gemini-model-gateway.js";
import { ProviderFactory } from "../../src/infrastructure/model/provider-factory.js";

test("GeminiModelGateway: listSupportedModels and capabilities", async () => {
  const gateway = new GeminiModelGateway({
    provider: "gemini",
    defaultModel: "gemini-1.5-flash",
    apiKey: "test-api-key",
  });

  const models = await gateway.listSupportedModels();
  assert.equal(models.length, 3);
  assert.ok(models.some((m) => m.id === "gemini-1.5-pro"));
  assert.ok(models.some((m) => m.id === "gemini-1.5-flash"));
  assert.ok(models.some((m) => m.id === "gemini-2.0-flash"));

  const pro = await gateway.getModel("gemini-1.5-pro");
  assert.ok(pro);
  assert.equal(pro?.name, "Gemini 1.5 Pro");
  assert.ok(await gateway.supports("gemini-1.5-pro", "TEXT_GENERATION"));
  assert.ok(await gateway.supports("gemini-1.5-pro", "STRUCTURED_OUTPUT"));
  assert.ok(await gateway.supports("gemini-1.5-pro", "TOOL_CALLING"));
});

test("GeminiModelGateway: requires API key for gemini provider", async () => {
  const gateway = new GeminiModelGateway({
    provider: "gemini",
    defaultModel: "gemini-1.5-flash",
  });

  await assert.rejects(
    () => gateway.generate({ traceId: "t1", model: "gemini-1.5-flash", input: { prompt: "hi" } }),
    ModelAuthenticationError
  );
});

test("GeminiModelGateway: generates text response and computes usage", async () => {
  let capturedUrl = "";
  let capturedBody: any = null;

  const mockFetch = async (input: string | URL, init?: RequestInit): Promise<Response> => {
    capturedUrl = input.toString();
    capturedBody = JSON.parse(init?.body as string);

    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ text: "Hello from Gemini!" }],
              role: "model",
            },
            finishReason: "STOP",
            index: 0,
          },
        ],
        usageMetadata: {
          promptTokenCount: 12,
          candidatesTokenCount: 8,
          totalTokenCount: 20,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  const gateway = new GeminiModelGateway(
    {
      provider: "gemini",
      defaultModel: "gemini-1.5-flash",
      apiKey: "secret-key",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    },
    mockFetch
  );

  const res = await gateway.generate({
    traceId: "t-123",
    model: "gemini-1.5-flash",
    input: { prompt: "Say hello" },
    objective: "Say hello",
    systemInstruction: "You are a friendly AI",
  });

  assert.ok(capturedUrl.includes("models/gemini-1.5-flash:generateContent?key=secret-key"));
  assert.equal(capturedBody.systemInstruction.parts[0].text, "You are a friendly AI");
  assert.equal(capturedBody.contents[0].role, "user");
  assert.equal(capturedBody.contents[0].parts[0].text, "Say hello");

  assert.equal(res.provider, "gemini");
  assert.equal(res.model, "gemini-1.5-flash");
  assert.equal(res.content, "Hello from Gemini!");
  assert.equal(res.usage?.inputTokens, 12);
  assert.equal(res.usage?.outputTokens, 8);
  assert.equal(res.usage?.totalTokens, 20);
});

test("GeminiModelGateway: handles tool calls and function responses", async () => {
  const mockFetch = async (): Promise<Response> => {
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    name: "lookup_part",
                    args: { partNumber: "BP-9921" },
                  },
                },
              ],
              role: "model",
            },
            finishReason: "STOP",
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  const gateway = new GeminiModelGateway(
    {
      provider: "gemini",
      defaultModel: "gemini-1.5-flash",
      apiKey: "secret-key",
    },
    mockFetch
  );

  const res = await gateway.generate({
    traceId: "t-tools",
    model: "gemini-1.5-flash",
    input: { query: "check brake pad" },
    tools: [
      {
        name: "lookup_part",
        description: "Looks up auto part",
        inputSchema: { type: "object", properties: { partNumber: { type: "string" } } },
      },
    ],
  });

  assert.ok(res.toolCalls);
  assert.equal(res.toolCalls.length, 1);
  assert.equal(res.toolCalls[0].name, "lookup_part");
  assert.deepEqual(res.toolCalls[0].arguments, { partNumber: "BP-9921" });
});

test("GeminiModelGateway: supports structured JSON output", async () => {
  const mockFetch = async (): Promise<Response> => {
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify({ verified: true, count: 5 }) }],
              role: "model",
            },
            finishReason: "STOP",
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  const gateway = new GeminiModelGateway(
    {
      provider: "gemini",
      defaultModel: "gemini-1.5-flash",
      apiKey: "secret-key",
    },
    mockFetch
  );

  const structured = await gateway.generateStructured<{ verified: boolean; count: number }>(
    {
      traceId: "t-struct",
      model: "gemini-1.5-flash",
      input: { analyze: "sample" },
    },
    { type: "object" }
  );

  assert.equal(structured.output.verified, true);
  assert.equal(structured.output.count, 5);
});

test("GeminiModelGateway: maps HTTP errors accurately", async () => {
  const createGatewayWithError = (status: number, message: string) => {
    return new GeminiModelGateway(
      {
        provider: "gemini",
        defaultModel: "gemini-1.5-flash",
        apiKey: "secret-key",
      },
      async () =>
        new Response(JSON.stringify({ error: { message, code: status } }), {
          status,
          headers: { "Content-Type": "application/json" },
        })
    );
  };

  await assert.rejects(
    () => createGatewayWithError(401, "Invalid API key").generate({ traceId: "t", model: "gemini-1.5-flash", input: { prompt: "hi" } }),
    ModelAuthenticationError
  );

  await assert.rejects(
    () => createGatewayWithError(429, "Rate limit exceeded").generate({ traceId: "t", model: "gemini-1.5-flash", input: { prompt: "hi" } }),
    ModelRateLimitError
  );

  await assert.rejects(
    () => createGatewayWithError(400, "Invalid JSON body").generate({ traceId: "t", model: "gemini-1.5-flash", input: { prompt: "hi" } }),
    ModelInvalidRequestError
  );

  await assert.rejects(
    () => createGatewayWithError(503, "Service unavailable").generate({ traceId: "t", model: "gemini-1.5-flash", input: { prompt: "hi" } }),
    ModelUnavailableError
  );
});

test("GeminiModelGateway: streamGenerateContent produces final chunk", async () => {
  const mockFetch = async (): Promise<Response> => {
    return new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: "Streamed tokens" }], role: "model" }, finishReason: "STOP" }],
      }),
      { status: 200 }
    );
  };

  const gateway = new GeminiModelGateway(
    {
      provider: "gemini",
      defaultModel: "gemini-1.5-flash",
      apiKey: "secret-key",
    },
    mockFetch
  );

  const chunks = [];
  for await (const chunk of gateway.generateStream({ traceId: "stream", model: "gemini-1.5-flash", input: { prompt: "stream" } })) {
    chunks.push(chunk);
  }

  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].content, "Streamed tokens");
  assert.equal(chunks[0].isFinal, true);
});

test("ProviderFactory: resolves registered Gemini adapter", () => {
  const factory = new ProviderFactory();
  const gateway = new GeminiModelGateway({
    provider: "gemini",
    defaultModel: "gemini-1.5-flash",
    apiKey: "dummy",
  });
  factory.registerAdapter(gateway);

  assert.ok(factory.hasProvider("gemini"));
  const resolved = factory.resolveProvider("gemini");
  assert.equal(resolved.providerId, "gemini");
});

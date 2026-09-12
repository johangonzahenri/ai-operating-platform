import assert from "node:assert/strict";
import test from "node:test";
import { OpenAIModelGateway } from "../../src/infrastructure/model/openai/openai-model-gateway.js";
import { AnthropicModelGateway } from "../../src/infrastructure/model/anthropic/anthropic-model-gateway.js";
import { modelProviderConfigFromEnvironment } from "../../src/infrastructure/model/model-provider-config.js";
import { ModelAuthenticationError, ModelInvalidResponseError, ModelTimeoutError } from "../../src/domain/model/model-gateway.js";
import { OllamaModelGateway } from "../../src/infrastructure/model/ollama/ollama-model-gateway.js";

const request = {
  traceId: "trace-model-test",
  model: "configured-model",
  input: { objective: "return structured output" },
  requestedFormat: "json_object" as const,
};
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("provider configuration defaults to safe stub mode", () => {
  assert.deepEqual(modelProviderConfigFromEnvironment({}), { provider: "stub", defaultModel: "stub-model" });
});

test("OpenAI maps structured response and normalizes authentication errors", async () => {
  const gateway = new OpenAIModelGateway({ provider: "openai", defaultModel: "gpt-test", apiKey: "secret", baseUrl: "https://example.test" }, async () => response({ choices: [{ message: { content: '{"steps":[]}' }, finish_reason: "stop" }], usage: { prompt_tokens: 2, completion_tokens: 3 } }));
  const result = await gateway.generate(request);
  assert.deepEqual(result.output, { steps: [] });
  assert.equal(JSON.stringify(result).includes("secret"), false);
  const authGateway = new OpenAIModelGateway({ provider: "openai", defaultModel: "gpt-test", apiKey: "secret" }, async () => response({ error: { message: "bad key" } }, 401));
  await assert.rejects(authGateway.generate(request), ModelAuthenticationError);
});

test("Anthropic maps structured response and rejects invalid JSON", async () => {
  const gateway = new AnthropicModelGateway({ provider: "anthropic", defaultModel: "claude-test", apiKey: "secret", baseUrl: "https://example.test" }, async () => response({ content: [{ type: "text", text: '{"steps":[]}' }], usage: { input_tokens: 2, output_tokens: 3 }, stop_reason: "end_turn" }));
  assert.deepEqual((await gateway.generate(request)).output, { steps: [] });
  const invalid = new AnthropicModelGateway({ provider: "anthropic", defaultModel: "claude-test", apiKey: "secret" }, async () => response({ content: [{ type: "text", text: "not json" }] }));
  await assert.rejects(invalid.generate(request), ModelInvalidResponseError);
});

test("remote providers enforce a timeout", async () => {
  const gateway = new OpenAIModelGateway({ provider: "openai", defaultModel: "gpt-test", apiKey: "secret", timeoutMs: 1 }, async (_input, init) => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    if (init?.signal?.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
    return response({});
  });
  await assert.rejects(gateway.generate(request), ModelTimeoutError);
});

test("OpenAI serializes assistant tool calls and tool results into the next request", async () => {
  const bodies: Record<string, unknown>[] = [];
  const gateway = new OpenAIModelGateway({ provider: "openai", defaultModel: "gpt-test", apiKey: "secret" }, async (_input, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return response({ choices: [{ message: { content: "done" }, finish_reason: "stop" }] });
  });
  await gateway.generate({
    ...request,
    requestedFormat: "text",
    messages: [
      { role: "user", content: "find shoes" },
      { role: "assistant", toolCalls: [{ id: "call-1", name: "lookup", arguments: { query: "shoes" } }] },
      { role: "tool", toolResult: { toolCallId: "call-1", name: "lookup", output: { found: true }, success: true } },
    ],
    tools: [{ name: "lookup", description: "Lookup", inputSchema: { required: ["query"], properties: { query: "string" } } }],
  });
  const body = bodies[0];
  const messages = body?.messages as Record<string, unknown>[];
  assert.equal((messages[1]?.tool_calls as Record<string, unknown>[])[0]?.id, "call-1");
  assert.equal(messages[2]?.tool_call_id, "call-1");
  assert.equal((body?.tools as Record<string, unknown>[])[0]?.type, "function");
});

test("Anthropic serializes tool_use and tool_result blocks", async () => {
  let body: Record<string, unknown> | undefined;
  const gateway = new AnthropicModelGateway({ provider: "anthropic", defaultModel: "claude-test", apiKey: "secret" }, async (_input, init) => {
    body = JSON.parse(String(init?.body));
    return response({ content: [{ type: "text", text: "done" }] });
  });

  await gateway.generate({
    ...request,
    requestedFormat: "text",
    messages: [
      { role: "user", content: "find shoes" },
      { role: "assistant", toolCalls: [{ id: "use-1", name: "lookup", arguments: { query: "shoes" } }] },
      { role: "tool", toolResult: { toolCallId: "use-1", name: "lookup", output: { found: true }, success: true } },
    ],
    tools: [{ name: "lookup", description: "Lookup", inputSchema: { required: ["query"], properties: { query: "string" } } }],
  });
  const messages = body?.messages as Record<string, unknown>[];
  const assistantBlocks = messages[1]?.content as Record<string, unknown>[];
  const resultBlocks = messages[2]?.content as Record<string, unknown>[];
  assert.equal(assistantBlocks[0]?.id, "use-1");
  assert.equal(resultBlocks[0]?.tool_use_id, "use-1");
  assert.equal((body?.tools as Record<string, unknown>[])[0]?.name, "lookup");
});

test("Ollama uses the chat protocol with tools and conversation history", async () => {
  let url = "";
  let body: Record<string, unknown> | undefined;
  const gateway = new OllamaModelGateway({ provider: "ollama", defaultModel: "llama-test", baseUrl: "http://ollama.test" }, async (input, init) => {
    url = String(input);
    body = JSON.parse(String(init?.body));
    return response({ message: { content: "done" }, done: true });
  });
  await gateway.generate({
    ...request,
    requestedFormat: "text",
    messages: [{ role: "user", content: "find shoes" }, { role: "tool", toolResult: { toolCallId: "call-1", name: "lookup", output: { found: true }, success: true } }],
    tools: [{ name: "lookup", description: "Lookup", inputSchema: { required: ["query"], properties: { query: "string" } } }],
  });
  assert.equal(url, "http://ollama.test/api/chat");
  assert.equal((body?.messages as Record<string, unknown>[])[1]?.role, "tool");
  assert.equal((body?.tools as Record<string, unknown>[])[0]?.type, "function");
});

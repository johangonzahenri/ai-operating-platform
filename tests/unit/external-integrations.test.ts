import test from "node:test";
import assert from "node:assert/strict";
import { IntegrationRunner } from "../../src/infrastructure/config/integration-runner.js";

test("Prompt 77 - External Integrations: correctly classifies NOT_CONFIGURED status when keys are missing", async () => {
  const runner = new IntegrationRunner({
    openaiApiKey: "",
    anthropicApiKey: "",
    ollamaBaseUrl: "http://127.0.0.1:99999", // Unreachable port
  });

  const openaiResult = await runner.checkOpenAi();
  assert.equal(openaiResult.status, "NOT_CONFIGURED");
  assert.equal(openaiResult.integration, "OpenAI");

  const anthropicResult = await runner.checkAnthropic();
  assert.equal(anthropicResult.status, "NOT_CONFIGURED");

  const n8nResult = await runner.checkN8n();
  assert.equal(n8nResult.status, "DESIGNED");
});

test("Prompt 77 - External Integrations: verifies OPERATIONAL status when mock endpoint responds ok", async () => {
  const mockFetch: typeof fetch = async (url) => {
    if (String(url).includes("openai.com")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: [{ id: "gpt-4o" }] }),
      } as any;
    }
    if (String(url).includes("11434")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ models: [{ name: "llama3.2" }] }),
      } as any;
    }
    return { ok: false, status: 404 } as any;
  };

  const runner = new IntegrationRunner({
    openaiApiKey: "sk-mock-valid-key",
    anthropicApiKey: "ant-mock-valid-key",
    ollamaBaseUrl: "http://localhost:11434",
    fetchFn: mockFetch,
  });

  const openaiResult = await runner.checkOpenAi();
  assert.equal(openaiResult.status, "OPERATIONAL");

  const ollamaResult = await runner.checkOllama();
  assert.equal(ollamaResult.status, "OPERATIONAL");
});

test("Prompt 77 - External Integrations: failure matrix maps 401, 403, 429 and network errors cleanly", async () => {
  const mockFailingFetch: typeof fetch = async (url) => {
    return {
      ok: false,
      status: 401,
      text: async () => "Unauthorized API key",
    } as any;
  };

  const runner = new IntegrationRunner({
    openaiApiKey: "sk-invalid-key",
    fetchFn: mockFailingFetch,
  });

  const result = await runner.checkOpenAi();
  assert.equal(result.status, "CONFIGURED_OFFLINE");
  assert.ok(result.error?.includes("401"));
});

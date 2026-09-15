import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { IntegrationTruthEngine } from "../../src/infrastructure/config/integration-truth-engine.js";

test("Prompt 85 - Integration Truth Engine: lists all 10 core integrations with honest dual-state taxonomy", async () => {
  const engine = new IntegrationTruthEngine();
  const integrations = engine.listIntegrations();

  assert.equal(integrations.length, 10);
  const ids = integrations.map((i) => i.id);
  assert.ok(ids.includes("openai"));
  assert.ok(ids.includes("anthropic"));
  assert.ok(ids.includes("ollama"));
  assert.ok(ids.includes("postgresql"));
  assert.ok(ids.includes("docker"));
  assert.ok(ids.includes("opentelemetry"));
  assert.ok(ids.includes("n8n"));
  assert.ok(ids.includes("ar-provider"));
  assert.ok(ids.includes("webxr"));
  assert.ok(ids.includes("cloud"));

  for (const item of integrations) {
    assert.equal(item.implementation, "IMPLEMENTED");
    assert.ok(item.supportedFeatures.length > 0);
  }
});

test("Prompt 85 - Integration Truth Engine: verifies missing API keys without throwing unhandled exceptions", async () => {
  const engine = new IntegrationTruthEngine({
    openaiApiKey: "",
    anthropicApiKey: "",
    postgresUrl: "",
    n8nWebhookUrl: "",
    otelEndpoint: "",
  });

  const openai = await engine.verifyOpenAi();
  assert.equal(openai.configuration, "NOT_CONFIGURED");
  assert.equal(openai.connectivity, "NOT_CONNECTED");
  assert.equal(openai.runtime, "STANDBY");
  assert.ok(openai.error?.includes("OPENAI_API_KEY"));

  const anthropic = await engine.verifyAnthropic();
  assert.equal(anthropic.configuration, "NOT_CONFIGURED");
  assert.equal(anthropic.connectivity, "NOT_CONNECTED");

  const pg = await engine.verifyPostgresql();
  assert.equal(pg.configuration, "NOT_CONFIGURED");
  assert.equal(pg.connectivity, "NOT_CONNECTED");

  const otel = await engine.verifyOtel();
  assert.equal(otel.configuration, "NOT_CONFIGURED");
  assert.equal(otel.connectivity, "NOT_CONNECTED");
});

test("Prompt 85 - Integration Truth Engine: verifies OPERATIONAL state with mock endpoints and generates evidence", async () => {
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

  const tempEvidenceDir = path.resolve(process.cwd(), "docs/integration-evidence");
  const engine = new IntegrationTruthEngine({
    openaiApiKey: "sk-mock-valid-key",
    anthropicApiKey: "ant-mock-valid-key",
    ollamaBaseUrl: "http://127.0.0.1:11434",
    postgresUrl: "postgresql://postgres:postgres@localhost:5432/ai_platform",
    n8nWebhookUrl: "http://localhost:5678/webhook/test",
    otelEndpoint: "http://localhost:4318/v1/traces",
    fetchFn: mockFetch,
    evidenceDir: tempEvidenceDir,
  });

  const results = await engine.verifyAll();
  assert.equal(results.length, 10);

  const openai = results.find((r) => r.id === "openai");
  assert.equal(openai?.runtime, "OPERATIONAL");
  assert.ok(openai?.evidence);
  assert.equal(openai?.evidence?.provider, "openai");

  const ollama = results.find((r) => r.id === "ollama");
  assert.equal(ollama?.runtime, "OPERATIONAL");

  const ar = results.find((r) => r.id === "ar-provider");
  assert.equal(ar?.runtime, "OPERATIONAL");

  const cloud = results.find((r) => r.id === "cloud");
  assert.equal(cloud?.runtime, "HEALTHY");
});

import test from "node:test";
import assert from "node:assert/strict";

export type DemoMode = "DEMO" | "LOCAL" | "LIVE";

export interface DemoConfiguration {
  readonly mode: DemoMode;
  readonly modelProvider: "stub" | "ollama" | "openai" | "anthropic";
  readonly arEngine: "local" | "external";
  readonly persistence: "sqlite_wal" | "in_memory";
  readonly allowExternalNetwork: boolean;
}

export function configureDemoMode(mode: DemoMode, env: Record<string, string | undefined> = {}): DemoConfiguration {
  switch (mode) {
    case "DEMO":
      return {
        mode: "DEMO",
        modelProvider: "stub",
        arEngine: "local",
        persistence: "sqlite_wal",
        allowExternalNetwork: false,
      };
    case "LOCAL":
      return {
        mode: "LOCAL",
        modelProvider: "ollama",
        arEngine: "local",
        persistence: "sqlite_wal",
        allowExternalNetwork: false,
      };
    case "LIVE":
      return {
        mode: "LIVE",
        modelProvider: env.OPENAI_API_KEY ? "openai" : env.ANTHROPIC_API_KEY ? "anthropic" : "stub",
        arEngine: env.EXTERNAL_AR_API_KEY ? "external" : "local",
        persistence: "sqlite_wal",
        allowExternalNetwork: true,
      };
  }
}

test("Prompt 87 - Demo Modes: DEMO mode operates zero external network requests and deterministic stubs", () => {
  const config = configureDemoMode("DEMO");
  assert.equal(config.mode, "DEMO");
  assert.equal(config.modelProvider, "stub");
  assert.equal(config.arEngine, "local");
  assert.equal(config.allowExternalNetwork, false);
});

test("Prompt 87 - Demo Modes: LOCAL mode configures Ollama without paid API keys", () => {
  const config = configureDemoMode("LOCAL");
  assert.equal(config.mode, "LOCAL");
  assert.equal(config.modelProvider, "ollama");
  assert.equal(config.arEngine, "local");
  assert.equal(config.allowExternalNetwork, false);
});

test("Prompt 87 - Demo Modes: LIVE mode selects cloud providers when environment keys are present", () => {
  const liveConfig = configureDemoMode("LIVE", { OPENAI_API_KEY: "sk-test-live-key" });
  assert.equal(liveConfig.mode, "LIVE");
  assert.equal(liveConfig.modelProvider, "openai");
  assert.equal(liveConfig.allowExternalNetwork, true);
});

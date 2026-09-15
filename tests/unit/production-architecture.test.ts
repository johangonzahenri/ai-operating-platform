import { test } from "node:test";
import assert from "node:assert";
import { validateEnvironment, ConfigurationError } from "../../src/infrastructure/config/config.js";
import { ProductionStructuredLogger, sanitizeLogMetadata } from "../../src/infrastructure/observability/structured-logger.js";
import fs from "node:fs";

test("Prompt 69 - Configuration Validation & Environment Boundaries", () => {
  const validConfig = validateEnvironment({
    NODE_ENV: "production",
    PORT: "8080",
    LOG_LEVEL: "warn",
    PERSISTENCE_DRIVER: "sqlite",
    ALLOW_PUBLIC_BINDING: "true",
    HOST: "0.0.0.0",
  });

  assert.strictEqual(validConfig.nodeEnv, "production");
  assert.strictEqual(validConfig.port, 8080);
  assert.strictEqual(validConfig.logLevel, "warn");
  assert.strictEqual(validConfig.persistenceDriver, "sqlite");

  // Fail-closed on invalid NODE_ENV
  assert.throws(() => validateEnvironment({ NODE_ENV: "invalid_env" }), ConfigurationError);

  // Fail-closed on invalid PORT
  assert.throws(() => validateEnvironment({ PORT: "99999" }), ConfigurationError);

  // Fail-closed on 0.0.0.0 binding in production without explicit ALLOW_PUBLIC_BINDING
  assert.throws(() => validateEnvironment({ NODE_ENV: "production", HOST: "0.0.0.0" }), ConfigurationError);
});

test("Prompt 69 - Structured Logger & Zero Secret Leakage", () => {
  const sensitivePayload = {
    apiKey: "sk-secret-1234567890",
    user: "admin",
    authorization: "Bearer secret-token-xyz",
    nested: {
      password: "SuperSecretPassword123!",
      normalField: "public-value",
    },
  };

  const sanitized = sanitizeLogMetadata(sensitivePayload) as Record<string, any>;
  assert.strictEqual(sanitized.apiKey, "[REDACTED]");
  assert.strictEqual(sanitized.authorization, "[REDACTED]");
  assert.strictEqual(sanitized.nested.password, "[REDACTED]");
  assert.strictEqual(sanitized.nested.normalField, "public-value");

  const logger = new ProductionStructuredLogger("test-service", "debug");
  const logEntry = logger.info("Core", "TestOp", "Testing structured logging", sensitivePayload);
  assert.strictEqual(logEntry.service, "test-service");
  assert.strictEqual(logEntry.component, "Core");
  assert.strictEqual(logEntry.outcome, undefined);
  assert.strictEqual(logEntry.metadata?.apiKey, "[REDACTED]");
});

test("Prompt 69 - Dockerfile & Production Documentation Assets", () => {
  assert.ok(fs.existsSync("Dockerfile"), "Dockerfile must exist");
  assert.ok(fs.existsSync(".dockerignore"), ".dockerignore must exist");
  assert.ok(fs.existsSync("docs/PRODUCTION_ARCHITECTURE.md"), "PRODUCTION_ARCHITECTURE.md must exist");
});

import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeLogMetadata } from "../../src/infrastructure/observability/structured-logger.js";
import { OpenTelemetryExporter } from "../../src/infrastructure/observability/opentelemetry-exporter.js";
import { TelemetryMetricsRegistry } from "../../src/infrastructure/observability/telemetry-metrics.js";

test("Prompt 80 - Observability: strict secret redaction sanitizes API keys, Bearer tokens and passwords", () => {
  const dirtyData = {
    apiKey: "sk-secret-live-1234567890",
    authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abcdef",
    password: "super_secret_password",
    nested: {
      userToken: "tok-abc-123",
      safePublicName: "Tentaciones Fashion",
    },
  };

  const sanitized = sanitizeLogMetadata(dirtyData) as any;
  assert.equal(sanitized.apiKey, "[REDACTED]");
  assert.equal(sanitized.authorization, "[REDACTED]");
  assert.equal(sanitized.password, "[REDACTED]");
  assert.equal(sanitized.nested.userToken, "[REDACTED]");
  assert.equal(sanitized.nested.safePublicName, "Tentaciones Fashion");
});

test("Prompt 80 - Observability: OpenTelemetry exporter buffers spans and handles flushing", async () => {
  const exporter = new OpenTelemetryExporter({
    endpoint: "http://localhost:4318/v1/traces",
    serviceName: "test-service",
  });

  exporter.recordSpan({
    traceId: "trace-otel-001",
    spanId: OpenTelemetryExporter.generateSpanId(),
    name: "autonomous_operation_execute",
    kind: "INTERNAL",
    startTimeUnixNano: 1000000,
    endTimeUnixNano: 2000000,
    attributes: { "tenant.id": "tenant-01", "task.kind": "sizing" },
    status: { code: "OK" },
  });

  assert.equal(exporter.getBufferedSpans().length, 1);
  exporter.clearBuffer();
  assert.equal(exporter.getBufferedSpans().length, 0);
});

test("Prompt 80 - Observability: TelemetryMetricsRegistry tracks counters, gauges, and computes histogram percentiles", () => {
  const registry = new TelemetryMetricsRegistry();

  registry.incrementCounter("http_requests_total", 5, { method: "POST", status: "200" });
  assert.equal(registry.getCounter("http_requests_total", { method: "POST", status: "200" }), 5);

  registry.setGauge("active_agents", 8);
  assert.equal(registry.getGauge("active_agents"), 8);

  for (let i = 1; i <= 100; i++) {
    registry.recordHistogram("task_duration_ms", i);
  }

  const quantiles = registry.getHistogramQuantiles("task_duration_ms");
  assert.equal(quantiles.count, 100);
  assert.equal(quantiles.p50, 50);
  assert.equal(quantiles.p95, 95);
  assert.equal(quantiles.p99, 99);
});

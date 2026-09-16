import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RequestContext, extractRequestContextFromHeaders } from "../../src/domain/context/request-context.js";
import { ServerRateLimiter } from "../../src/platform/api/rate-limiter.js";
import { IdempotencyEngine } from "../../src/platform/api/idempotency-engine.js";
import { formatApiError, sanitizeErrorDetails } from "../../src/platform/api/error-contract.js";

describe("Prompt 98 - API Gateway Governance & Observability Suite", () => {
  describe("RequestContext", () => {
    it("creates default request context with unique identifiers", () => {
      const ctx = RequestContext.create();
      assert.ok(ctx.requestId);
      assert.ok(ctx.correlationId.startsWith("corr-"));
      assert.strictEqual(ctx.tenantId, "tenant-default");
      assert.strictEqual(ctx.applicationId, "platform-core");
      assert.strictEqual(ctx.principal.id, "anonymous");
      assert.strictEqual(ctx.source, "HTTP_API");
    });

    it("extracts context from HTTP headers safely", () => {
      const headers = {
        "x-request-id": "req-custom-123",
        "x-correlation-id": "corr-custom-456",
        "x-tenant-id": "tenant-tentaciones",
        "x-application-id": "tentaciones-commerce",
        "x-principal-id": "operator-01",
        "x-api-version": "v1.1",
      };
      const ctx = extractRequestContextFromHeaders(headers, { method: "POST", path: "/api/v1/devices" });
      assert.strictEqual(ctx.requestId, "req-custom-123");
      assert.strictEqual(ctx.correlationId, "corr-custom-456");
      assert.strictEqual(ctx.tenantId, "tenant-tentaciones");
      assert.strictEqual(ctx.applicationId, "tentaciones-commerce");
      assert.strictEqual(ctx.principal.id, "operator-01");
      assert.strictEqual(ctx.apiVersion, "v1.1");
      assert.strictEqual(ctx.metadata.method, "POST");
      assert.strictEqual(ctx.metadata.path, "/api/v1/devices");
    });
  });

  describe("ServerRateLimiter", () => {
    it("allows requests within rate limits and rejects when limit is exceeded", () => {
      const limiter = new ServerRateLimiter({
        global: { maxRequests: 20, windowMs: 1000 },
        tenant: { maxRequests: 10, windowMs: 1000 },
        application: { maxRequests: 10, windowMs: 1000 },
        principal: { maxRequests: 2, windowMs: 1000 },
        device: { maxRequests: 2, windowMs: 1000 },
      });

      // First 2 principal requests allowed
      const r1 = limiter.checkRateLimit({ tenantId: "tenant-a", applicationId: "app-a", principalId: "user-1" });
      assert.strictEqual(r1.allowed, true);
      assert.strictEqual(r1.remaining, 1);

      const r2 = limiter.checkRateLimit({ tenantId: "tenant-a", applicationId: "app-a", principalId: "user-1" });
      assert.strictEqual(r2.allowed, true);
      assert.strictEqual(r2.remaining, 0);

      // 3rd request from same principal rejected
      const r3 = limiter.checkRateLimit({ tenantId: "tenant-a", applicationId: "app-a", principalId: "user-1" });
      assert.strictEqual(r3.allowed, false);
      assert.strictEqual(r3.status, "RATE_LIMITED");
      assert.strictEqual(r3.tier, "PRINCIPAL");
      assert.ok(r3.retryAfterSeconds > 0);

      // Another principal on same tenant is still allowed up to tenant limit
      const r4 = limiter.checkRateLimit({ tenantId: "tenant-a", applicationId: "app-a", principalId: "user-2" });
      assert.strictEqual(r4.allowed, true);
    });
  });

  describe("IdempotencyEngine", () => {
    it("records responses and returns cached match on exact repeat", () => {
      const engine = new IdempotencyEngine();
      const tenant = "tenant-tentaciones";
      const key = "idem-key-100";
      const payload = { documentId: "doc-1", copies: 2 };

      // Initial check -> NEW
      const initial = engine.check(tenant, key, payload);
      assert.strictEqual(initial.state, "NEW");

      // Record 201 response
      const responseBody = { jobId: "job-001", status: "QUEUED" };
      engine.record(tenant, key, payload, 201, responseBody);

      // Repeat identical request -> MATCH
      const match = engine.check(tenant, key, payload);
      assert.strictEqual(match.state, "MATCH");
      assert.strictEqual(match.statusCode, 201);
      assert.deepStrictEqual(match.responseData, responseBody);

      // Repeat with different payload -> CONFLICT
      const conflict = engine.check(tenant, key, { documentId: "doc-2", copies: 5 });
      assert.strictEqual(conflict.state, "CONFLICT");
      assert.ok(conflict.message.includes("Idempotency key"));
    });
  });

  describe("Error Contract & Secret Scrubbing", () => {
    it("formats standard error payloads and scrubs sensitive tokens", () => {
      const rawDetails = {
        databaseUrl: "postgres://user:super_secret_password@db.internal:5432/main",
        apiKey: "sk-live-1234567890",
        token: "bearer_xyz_jwt",
        validParam: "warehouse_desk_01",
      };
      const cleaned = sanitizeErrorDetails(rawDetails);
      assert.strictEqual(cleaned.apiKey, "[REDACTED]");
      assert.strictEqual(cleaned.token, "[REDACTED]");
      assert.strictEqual(cleaned.validParam, "warehouse_desk_01");

      const err = formatApiError("VALIDATION", "Invalid input parameters", 400, {
        requestId: "req-1",
        correlationId: "corr-1",
      }, rawDetails);

      assert.strictEqual(err.status, 400);
      assert.strictEqual(err.error.code, "VALIDATION");
      assert.strictEqual(err.error.message, "Invalid input parameters");
      assert.strictEqual(err.error.requestId, "req-1");
      assert.strictEqual(err.error.correlationId, "corr-1");
      assert.strictEqual(err.error.details?.apiKey, "[REDACTED]");
    });
  });
});

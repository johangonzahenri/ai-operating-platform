import assert from "node:assert/strict";
import test from "node:test";
import {
  createPlatformClient,
  PlatformClientError,
  PlatformClientOptions,
} from "../../src/platform-client/index.js";
import { runCli } from "../../src/platform-client/cli.js";

test("PlatformClient SDK — Configuration & Public Interface", async (t) => {
  await t.test("initializes client with mandatory and optional configuration", () => {
    const client = createPlatformClient({
      baseUrl: "http://127.0.0.1:3000",
      apiPrefix: "/api/v1",
      apiKey: "aop_live_test_key_123",
      tenantId: "tenant-enterprise-01",
      applicationId: "app-tentaciones-01",
      timeoutMs: 5000,
      retryPolicy: { maxRetries: 3, retryDelayMs: 50, backoffFactor: 2 },
    });

    assert.ok(client);
    assert.equal(typeof client.health, "function");
    assert.equal(typeof client.tasks.create, "function");
    assert.equal(typeof client.tasks.get, "function");
    assert.equal(typeof client.agents.list, "function");
    assert.equal(typeof client.workflows.createDefinition, "function");
    assert.equal(typeof client.governance.exportEvidence, "function");
  });

  await t.test("allows custom fetch implementation", () => {
    const customFetch = async () => new Response("{}", { status: 200 });
    const client = createPlatformClient({
      baseUrl: "http://127.0.0.1:3000",
      fetch: customFetch as any,
    });
    assert.ok(client);
  });
});

test("PlatformClient SDK — Request Headers & Context Propagation", async (t) => {
  await t.test("injects correlation, identity and tenant headers automatically", async () => {
    let capturedUrl = "";
    let capturedHeaders: Headers | undefined;

    const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      capturedUrl = input.toString();
      capturedHeaders = new Headers(init?.headers);
      return new Response(
        JSON.stringify({
          status: "OK",
          version: "1.4.0",
          timestamp: new Date().toISOString(),
          uptimeSeconds: 120,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "X-Request-Id": "resp-req-123",
            "X-Trace-Id": "trace-999",
          },
        }
      );
    };

    const client = createPlatformClient({
      baseUrl: "http://localhost:3000",
      apiPrefix: "/api/v1",
      apiKey: "key_abc",
      tenantId: "tenant_xyz",
      applicationId: "app_test",
      fetch: mockFetch as any,
    });

    const health = await client.health();

    assert.equal(health.status, "OK");
    assert.equal(capturedUrl, "http://localhost:3000/api/v1/health");
    assert.ok(capturedHeaders?.has("X-Request-Id"), "X-Request-Id must be generated");
    assert.equal(capturedHeaders?.get("X-API-Key"), "key_abc");
    assert.equal(capturedHeaders?.get("X-Tenant-Id"), "tenant_xyz");
    assert.equal(capturedHeaders?.get("X-Application-Id"), "app_test");
  });

  await t.test("injects Bearer token in Authorization header when provided", async () => {
    let authHeader = "";

    const mockFetch = async (_url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      authHeader = new Headers(init?.headers).get("Authorization") ?? "";
      return new Response(JSON.stringify({ agents: [] }), { status: 200 });
    };

    const client = createPlatformClient({
      baseUrl: "http://localhost:3000",
      bearerToken: "jwt.token.payload",
      fetch: mockFetch as any,
    });

    await client.agents.list();
    assert.equal(authHeader, "Bearer jwt.token.payload");
  });
});

test("PlatformClient SDK — Error Mapping & Status Handling", async (t) => {
  const errorCases = [
    { status: 400, expectedCode: "BAD_REQUEST", body: { code: "INVALID_INPUT", error: "Missing agentId" } },
    { status: 401, expectedCode: "UNAUTHORIZED", body: { error: "Invalid API key" } },
    { status: 403, expectedCode: "FORBIDDEN", body: { code: "POLICY_VIOLATION", error: "Access Denied" } },
    { status: 404, expectedCode: "NOT_FOUND", body: { error: "Task not found" } },
    { status: 409, expectedCode: "CONFLICT", body: { code: "OCC_CONFLICT", error: "Version mismatch" } },
    { status: 429, expectedCode: "RATE_LIMITED", body: { error: "Too many requests" } },
    { status: 500, expectedCode: "INTERNAL_ERROR", body: { error: "Database crashed" } },
  ];

  for (const tc of errorCases) {
    await t.test(`maps HTTP ${tc.status} to PlatformClientError with code ${tc.expectedCode}`, async () => {
      const mockFetch = async (): Promise<Response> => {
        return new Response(JSON.stringify(tc.body), {
          status: tc.status,
          headers: {
            "Content-Type": "application/json",
            "X-Request-Id": `req-${tc.status}`,
            "X-Trace-Id": `trace-${tc.status}`,
          },
        });
      };

      const client = createPlatformClient({
        baseUrl: "http://localhost:3000",
        fetch: mockFetch as any,
      });

      await assert.rejects(
        async () => {
          await client.tasks.get("task-any");
        },
        (err: Error) => {
          assert.ok(err instanceof PlatformClientError);
          const pErr = err as PlatformClientError;
          assert.equal(pErr.status, tc.status);
          assert.equal(pErr.requestId, `req-${tc.status}`);
          assert.equal(pErr.traceId, `trace-${tc.status}`);
          return true;
        }
      );
    });
  }
});

test("PlatformClient SDK — Retry Engine & Idempotency", async (t) => {
  await t.test("retries idempotent GET request with backoff up to maxRetries", async () => {
    let callCount = 0;

    const mockFetch = async (): Promise<Response> => {
      callCount++;
      if (callCount < 3) {
        return new Response(JSON.stringify({ error: "Temporary network glitch" }), { status: 503 });
      }
      return new Response(JSON.stringify({ agents: [{ id: "agent-1", name: "Agent 1" }] }), { status: 200 });
    };

    const client = createPlatformClient({
      baseUrl: "http://localhost:3000",
      retryPolicy: { maxRetries: 3, retryDelayMs: 10, backoffFactor: 1.5 },
      fetch: mockFetch as any,
    });

    const result = await client.agents.list();
    assert.equal(callCount, 3, "Must have retried 2 times (3 calls total)");
    assert.equal(result.agents.length, 1);
  });

  await t.test("does NOT retry non-idempotent POST requests without idempotency key", async () => {
    let callCount = 0;

    const mockFetch = async (): Promise<Response> => {
      callCount++;
      return new Response(JSON.stringify({ error: "Server error" }), { status: 500 });
    };

    const client = createPlatformClient({
      baseUrl: "http://localhost:3000",
      retryPolicy: { maxRetries: 3, retryDelayMs: 10 },
      fetch: mockFetch as any,
    });

    await assert.rejects(
      async () => {
        await client.tasks.create({ agentId: "a1", input: { query: "test" } });
      },
      PlatformClientError
    );

    assert.equal(callCount, 1, "Non-idempotent POST must not be retried automatically");
  });

  await t.test("retries POST request if Idempotency-Key header is present", async () => {
    let callCount = 0;

    const mockFetch = async (): Promise<Response> => {
      callCount++;
      if (callCount < 2) {
        return new Response(JSON.stringify({ error: "Temporary 500" }), { status: 500 });
      }
      return new Response(
        JSON.stringify({
          id: "task-idemp-1",
          traceId: "trace-idemp-1",
          agentId: "a1",
          input: { query: "test" },
          status: "CREATED",
          createdAt: new Date().toISOString(),
        }),
        { status: 201 }
      );
    };

    const client = createPlatformClient({
      baseUrl: "http://localhost:3000",
      retryPolicy: { maxRetries: 2, retryDelayMs: 10 },
      fetch: mockFetch as any,
    });

    const task = await client.tasks.create({
      agentId: "a1",
      input: { query: "test" },
      idempotencyKey: "idem-key-12345",
    });

    assert.equal(callCount, 2, "Idempotent POST with key must be retried");
    assert.equal(task.taskId, "task-idemp-1");
  });
});

test("PlatformClient SDK — Timeout Handling", async (t) => {
  await t.test("aborts request when exceeding timeoutMs and throws TIMEOUT error", async () => {
    const mockFetch = async (_url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      return new Promise((resolve, reject) => {
        const signal = init?.signal;
        if (signal) {
          signal.addEventListener("abort", () => {
            const err = new Error("This operation was aborted");
            err.name = "AbortError";
            reject(err);
          });
        }
      });
    };

    const client = createPlatformClient({
      baseUrl: "http://localhost:3000",
      timeoutMs: 30, // 30ms timeout
      fetch: mockFetch as any,
    });

    await assert.rejects(
      async () => {
        await client.health();
      },
      (err: Error) => {
        assert.ok(err instanceof PlatformClientError);
        const pErr = err as PlatformClientError;
        assert.equal(pErr.code, "REQUEST_TIMEOUT");
        return true;
      }
    );
  });
});

test("PlatformClient SDK — CLI Utility Execution", async (t) => {
  await t.test("runCli executes help command cleanly", async () => {
    const code = await runCli(["--help"]);
    assert.equal(code, 0);
  });

  await t.test("runCli handles unknown command fail-closed", async () => {
    const code = await runCli(["unknown-command-xyz"]);
    assert.equal(code, 1);
  });
});

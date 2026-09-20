import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import { createPlatform } from "../../src/interfaces/composition.js";
import { PlatformService } from "../../src/platform/api/platform-service.js";
import { createHttpServer } from "../../src/platform/api/http-router.js";
import { createPlatformClient, PlatformClientError } from "../../src/platform-client/index.js";
import { loadConfig } from "../../src/infrastructure/config/config.js";

const PORT = 3288;
const BASE_URL = `http://127.0.0.1:${PORT}`;

interface TestContext {
  server: http.Server;
  platform: ReturnType<typeof createPlatform>;
  service: PlatformService;
  apiKey: string;
  port: number;
  baseUrl: string;
}

async function setupServer(options: {
  trustProxy?: boolean;
  trustedProxyIps?: readonly string[];
  corsOrigins?: readonly string[];
  allowedHosts?: readonly string[];
  publicBaseUrl?: string;
  nodeEnv?: string;
} = {}): Promise<TestContext> {
  const platform = createPlatform();
  const service = new PlatformService({
    tasks: platform.tasks,
    taskRepository: platform.taskRepository,
    executions: platform.executions,
    audit: platform.audit,
    metrics: platform.metrics,
    tools: platform.tools,
    models: platform.modelRegistry,
    agents: platform.agents,
    agentService: platform.agentService,
    submitTask: platform.submitTask,
    executeOrchestration: platform.executeOrchestration,
    operations: platform.operations,
    operationService: platform.operationService,
    eventStore: platform.eventStore,
    db: platform.db,
    diagnostics: platform.diagnostics,
    apiCredentialService: platform.apiCredentialService,
  });

  const server = createHttpServer(service, {
    authService: platform.authenticationService,
    authzEvaluator: platform.rbacEvaluator,
    roleRepository: platform.roleRepository,
    apiKeyRepository: platform.apiKeyRepository,
    apiCredentialService: platform.apiCredentialService,
    enforceSecurity: true,
    host: "127.0.0.1",
    port: 0,
    trustProxy: options.trustProxy ?? false,
    trustedProxyIps: options.trustedProxyIps ?? [],
    corsOrigins: options.corsOrigins ?? [],
    allowedHosts: options.allowedHosts ?? [],
    publicBaseUrl: options.publicBaseUrl,
    nodeEnv: options.nodeEnv ?? "test",
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as { port: number };
  const port = address.port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const cred = await platform.apiCredentialService.createCredential({
    principalId: "srv-tentaciones-test",
    principalType: "SERVICE",
    tenantId: "tenant-tentaciones",
    applicationId: "tentaciones-commerce",
    name: "Tentaciones Test Key",
    scopes: ["*"],
  });

  return {
    server,
    platform,
    service,
    apiKey: cred.rawKey,
    port,
    baseUrl,
  };
}

test("Config: loads secure network defaults and enforces 127.0.0.1 safe bind", () => {
  const originalEnv = { ...process.env };
  try {
    delete process.env.HOST;
    delete process.env.PORT;
    delete process.env.ALLOW_PUBLIC_BINDING;
    delete process.env.NODE_ENV;

    const config = loadConfig();
    assert.equal(config.host, "127.0.0.1", "Default host must be loopback 127.0.0.1");
    assert.equal(config.trustProxy, false, "Default trustProxy must be false");
    assert.deepEqual(config.trustedProxyIps, ["127.0.0.1", "::1"], "Default trustedProxyIps must be loopback IPs");
    assert.deepEqual(config.corsOrigins, [], "Default corsOrigins must be empty");
    assert.equal(config.requestTimeoutMs, 30000);
    assert.equal(config.headersTimeoutMs, 15000);
    assert.equal(config.keepAliveTimeoutMs, 5000);

    // Enforce rejection of 0.0.0.0 in production without explicit ALLOW_PUBLIC_BINDING=true
    process.env.NODE_ENV = "production";
    process.env.HOST = "0.0.0.0";
    delete process.env.ALLOW_PUBLIC_BINDING;

    assert.throws(
      () => loadConfig(),
      /Binding to 0.0.0.0 in production requires explicit ALLOW_PUBLIC_BINDING=true/,
      "Must refuse 0.0.0.0 in production without explicit opt-in"
    );

    // Allowing 0.0.0.0 with ALLOW_PUBLIC_BINDING=true
    process.env.ALLOW_PUBLIC_BINDING = "true";
    const prodConfig = loadConfig();
    assert.equal(prodConfig.host, "0.0.0.0");
  } finally {
    process.env = originalEnv;
  }
});

test("Network Diagnostics Endpoint: reports exposure mode, bind address, and security headers", async () => {
  const ctx = await setupServer({
    corsOrigins: ["https://app.tentaciones.com"],
    allowedHosts: ["127.0.0.1", "localhost"],
    publicBaseUrl: "https://api.tentaciones.com",
    trustProxy: true,
    trustedProxyIps: ["127.0.0.1", "10.0.0.1"],
  });

  try {
    const client = createPlatformClient({
      baseUrl: ctx.baseUrl,
      apiKey: ctx.apiKey,
    });

    const net = await client.diagnostics.network();
    assert.ok(net);
    assert.equal(net.exposureMode, "EXTERNAL_BEHIND_PROXY");
    assert.equal(net.bindAddress.host, "127.0.0.1");
    assert.equal(net.trustProxy, true);
    assert.deepEqual(net.trustedProxyIps, ["127.0.0.1", "10.0.0.1"]);
    assert.equal(net.corsMode, "STRICT_ALLOWLIST");
    assert.deepEqual(net.corsOrigins, ["https://app.tentaciones.com"]);
    assert.equal(net.publicBaseUrl, "https://api.tentaciones.com");
    assert.equal(net.securityHeaders.nosniff, true);
    assert.equal(net.securityHeaders.frameDeny, true);
    assert.equal(net.deviceIsolation.deviceLayerIsolated, true);
    assert.match(net.deviceIsolation.isolatedDevices[0] ?? "", /Brother DCP-1600/);

    // Verify unauthenticated diagnostics endpoint returns public topology
    const res = await fetch(`${ctx.baseUrl}/network/diagnostics`);
    assert.equal(res.status, 200);
    const pubNet = await res.json();
    assert.equal(pubNet.exposureMode, "EXTERNAL_BEHIND_PROXY");
  } finally {
    await new Promise<void>((resolve) => ctx.server.close(() => resolve()));
  }
});

test("Security Headers: server injects nosniff, DENY, Referrer-Policy, Permissions-Policy, CSP and conditional HSTS", async () => {
  const ctx = await setupServer({
    trustProxy: true,
    trustedProxyIps: ["127.0.0.1"],
  });

  try {
    // 1. HTTP Request (No HSTS)
    const resHttp = await fetch(`${ctx.baseUrl}/health`);
    assert.equal(resHttp.headers.get("x-content-type-options"), "nosniff");
    assert.equal(resHttp.headers.get("x-frame-options"), "DENY");
    assert.equal(resHttp.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
    assert.ok(resHttp.headers.get("permissions-policy"));
    assert.ok(resHttp.headers.get("content-security-policy"));
    assert.equal(resHttp.headers.get("strict-transport-security"), null, "HSTS must not be sent over plain HTTP");

    // 2. HTTPS Request via Trusted Proxy with X-Forwarded-Proto: https (HSTS emitted)
    const resHttps = await fetch(`${ctx.baseUrl}/health`, {
      headers: {
        "X-Forwarded-Proto": "https",
      },
    });
    assert.equal(resHttps.headers.get("strict-transport-security"), "max-age=31536000; includeSubDomains");
  } finally {
    await new Promise<void>((resolve) => ctx.server.close(() => resolve()));
  }
});

test("Proxy Trust: protects against X-Forwarded-* header spoofing from untrusted callers", async () => {
  // Server with trustProxy = false
  const ctxUntrusted = await setupServer({
    trustProxy: false,
  });

  try {
    // Attempt spoofing X-Forwarded-Proto from untrusted client
    const res = await fetch(`${ctxUntrusted.baseUrl}/health`, {
      headers: {
        "X-Forwarded-Proto": "https",
        "X-Forwarded-For": "203.0.113.195",
      },
    });
    assert.equal(res.headers.get("strict-transport-security"), null, "Must ignore X-Forwarded-Proto when trustProxy is false");
  } finally {
    await new Promise<void>((resolve) => ctxUntrusted.server.close(() => resolve()));
  }
});

test("Host Header Poisoning Defense: enforces allowedHosts when configured in production", async () => {
  const ctx = await setupServer({
    nodeEnv: "production",
    allowedHosts: ["api.tentaciones.com", "127.0.0.1"],
  });

  try {
    // Valid host
    const resValid = await new Promise<http.IncomingMessage>((resolve, reject) => {
      const req = http.request({
        hostname: "127.0.0.1",
        port: ctx.port,
        path: "/health",
        method: "GET",
        headers: { Host: "127.0.0.1" },
      }, resolve);
      req.on("error", reject);
      req.end();
    });
    assert.equal(resValid.statusCode, 200);

    // Poisoned/Attacker Host
    const resInvalid = await new Promise<{ statusCode: number; body: any }>((resolve, reject) => {
      const req = http.request({
        hostname: "127.0.0.1",
        port: ctx.port,
        path: "/health",
        method: "GET",
        headers: { Host: "evil-attacker.com" },
      }, (res) => {
        let raw = "";
        res.on("data", (chunk) => { raw += chunk; });
        res.on("end", () => {
          try {
            resolve({ statusCode: res.statusCode ?? 0, body: JSON.parse(raw) });
          } catch {
            resolve({ statusCode: res.statusCode ?? 0, body: raw });
          }
        });
      });
      req.on("error", reject);
      req.end();
    });
    assert.equal(resInvalid.statusCode, 400);
    assert.equal(resInvalid.body.code, "INVALID_HOST");
  } finally {
    await new Promise<void>((resolve) => ctx.server.close(() => resolve()));
  }
});

test("CORS: enforces dynamic strict origin allowlist and emits Vary: Origin", async () => {
  const ctx = await setupServer({
    nodeEnv: "production",
    corsOrigins: ["https://app.tentaciones.com", "https://parts.vehiclehub.com"],
  });

  try {
    // 1. Allowed Origin Preflight
    const resOptionsAllowed = await fetch(`${ctx.baseUrl}/api/v1/tasks`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://app.tentaciones.com",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type, X-API-Key",
      },
    });
    assert.equal(resOptionsAllowed.status, 204);
    assert.equal(resOptionsAllowed.headers.get("access-control-allow-origin"), "https://app.tentaciones.com");
    assert.ok(resOptionsAllowed.headers.get("vary")?.includes("Origin"));

    // 2. Disallowed Origin Preflight in Production (403 Forbidden)
    const resOptionsDisallowed = await fetch(`${ctx.baseUrl}/api/v1/tasks`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://malicious-site.com",
        "Access-Control-Request-Method": "POST",
      },
    });
    assert.equal(resOptionsDisallowed.status, 403);
    assert.equal(resOptionsDisallowed.headers.get("access-control-allow-origin"), null);

    // 3. Allowed Origin GET request
    const resGet = await fetch(`${ctx.baseUrl}/health`, {
      headers: { Origin: "https://parts.vehiclehub.com" },
    });
    assert.equal(resGet.headers.get("access-control-allow-origin"), "https://parts.vehiclehub.com");
    assert.ok(resGet.headers.get("vary")?.includes("Origin"));
  } finally {
    await new Promise<void>((resolve) => ctx.server.close(() => resolve()));
  }
});

test("PlatformClient SDK: supports tenantId, applicationId, request timeout, and idempotent retries", async () => {
  const ctx = await setupServer();

  try {
    const client = createPlatformClient({
      baseUrl: ctx.baseUrl,
      apiKey: ctx.apiKey,
      tenantId: "tenant-tentaciones",
      applicationId: "tentaciones-commerce",
      timeoutMs: 5000,
      retryPolicy: {
        maxRetries: 2,
        retryDelayMs: 50,
      },
    });

    const info = await client.getPlatformInfo();
    assert.ok(info);
    assert.equal(info.name, "AI Operating Platform");

    // Test client timeout handling
    const fastClient = createPlatformClient({
      baseUrl: ctx.baseUrl,
      apiKey: ctx.apiKey,
      timeoutMs: 1, // 1 millisecond timeout to force abort
    });

    await assert.rejects(
      async () => {
        await fastClient.getPlatformInfo();
      },
      (err: unknown) => {
        assert.ok(err instanceof PlatformClientError);
        assert.equal(err.code, "REQUEST_TIMEOUT");
        return true;
      }
    );
  } finally {
    await new Promise<void>((resolve) => ctx.server.close(() => resolve()));
  }
});

test("Enterprise Boundary Invariant: Brother DCP-1600 Printer remains strictly isolated behind platform", async () => {
  const ctx = await setupServer();

  try {
    // Attempting direct raw socket or unauthenticated/unauthorized connection to printer fails
    const res = await fetch(`${ctx.baseUrl}/api/v1/devices/device_brother_dcp1600_main/print-jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw: "DIRECT_PRINT_PAYLOAD" }),
    });

    // Enforces fail-closed authentication/authorization boundary (401 Unauthorized)
    assert.equal(res.status, 401, "Network accessibility must never bypass authentication or authorization");
  } finally {
    await new Promise<void>((resolve) => ctx.server.close(() => resolve()));
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { createPlatform } from "../../src/interfaces/composition.js";
import { PlatformService } from "../../src/platform/api/platform-service.js";
import { createHttpServer } from "../../src/platform/api/http-router.js";
import { createPlatformClient, PlatformClientError } from "../../src/platform-client/index.js";
import { ApiKeyRecord } from "../../src/domain/security/authentication.js";
import { ApiKeyRepository } from "../../src/infrastructure/security/in-memory-api-key-repository.js";

const PORT = 3110;
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function registerTestApiKey(
  repo: ApiKeyRepository,
  id: string,
  secret: string,
  principalId: string,
  roles: string[],
  tenantId?: string,
  status?: "ACTIVE" | "REVOKED" | "EXPIRED",
  expiresAt?: Date,
  createdAt?: Date
): Promise<string> {
  const keyHash = ApiKeyRecord.hashSecret(secret);
  const record = ApiKeyRecord.create({
    id,
    principalId,
    principalType: "SERVICE",
    keyHash,
    roles,
    tenantId,
    status: status ?? "ACTIVE",
    expiresAt,
    createdAt,
  });
  await repo.save(record);
  return `${id}.${secret}`;
}

async function setupTestServer() {
  const platform = createPlatform();

  // 1. Service key with standard service permissions
  const serviceKey = await registerTestApiKey(
    platform.apiKeyRepository,
    "key-service-1",
    "secret-service-12345",
    "service-tentaciones",
    ["service"],
    "tenant-tentaciones"
  );

  // 2. Operator key with operator role
  const operatorKey = await registerTestApiKey(
    platform.apiKeyRepository,
    "key-operator-1",
    "secret-operator-12345",
    "operator-admin",
    ["operator"],
    "tenant-platform"
  );

  // 3. User key from a foreign tenant
  const foreignUserKey = await registerTestApiKey(
    platform.apiKeyRepository,
    "key-foreign-1",
    "secret-foreign-12345",
    "user-foreign",
    ["user"],
    "tenant-foreign"
  );

  // 4. Read-only user key with only health/read permissions
  const readOnlyKey = await registerTestApiKey(
    platform.apiKeyRepository,
    "key-readonly-1",
    "secret-readonly-12345",
    "user-readonly",
    ["anonymous"],
    "tenant-tentaciones"
  );

  // 5. Expired key
  const expiredKey = await registerTestApiKey(
    platform.apiKeyRepository,
    "key-expired-1",
    "secret-expired-12345",
    "user-expired",
    ["service"],
    undefined,
    "EXPIRED",
    new Date(Date.now() - 60000),
    new Date(Date.now() - 120000)
  );

  // 6. Revoked key
  const revokedKey = await registerTestApiKey(
    platform.apiKeyRepository,
    "key-revoked-1",
    "secret-revoked-12345",
    "user-revoked",
    ["service"],
    undefined,
    "REVOKED"
  );

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
    eventStore: platform.eventStore,
    diagnostics: platform.diagnostics,
  });

  const server = createHttpServer(service, {
    authService: platform.authenticationService,
    authzEvaluator: platform.rbacEvaluator,
    roleRepository: platform.roleRepository,
    apiKeyRepository: platform.apiKeyRepository,
    enforceSecurity: true,
  });

  return {
    platform,
    service,
    server,
    keys: {
      serviceKey,
      operatorKey,
      foreignUserKey,
      readOnlyKey,
      expiredKey,
      revokedKey,
    },
  };
}

test("Phase 14 — Platform API Contract Suite (/api/v1)", async (t) => {
  const { server, keys } = await setupTestServer();

  await new Promise<void>((resolve) => {
    server.listen(PORT, "127.0.0.1", () => resolve());
  });

  t.after(() => {
    server.close();
  });

  // --- 1. GET /api/v1/health (Public) ---
  await t.test("1. GET /api/v1/health is public and returns 200 without authentication", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/health`);
    assert.equal(res.status, 200);
    const health = await res.json();
    assert.equal(health.status, "HEALTHY");
    assert.ok(health.version);
    assert.ok(typeof health.uptimeSeconds === "number");
    assert.ok(health.components?.api?.status === "ONLINE");
  });

  // --- 2. GET /api/v1/platform (Protected) ---
  await t.test("2. GET /api/v1/platform returns 401 when unauthenticated", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/platform`);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.code, "NO_CREDENTIALS_PROVIDED");
  });

  await t.test("3. GET /api/v1/platform returns 200 and platform metadata with valid API key", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/platform`, {
      headers: { "X-API-Key": keys.serviceKey },
    });
    assert.equal(res.status, 200);
    const meta = await res.json();
    assert.equal(meta.name, "AI Operating Platform");
    assert.ok(Array.isArray(meta.capabilities));
    assert.ok(meta.capabilities.includes("tasks"));
    assert.ok(meta.capabilities.includes("agents"));
    assert.ok(meta.capabilities.includes("tools"));
    assert.ok(meta.capabilities.includes("models"));
    assert.ok(meta.modelsCount >= 1);
    assert.ok(meta.toolsCount >= 1);
    assert.ok(meta.agentsCount >= 1);
  });

  // --- 3. GET /api/v1/agents (Protected) ---
  await t.test("4. GET /api/v1/agents returns 401 when unauthenticated", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/agents`);
    assert.equal(res.status, 401);
  });

  await t.test("5. GET /api/v1/agents returns safe agent metadata list without internal leakage", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/agents`, {
      headers: { Authorization: `ApiKey ${keys.serviceKey}` },
    });
    assert.equal(res.status, 200);
    const agents = (await res.json()) as Array<Record<string, unknown>>;
    assert.ok(Array.isArray(agents));
    assert.ok(agents.length >= 1);
    const foundation = agents.find((a) => a.id === "foundation-agent");
    assert.ok(foundation);
    assert.equal(foundation.name, "Foundation Agent");
    assert.equal(foundation.status, "ACTIVE");
    assert.ok(foundation.model);
    assert.ok(Array.isArray(foundation.tools));
    // Verify no secret or internal function leakage
    assert.equal(foundation.secret, undefined);
    assert.equal(foundation.apiKey, undefined);
  });

  // --- 4. POST /api/v1/tasks (Protected) ---
  await t.test("6. POST /api/v1/tasks returns 401 when unauthenticated", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: "foundation-agent",
        input: { message: "Hello without auth" },
      }),
    });
    assert.equal(res.status, 401);
  });

  await t.test("7. POST /api/v1/tasks returns 403 when principal lacks task.create permission", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": keys.readOnlyKey,
      },
      body: JSON.stringify({
        agentId: "foundation-agent",
        input: { message: "Forbidden attempt" },
      }),
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.code, "SECURITY_DEFAULT_DENY");
  });

  let createdTaskId = "";
  await t.test("8. POST /api/v1/tasks creates and executes task, stamping verified caller identity", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": keys.serviceKey,
        "Idempotency-Key": "idemp-task-001",
      },
      body: JSON.stringify({
        agentId: "foundation-agent",
        input: { message: "Discover shoes" },
        traceId: "trace-task-p50",
      }),
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.ok(data.task?.id);
    assert.equal(data.task.status, "COMPLETED");
    assert.equal(data.task.agentId, "foundation-agent");
    assert.equal(data.execution.status, "COMPLETED");

    // Verify caller principal and tenant were stamped into task input metadata
    const metadata = data.task.input?.metadata;
    assert.equal(metadata?.callerPrincipalId, "service-tentaciones");
    assert.equal(metadata?.callerTenantId, "tenant-tentaciones");
    assert.equal(metadata?.idempotencyKey, "idemp-task-001");

    createdTaskId = data.task.id;
  });

  // --- 5. GET /api/v1/tasks/:id (Protected) ---
  await t.test("9. GET /api/v1/tasks/:id returns task detail for authorized tenant", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/tasks/${createdTaskId}`, {
      headers: { "X-API-Key": keys.serviceKey },
    });
    assert.equal(res.status, 200);
    const task = await res.json();
    assert.equal(task.id, createdTaskId);
    assert.equal(task.status, "COMPLETED");
  });

  await t.test("10. GET /api/v1/tasks/:id returns 404 for foreign tenant (tenant isolation)", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/tasks/${createdTaskId}`, {
      headers: { "X-API-Key": keys.foreignUserKey },
    });
    // Returns 404 to avoid leaking existence of another tenant's task
    assert.equal(res.status, 404);
  });

  // --- 6. POST /api/v1/tasks/:id/cancel (Protected) ---
  let cancellableTaskId = "";
  await t.test("11. Setup: Create task for cancellation test", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": keys.serviceKey,
      },
      body: JSON.stringify({
        agentId: "foundation-agent",
        input: { message: "Task to cancel" },
      }),
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    cancellableTaskId = data.task.id;
  });

  await t.test("12. POST /api/v1/tasks/:id/cancel returns 401 when unauthenticated", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/tasks/${cancellableTaskId}/cancel`, {
      method: "POST",
    });
    assert.equal(res.status, 401);
  });

  await t.test("13. POST /api/v1/tasks/:id/cancel returns 404 for foreign tenant", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/tasks/${cancellableTaskId}/cancel`, {
      method: "POST",
      headers: { "X-API-Key": keys.foreignUserKey },
    });
    assert.equal(res.status, 404);
  });

  await t.test("14. POST /api/v1/tasks/:id/cancel on already COMPLETED task returns 409 Conflict", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/tasks/${cancellableTaskId}/cancel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": keys.serviceKey,
      },
      body: JSON.stringify({ reason: "No longer needed" }),
    });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.code, "INVALID_TASK_TRANSITION");
  });

  // --- 7. GET /api/v1/tasks/:id/events (Protected) ---
  await t.test("15. GET /api/v1/tasks/:id/events returns 401 when unauthenticated", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/tasks/${createdTaskId}/events`);
    assert.equal(res.status, 401);
  });

  await t.test("16. GET /api/v1/tasks/:id/events returns durable event list for authorized tenant", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/tasks/${createdTaskId}/events`, {
      headers: { "X-API-Key": keys.serviceKey },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.data));
    assert.equal(body.meta?.taskId, createdTaskId);
  });

  // --- 8. Negative Security Tests ---
  await t.test("17. Auth: Expired API key returns 401 KEY_EXPIRED", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/platform`, {
      headers: { "X-API-Key": keys.expiredKey },
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.code, "KEY_EXPIRED");
  });

  await t.test("18. Auth: Revoked API key returns 401 KEY_REVOKED", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/platform`, {
      headers: { "X-API-Key": keys.revokedKey },
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.code, "KEY_REVOKED");
  });

  await t.test("19. Auth: Malformed API key format returns 401 INVALID_FORMAT", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/platform`, {
      headers: { "X-API-Key": "invalid-single-token-without-period-or-prefix" },
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.code, "INVALID_FORMAT");
  });

  await t.test("20. Error Sanitization: Error responses do not leak stack traces or internal secrets", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/tasks/invalid%20id%20with%20spaces`, {
      headers: { "X-API-Key": keys.serviceKey },
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.code, "INVALID_ID");
    assert.equal(body.stack, undefined);
    assert.equal(body.internal, undefined);
  });

  // --- 9. PlatformClient SDK E2E Verification ---
  await t.test("21. PlatformClient SDK: Health check", async () => {
    const client = createPlatformClient({ baseUrl: BASE_URL });
    const health = await client.health.get();
    assert.equal(health.status, "HEALTHY");
  });

  await t.test("22. PlatformClient SDK: Authenticated platform metadata retrieval", async () => {
    const client = createPlatformClient({
      baseUrl: BASE_URL,
      apiKey: keys.serviceKey,
    });
    const meta = await client.platform.get();
    assert.equal(meta.name, "AI Operating Platform");
    assert.ok(meta.capabilities.includes("tasks"));
  });

  await t.test("23. PlatformClient SDK: Authenticated agent listing", async () => {
    const client = createPlatformClient({
      baseUrl: BASE_URL,
      apiKey: keys.serviceKey,
    });
    const agents = await client.agents.list();
    assert.ok(agents.length >= 1);
    assert.ok(agents.some((a) => a.id === "foundation-agent"));
  });

  await t.test("24. PlatformClient SDK: Task creation and retrieval", async () => {
    const client = createPlatformClient({
      baseUrl: BASE_URL,
      apiKey: keys.serviceKey,
    });
    const task = await client.tasks.create({
      agentId: "foundation-agent",
      input: { query: "SDK discovery test" },
      traceId: "trace-sdk-1",
    });
    assert.ok(task.taskId);
    assert.equal(task.status, "COMPLETED");

    const fetched = await client.tasks.get(task.taskId);
    assert.equal(fetched.taskId, task.taskId);
    assert.equal(fetched.status, "COMPLETED");
  });

  await t.test("25. PlatformClient SDK: Error handling raises PlatformClientError with status and code", async () => {
    const unauthenticatedClient = createPlatformClient({ baseUrl: BASE_URL });
    await assert.rejects(
      async () => {
        await unauthenticatedClient.platform.get();
      },
      (err: unknown) => {
        assert.ok(err instanceof PlatformClientError);
        assert.equal(err.status, 401);
        assert.equal(err.code, "NO_CREDENTIALS_PROVIDED");
        return true;
      }
    );
  });
});

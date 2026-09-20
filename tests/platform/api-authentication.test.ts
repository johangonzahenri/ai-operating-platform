import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import { createPlatform } from "../../src/interfaces/composition.js";
import { PlatformService } from "../../src/platform/api/platform-service.js";
import { createHttpServer } from "../../src/platform/api/http-router.js";
import { createPlatformClient, PlatformClientError } from "../../src/platform-client/index.js";

const PORT = 3199;
const BASE_URL = `http://127.0.0.1:${PORT}`;

interface TestContext {
  server: http.Server;
  platform: ReturnType<typeof createPlatform>;
  service: PlatformService;
  validKey: string;
  readOnlyKey: string;
  adminKey: string;
}

async function setupServer(): Promise<TestContext> {
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
  });

  await new Promise<void>((resolve) => server.listen(PORT, "127.0.0.1", () => resolve()));

  // 1. Standard valid service key with tasks & executions scopes
  const validCred = await platform.apiCredentialService.createCredential({
    principalId: "srv-tentaciones",
    principalType: "SERVICE",
    tenantId: "tenant-tentaciones",
    applicationId: "tentaciones-commerce",
    name: "Tentaciones Commerce Key",
    scopes: ["tasks.create", "tasks.read", "executions.read", "events.read", "credentials.read"],
  });

  // 2. Read-only key with only tasks.read
  const readOnlyCred = await platform.apiCredentialService.createCredential({
    principalId: "srv-auditor",
    principalType: "SERVICE",
    tenantId: "tenant-tentaciones",
    applicationId: "tentaciones-commerce",
    name: "Auditor Key",
    scopes: ["tasks.read"],
  });

  // 3. Admin key with credentials.manage and wildcard
  const adminCred = await platform.apiCredentialService.createCredential({
    principalId: "srv-admin",
    principalType: "SERVICE",
    tenantId: "tenant-platform",
    applicationId: "control-plane",
    name: "Admin Governance Key",
    scopes: ["*"],
  });

  return {
    server,
    platform,
    service,
    validKey: validCred.rawKey,
    readOnlyKey: readOnlyCred.rawKey,
    adminKey: adminCred.rawKey,
  };
}

test("Platform Authentication & Credential Governance Test Suite", async (t) => {
  const ctx = await setupServer();

  t.after(async () => {
    await new Promise<void>((resolve) => ctx.server.close(() => resolve()));
  });

  await t.test("1. Public endpoints allow unauthenticated access", async () => {
    const healthRes = await fetch(`${BASE_URL}/api/v1/health`);
    assert.equal(healthRes.status, 200);
    const healthData = await healthRes.json();
    assert.equal(healthData.status, "HEALTHY");

    const statusRes = await fetch(`${BASE_URL}/api/v1/status`);
    assert.equal(statusRes.status, 200);

    const livenessRes = await fetch(`${BASE_URL}/api/v1/health/live`);
    assert.equal(livenessRes.status, 200);
  });

  await t.test("2. Protected endpoints reject missing authentication", async () => {
    const tasksRes = await fetch(`${BASE_URL}/api/v1/tasks`);
    assert.equal(tasksRes.status, 401);
    const data = await tasksRes.json();
    assert.ok(data.code === "UNAUTHORIZED" || data.code === "NO_CREDENTIALS_PROVIDED");
  });

  await t.test("3. Protected endpoints succeed with Authorization: Bearer <API_KEY>", async () => {
    const tasksRes = await fetch(`${BASE_URL}/api/v1/tasks`, {
      headers: {
        Authorization: `Bearer ${ctx.validKey}`,
      },
    });
    assert.equal(tasksRes.status, 200);
  });

  await t.test("4. Protected endpoints succeed with X-API-Key: <API_KEY>", async () => {
    const tasksRes = await fetch(`${BASE_URL}/api/v1/tasks`, {
      headers: {
        "X-API-Key": ctx.validKey,
      },
    });
    assert.equal(tasksRes.status, 200);
  });

  await t.test("5. Tenant reconciliation rejects header spoofing with 403 TENANT_MISMATCH", async () => {
    const spoofedRes = await fetch(`${BASE_URL}/api/v1/tasks`, {
      headers: {
        Authorization: `Bearer ${ctx.validKey}`, // Authenticated as tenant-tentaciones
        "X-Tenant-Id": "tenant-other-evil",       // Attempted spoofing
      },
    });
    assert.equal(spoofedRes.status, 403);
    const data = await spoofedRes.json();
    assert.equal(data.code, "TENANT_MISMATCH");
  });

  await t.test("6. Application reconciliation rejects header spoofing with 403 APPLICATION_MISMATCH", async () => {
    const spoofedRes = await fetch(`${BASE_URL}/api/v1/tasks`, {
      headers: {
        Authorization: `Bearer ${ctx.validKey}`, // Authenticated as tentaciones-commerce
        "X-Application-Id": "forged-app-id",      // Attempted spoofing
      },
    });
    assert.equal(spoofedRes.status, 403);
    const data = await spoofedRes.json();
    assert.equal(data.code, "APPLICATION_MISMATCH");
  });

  await t.test("7. Contradictory auth headers are rejected", async () => {
    const contradictoryRes = await fetch(`${BASE_URL}/api/v1/tasks`, {
      headers: {
        Authorization: `Bearer ${ctx.validKey}`,
        "X-API-Key": ctx.readOnlyKey,
      },
    });
    assert.ok(contradictoryRes.status === 400 || contradictoryRes.status === 401);
  });

  await t.test("8. Granular scopes: readOnly key allowed tasks.read but denied tasks.create", async () => {
    // 1. GET /tasks allowed
    const readRes = await fetch(`${BASE_URL}/api/v1/tasks`, {
      headers: {
        Authorization: `Bearer ${ctx.readOnlyKey}`,
      },
    });
    assert.equal(readRes.status, 200);

    // 2. POST /tasks denied (lacks tasks.create scope)
    const createRes = await fetch(`${BASE_URL}/api/v1/tasks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.readOnlyKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        agentId: "agent-default",
        input: { query: "hello" },
      }),
    });
    assert.equal(createRes.status, 403);
    const data = await createRes.json();
    assert.equal(data.code, "INSUFFICIENT_SCOPE");
  });

  await t.test("9. Credential Management REST Endpoints and PlatformClient", async () => {
    const client = createPlatformClient({
      baseUrl: BASE_URL,
      apiKey: ctx.adminKey,
    });

    // 1. Create Credential via SDK
    const created = await client.credentials.create({
      principalId: "srv-new-service",
      principalType: "SERVICE",
      applicationId: "new-app",
      name: "New Integration Service",
      scopes: ["tasks.read", "tasks.create"],
    });

    assert.ok(created.rawKey.startsWith("aop_live_"));
    assert.equal(created.credential.name, "New Integration Service");
    assert.equal(created.credential.status, "ACTIVE");

    // 2. List Credentials
    const credList = await client.credentials.list();
    assert.ok(credList.length >= 1);

    // 3. Get Credential by ID
    const fetched = await client.credentials.get(created.credential.id);
    assert.equal(fetched.id, created.credential.id);
    assert.equal(fetched.name, "New Integration Service");

    // 4. Rotate Credential
    const rotated = await client.credentials.rotate(created.credential.id, {
      reason: "Quarterly rotation",
      gracePeriodMs: 3600000,
    });
    assert.ok(rotated.newRawKey.startsWith("aop_live_"));
    assert.notEqual(rotated.newCredential.id, created.credential.id);

    // 5. Revoke Credential
    const revoked = await client.credentials.revoke(rotated.newCredential.id, {
      reason: "Decommissioning",
    });
    assert.equal(revoked.status, "REVOKED");

    // 6. Delete Credential Record
    const deleted = await client.credentials.delete(rotated.newCredential.id);
    assert.ok(deleted);
  });
});

import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import { createPlatform } from "../../src/interfaces/composition.js";
import { PlatformService } from "../../src/platform/api/platform-service.js";
import { createHttpServer } from "../../src/platform/api/http-router.js";
import { ApiKeyRecord } from "../../src/domain/security/authentication.js";
import { ApiKeyRepository } from "../../src/infrastructure/security/in-memory-api-key-repository.js";
import { Task, InvalidTaskTransitionError } from "../../src/domain/task/task.js";
import { RestartRecoveryService } from "../../src/application/recovery/restart-recovery-service.js";
import { createPlatformClient } from "../../src/platform-client/index.js";
import { TentacionesPlatformAdapter } from "../../src/application/platform/tentaciones-platform-adapter.js";

async function registerKey(
  repo: ApiKeyRepository,
  id: string,
  secret: string,
  principalId: string,
  roles: string[],
  tenantId?: string
): Promise<string> {
  const keyHash = ApiKeyRecord.hashSecret(secret);
  const record = ApiKeyRecord.create({
    id,
    principalId,
    principalType: "SERVICE",
    keyHash,
    roles,
    tenantId,
    status: "ACTIVE",
  });
  await repo.save(record);
  return `${id}.${secret}`;
}

async function setupServer() {
  const platform = createPlatform();
  const serviceKey = await registerKey(
    platform.apiKeyRepository,
    "key-svc-1",
    "sec-svc-12345",
    "service-tentaciones",
    ["service"],
    "tenant-tentaciones"
  );
  const foreignKey = await registerKey(
    platform.apiKeyRepository,
    "key-foreign-1",
    "sec-foreign-12345",
    "service-other",
    ["service"],
    "tenant-other"
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
    operations: platform.operations,
    operationService: platform.operationService,
    eventStore: platform.eventStore,
    db: platform.db,
    diagnostics: platform.diagnostics,
  });

  const server = createHttpServer(service, {
    authService: platform.authenticationService,
    authzEvaluator: platform.rbacEvaluator,
    roleRepository: platform.roleRepository,
    apiKeyRepository: platform.apiKeyRepository,
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const addr = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  return {
    server,
    baseUrl,
    platform,
    service,
    serviceKey,
    foreignKey,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

test("Phase 14 — Production Runtime & Platform Integration Hardening Suite", async (t) => {
  const env = await setupServer();

  t.after(async () => {
    await env.close();
  });

  // --- 1. IDEMPOTENCY HARDENING ---
  await t.test("1. Sequential request with same Idempotency-Key returns cached response without duplicate task", async () => {
    const res1 = await fetch(`${env.baseUrl}/api/v1/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": env.serviceKey,
        "Idempotency-Key": "idemp-seq-001",
      },
      body: JSON.stringify({
        agentId: "foundation-agent",
        input: { message: "First run" },
      }),
    });
    assert.equal(res1.status, 201);
    const data1 = await res1.json();
    const taskId1 = data1.task?.id;
    assert.ok(taskId1);

    // Repeat with identical key and payload
    const res2 = await fetch(`${env.baseUrl}/api/v1/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": env.serviceKey,
        "Idempotency-Key": "idemp-seq-001",
      },
      body: JSON.stringify({
        agentId: "foundation-agent",
        input: { message: "First run" },
      }),
    });
    assert.equal(res2.status, 201);
    const data2 = await res2.json();
    // Must return identical task ID
    assert.equal(data2.task?.id, taskId1);
  });

  await t.test("2. Request with same Idempotency-Key but DIFFERENT payload returns 409 Conflict", async () => {
    const res = await fetch(`${env.baseUrl}/api/v1/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": env.serviceKey,
        "Idempotency-Key": "idemp-seq-001", // previously used with { message: "First run" }
      },
      body: JSON.stringify({
        agentId: "foundation-agent",
        input: { message: "Different payload attempt" },
      }),
    });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.code, "IDEMPOTENCY_PAYLOAD_MISMATCH");
  });

  await t.test("3. Same Idempotency-Key from DIFFERENT tenant does not collide (tenant isolated keys)", async () => {
    const res = await fetch(`${env.baseUrl}/api/v1/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": env.foreignKey, // tenant-other
        "Idempotency-Key": "idemp-seq-001", // same key name as tenant-tentaciones
      },
      body: JSON.stringify({
        agentId: "foundation-agent",
        input: { message: "Other tenant run" },
      }),
    });
    // Should succeed because idempotency scope includes tenantId
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.ok(data.task?.id);
    assert.equal(data.task.input.metadata?.callerTenantId, "tenant-other");
  });

  // --- 2. TASK OWNERSHIP HARDENING ---
  await t.test("4. Attempted callerId/tenantId forgery in request body is neutralized by SecurityContext", async () => {
    const res = await fetch(`${env.baseUrl}/api/v1/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": env.serviceKey,
      },
      body: JSON.stringify({
        agentId: "foundation-agent",
        input: { message: "Spoofing attempt" },
        // Attacker attempts to spoof caller and tenant
        callerId: "fake-admin-root",
        tenantId: "fake-master-tenant",
        metadata: {
          callerPrincipalId: "forged-superuser",
          callerTenantId: "forged-tenant",
        },
      }),
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    const meta = data.task.input?.metadata;
    // Server must have stamped authentic principal & tenant
    assert.equal(meta.callerPrincipalId, "service-tentaciones");
    assert.equal(meta.callerTenantId, "tenant-tentaciones");
  });

  await t.test("5. Cross-tenant task query returns safe 404 Not Found", async () => {
    // Create task under tenant-tentaciones
    const createRes = await fetch(`${env.baseUrl}/api/v1/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": env.serviceKey,
      },
      body: JSON.stringify({
        agentId: "foundation-agent",
        input: { message: "Secret tenant task" },
      }),
    });
    const created = await createRes.json();
    const taskId = created.task.id;

    // Foreign tenant tries to access
    const getRes = await fetch(`${env.baseUrl}/api/v1/tasks/${taskId}`, {
      headers: { "X-API-Key": env.foreignKey },
    });
    assert.equal(getRes.status, 404);
  });

  await t.test("6. Cross-tenant task cancellation returns safe 404 Not Found", async () => {
    // Create task under tenant-tentaciones
    const createRes = await fetch(`${env.baseUrl}/api/v1/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": env.serviceKey,
      },
      body: JSON.stringify({
        agentId: "foundation-agent",
        input: { message: "Task to attempt foreign cancel" },
      }),
    });
    const created = await createRes.json();
    const taskId = created.task.id;

    // Foreign tenant tries to cancel
    const cancelRes = await fetch(`${env.baseUrl}/api/v1/tasks/${taskId}/cancel`, {
      method: "POST",
      headers: { "X-API-Key": env.foreignKey },
    });
    assert.equal(cancelRes.status, 404);
  });

  // --- 3. TASK LIFECYCLE & CANCELLATION HARDENING ---
  await t.test("7. Task state machine rejects illegal transition from COMPLETED to RUNNING", () => {
    const task = Task.create("t-life-1", "trace-life-1", {
      agentId: "foundation-agent",
      input: { test: true },
    });
    const running = task.transition("QUEUED").transition("RUNNING");
    const completed = running.complete({ result: "done" });
    assert.equal(completed.status, "COMPLETED");

    assert.throws(
      () => completed.transition("RUNNING"),
      (err: unknown) => err instanceof InvalidTaskTransitionError
    );
  });

  await t.test("8. Task cancellation on COMPLETED task returns 409 Conflict", async () => {
    const createRes = await fetch(`${env.baseUrl}/api/v1/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": env.serviceKey,
      },
      body: JSON.stringify({
        agentId: "foundation-agent",
        input: { message: "Completed task" },
      }),
    });
    const created = await createRes.json();
    const taskId = created.task.id;
    assert.equal(created.task.status, "COMPLETED");

    const cancelRes = await fetch(`${env.baseUrl}/api/v1/tasks/${taskId}/cancel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": env.serviceKey,
      },
      body: JSON.stringify({ reason: "Late cancellation" }),
    });
    assert.equal(cancelRes.status, 409);
    const body = await cancelRes.json();
    assert.equal(body.code, "INVALID_TASK_TRANSITION");
  });

  // --- 4. RUNTIME RECOVERY ---
  await t.test("9. RestartRecoveryService reconciles non-terminal tasks cleanly upon startup", () => {
    const recoveryPlatform = createPlatform({ skipRecovery: true });
    // Create an in-flight uncompleted task in repo
    const task = Task.create("t-reconcile-1", "trace-rec-1", {
      agentId: "foundation-agent",
      input: { message: "Crashed task" },
    });
    recoveryPlatform.taskRepository.save(task);

    const recovery = new RestartRecoveryService({
      tasks: recoveryPlatform.taskRepository as unknown as any,
      executions: recoveryPlatform.executions as unknown as any,
    });

    const result = recovery.reconcile();
    assert.ok(result);
    // Verified task is safely transitioned to CANCELLED (recovery terminal state)
    const reconciled = recoveryPlatform.taskRepository.findById("t-reconcile-1");
    assert.equal(reconciled?.status, "CANCELLED");
  });

  // --- 5. HEALTH & READINESS ---
  await t.test("10. GET /api/v1/health exposes liveness and readiness without internal leakage", async () => {
    const res = await fetch(`${env.baseUrl}/api/v1/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, "HEALTHY");
    assert.equal(body.liveness, "UP");
    assert.equal(body.readiness, "READY");
    assert.ok(typeof body.uptimeSeconds === "number");
    assert.ok(body.components?.api);
    assert.ok(body.components?.sqlite);
    assert.ok(body.components?.eventStore);

    // Verify no secret or internal path leakage
    const raw = JSON.stringify(body);
    assert.equal(raw.includes("password"), false);
    assert.equal(raw.includes("secret"), false);
    assert.equal(raw.includes("api_key"), false);
  });

  // --- 6. END-TO-END TENTACIONES INTEGRATION WORKFLOW ---
  await t.test("11. End-to-End: TentacionesPlatformAdapter consumes PlatformClient cleanly", async () => {
    const client = createPlatformClient({
      baseUrl: env.baseUrl,
      apiKey: env.serviceKey,
    });

    const adapter = new TentacionesPlatformAdapter({
      client,
      applicationVersion: "1.0.0",
      agentId: "foundation-agent",
    });

    // 1. Check availability
    const avail = await adapter.getHealth();
    assert.equal(avail.available, true);

    // 2. List safe agents
    const agents = await adapter.listAgents();
    assert.ok(Array.isArray(agents));
    assert.ok(agents.length >= 1);
    const foundation = agents.find((a) => a.id === "foundation-agent");
    assert.ok(foundation);

    // 3. Create task through adapter
    const task = await adapter.createTask("Quiero zapatos de boda talla 42");
    assert.ok(task.taskId);
    assert.equal(task.agentId, "foundation-agent");

    // 4. Discover products with fallback handling
    const discovery = await adapter.discoverProducts("Zapatos comodos");
    assert.ok(discovery.status === "COMPLETED" || discovery.status === "FAILED");
    assert.equal(discovery.fallback, "NONE");

    // 5. Query task events
    const events = await adapter.getTaskEvents(task.taskId);
    assert.ok(Array.isArray(events));
  });
});

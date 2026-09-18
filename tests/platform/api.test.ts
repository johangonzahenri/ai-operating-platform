import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import { createPlatform } from "../../src/interfaces/composition.js";
import { Organization, Area, Team, AgentMembership } from "../../src/domain/organization/index.js";
import { PlatformService } from "../../src/platform/api/platform-service.js";
import { createHttpServer } from "../../src/platform/api/http-router.js";
import { PolicyContext, PolicyDecision } from "../../src/domain/policy/policy.js";
import { InMemoryPolicyGateway } from "../../src/infrastructure/policy/in-memory-policy-gateway.js";

const PORT = 3099;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function createTestServer(policyRule?: (context: PolicyContext) => PolicyDecision) {
  const policy = policyRule ? new InMemoryPolicyGateway(policyRule) : new InMemoryPolicyGateway();
  const platform = createPlatform({ policy });
  const service = new PlatformService({
    tasks: platform.tasks,
    executions: platform.executions,
    audit: platform.audit,
    metrics: platform.metrics,
    tools: platform.tools,
    models: platform.modelRegistry,
    agents: platform.agents,
    agentService: platform.agentService,
    submitTask: platform.submitTask,
    executeOrchestration: platform.executeOrchestration,
  });
  const server = createHttpServer(service);
  return { platform, service, server };
}

test("Platform API Endpoints Suite", async (t) => {
  const { platform, server } = createTestServer();

  await new Promise<void>((resolve) => {
    server.listen(PORT, "127.0.0.1", () => resolve());
  });

  t.after(() => {
    server.close();
  });

  await t.test("Verify clean startup without synthetic demo seed", async () => {
    const res = await fetch(`${BASE_URL}/api/status`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, "HEALTHY");
    assert.equal(data.version, "1.1.0");
    assert.equal(data.tasksCount, 0, "Tasks count must be 0 on clean startup");
    assert.equal(data.executionsCount, 0, "Executions count must be 0 on clean startup");
  });

  await t.test("GET /api/tools lists registered tools", async () => {
    const res = await fetch(`${BASE_URL}/api/tools`);
    assert.equal(res.status, 200);
    const tools = (await res.json()) as Array<{ id: string; name: string }>;
    assert.ok(Array.isArray(tools));
    assert.ok(tools.some((tool) => tool.id === "calculator"));
  });

  let createdExecutionId = "";
  let createdTaskId = "";

  await t.test("POST /api/tasks submits and executes a task through CoreRuntime with full lifecycle", async () => {
    const res = await fetch(`${BASE_URL}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: "foundation-agent",
        input: { prompt: "Test prompt execution" },
        traceId: "trace-task-1",
      }),
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.ok(data.task?.id);
    assert.equal(data.task.status, "COMPLETED");
    assert.equal(data.execution.status, "COMPLETED");
    assert.deepEqual(data.task.output, {
      echoedInput: { prompt: "Test prompt execution" },
      model: "stub-model",
    });

    createdTaskId = data.task.id;
    createdExecutionId = data.execution.id;
  });

  await t.test("GET /api/tasks/:id retrieves task details", async () => {
    const res = await fetch(`${BASE_URL}/api/tasks/${createdTaskId}`);
    assert.equal(res.status, 200);
    const task = await res.json();
    assert.equal(task.id, createdTaskId);
    assert.equal(task.status, "COMPLETED");
    assert.equal(task.traceId, "trace-task-1");
  });

  await t.test("GET /api/executions/:id retrieves execution details", async () => {
    const res = await fetch(`${BASE_URL}/api/executions/${createdExecutionId}`);
    assert.equal(res.status, 200);
    const exec = await res.json();
    assert.equal(exec.id, createdExecutionId);
    assert.equal(exec.taskId, createdTaskId);
    assert.equal(exec.status, "COMPLETED");
  });

  await t.test("GET /api/executions/:id/timeline retrieves execution operational audit events", async () => {
    const res = await fetch(`${BASE_URL}/api/executions/${createdExecutionId}/timeline`);
    assert.equal(res.status, 200);
    const timeline = (await res.json()) as Array<{ type: string; executionId?: string }>;
    assert.ok(Array.isArray(timeline));
    assert.ok(timeline.length >= 5);
    assert.ok(timeline.some((ev) => ev.type === "execution.created"));
    assert.ok(timeline.some((ev) => ev.type === "execution.started"));
    assert.ok(timeline.some((ev) => ev.type === "policy.allowed"));
    assert.ok(timeline.some((ev) => ev.type === "execution.completed"));
  });

  let orchTaskId = "";
  let orchExecutionId = "";

  await t.test("POST /api/orchestrate executes through CoreRuntime lifecycle, propagates real operation outputs, and persists", async () => {
    const res = await fetch(`${BASE_URL}/api/orchestrate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        traceId: "trace-orch-1",
        operations: [
          {
            kind: "TOOL",
            id: "calc-1",
            toolId: "calculator",
            input: { left: 10, right: 20 },
          },
          {
            kind: "MODEL",
            id: "model-1",
            model: "stub-model",
            input: { prompt: "Result is:" },
            bindings: [{ targetKey: "sum", operationId: "calc-1", sourceKey: "value" }],
          },
        ],
      }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, "COMPLETED");
    assert.ok(data.taskId, "Orchestration response must contain taskId");
    assert.ok(data.executionId, "Orchestration response must contain executionId");
    assert.equal(data.operations.length, 2);

    // Verify individual operation output propagation (Codex Blocker #3)
    assert.equal(data.operations[0].operationId, "calc-1");
    assert.equal(data.operations[0].kind, "TOOL");
    assert.equal(data.operations[0].status, "COMPLETED");
    assert.deepEqual(data.operations[0].output, { value: 30 });

    assert.equal(data.operations[1].operationId, "model-1");
    assert.equal(data.operations[1].kind, "MODEL");
    assert.equal(data.operations[1].status, "COMPLETED");
    assert.ok(data.operations[1].output);
    assert.deepEqual((data.operations[1].output as any).echoedInput, {
      prompt: "Result is:",
      sum: 30,
    });

    // Root output should match final operation output without internal leakage
    assert.ok(data.output);
    assert.equal((data.output as any).__operations, undefined);

    orchTaskId = data.taskId;
    orchExecutionId = data.executionId;

    // Verify orchestration appears in /api/tasks
    const tasksRes = await fetch(`${BASE_URL}/api/tasks`);
    const allTasks = (await tasksRes.json()) as Array<{ id: string }>;
    assert.ok(allTasks.some((task) => task.id === orchTaskId));

    // Verify orchestration appears in /api/executions
    const execsRes = await fetch(`${BASE_URL}/api/executions`);
    const allExecs = (await execsRes.json()) as Array<{ id: string }>;
    assert.ok(allExecs.some((exec) => exec.id === orchExecutionId));

    // Verify full operational timeline for orchestration
    const timelineRes = await fetch(`${BASE_URL}/api/executions/${orchExecutionId}/timeline`);
    const timeline = (await timelineRes.json()) as Array<{ type: string }>;
    assert.ok(timeline.some((ev) => ev.type === "execution.created"));
    assert.ok(timeline.some((ev) => ev.type === "execution.started"));
    assert.ok(timeline.some((ev) => ev.type === "execution.completed"));
    assert.ok(timeline.some((ev) => ev.type === "policy.allowed"));
  });

  await t.test("POST /api/orchestrate handles failure and marks subsequent operations CANCELLED", async () => {
    const res = await fetch(`${BASE_URL}/api/orchestrate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        traceId: "trace-orch-fail",
        operations: [
          {
            kind: "TOOL",
            id: "bad-calc",
            toolId: "calculator",
            input: { left: "not-a-number", right: 20 },
          },
          {
            kind: "MODEL",
            id: "model-never",
            model: "stub-model",
            input: { prompt: "Should not run" },
          },
        ],
      }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, "FAILED");
    assert.equal(data.operations.length, 2);
    assert.equal(data.operations[0].status, "FAILED");
    assert.ok(data.operations[0].error);
    assert.equal(data.operations[1].status, "CANCELLED");
  });

  await t.test("GET /api/metrics reports system counters and sample collections", async () => {
    const res = await fetch(`${BASE_URL}/api/metrics`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.counters);
    assert.ok(typeof data.samplesCount === "number");
  });

  await t.test("GET /api/audit reports recorded audit observations", async () => {
    const res = await fetch(`${BASE_URL}/api/audit`);
    assert.equal(res.status, 200);
    const observations = await res.json();
    assert.ok(Array.isArray(observations));
    assert.ok(observations.length > 0);
  });

  // --- HTTP Security & Validation Tests ---

  await t.test("HTTP Router: Normalize IDs with surrounding whitespace (Codex Blocker #4)", async () => {
    const res = await fetch(`${BASE_URL}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: "  agent-trimmed  ",
        input: { prompt: "trimmed prompt" },
        traceId: "  trace-trimmed  ",
      }),
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.task.agentId, "agent-trimmed");
    assert.equal(data.task.traceId, "trace-trimmed");

    // Check retrieval with trimmed ID
    const getRes = await fetch(`${BASE_URL}/api/tasks/${data.task.id}`);
    assert.equal(getRes.status, 200);
  });

  await t.test("HTTP Router: Reject empty input object with 400 Bad Request (Codex Blocker #6)", async () => {
    const res = await fetch(`${BASE_URL}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: "foundation-agent",
        input: {},
      }),
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.ok(data.error?.includes("non-empty object"));
  });

  await t.test("HTTP Security: Reject invalid Content-Type with 415", async () => {
    const res = await fetch(`${BASE_URL}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "not json",
    });
    assert.equal(res.status, 415);
  });

  await t.test("HTTP Security: Accept Content-Type with charset parameter", async () => {
    const res = await fetch(`${BASE_URL}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        agentId: "agent-charset",
        input: { prompt: "ok" },
      }),
    });
    assert.equal(res.status, 201);
  });

  await t.test("HTTP Security: Reject malformed JSON body with 400", async () => {
    const res = await fetch(`${BASE_URL}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ malformed: json, missing quotes }",
    });
    assert.equal(res.status, 400);
  });

  await t.test("HTTP Security: Reject oversized body (>1MB) with 413", async () => {
    const hugeInput = "a".repeat(1024 * 1024 + 100);
    const res = await fetch(`${BASE_URL}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: "agent", input: { huge: hugeInput } }),
    });
    assert.equal(res.status, 413);
  });

  await t.test("HTTP Security: Reject invalid IDs with 400", async () => {
    const res = await fetch(`${BASE_URL}/api/tasks/invalid%20id%20with%20spaces`);
    assert.equal(res.status, 400);
  });

  await t.test("HTTP Security: Prevent static path traversal with 403", async () => {
    const status = await new Promise<number>((resolve, reject) => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port: PORT,
          path: "/../../package.json",
          method: "GET",
        },
        (res) => resolve(res.statusCode ?? 500)
      );
      req.on("error", reject);
      req.end();
    });
    assert.equal(status, 403);
  });

  await t.test("HTTP Security: Prevent encoded static path traversal with 403", async () => {
    const status = await new Promise<number>((resolve, reject) => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port: PORT,
          path: "/..%2f..%2fpackage.json",
          method: "GET",
        },
        (res) => resolve(res.statusCode ?? 500)
      );
      req.on("error", reject);
      req.end();
    });
    assert.equal(status, 403);
  });

  await t.test("HTTP Security: Safe handling of XSS payload in input", async () => {
    const xssPayload = "<script>alert('xss')</script><img src=x onerror=alert(1)>";
    const res = await fetch(`${BASE_URL}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: "xss-test-agent",
        input: { prompt: xssPayload },
      }),
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.task.input.prompt, xssPayload);
  });

  // --- Versioned Platform API (/api/v1) Tests ---

  await t.test("GET /api/v1/status returns healthy status with models and tools count", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/status`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, "HEALTHY");
    assert.equal(data.version, "1.1.0");
    assert.ok(data.toolsCount >= 1);
    assert.ok(data.modelsCount >= 1);
  });

  await t.test("GET /api/v1/models lists registered models and GET /api/v1/models/:id retrieves details", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/models`);
    assert.equal(res.status, 200);
    const models = (await res.json()) as Array<{ id: string; provider: string; name: string }>;
    assert.ok(Array.isArray(models));
    assert.ok(models.some((m) => m.id === "stub-model"));

    const singleRes = await fetch(`${BASE_URL}/api/v1/models/stub-model`);
    assert.equal(singleRes.status, 200);
    const model = await singleRes.json();
    assert.equal(model.id, "stub-model");
    assert.equal(model.provider, "stub");

    const notFoundRes = await fetch(`${BASE_URL}/api/v1/models/non-existent-model`);
    assert.equal(notFoundRes.status, 404);
  });

  await t.test("GET /api/v1/tools/:id retrieves tool details or 404", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/tools/calculator`);
    assert.equal(res.status, 200);
    const tool = await res.json();
    assert.equal(tool.id, "calculator");

    const notFoundRes = await fetch(`${BASE_URL}/api/v1/tools/non-existent-tool`);
    assert.equal(notFoundRes.status, 404);
  });

  let v1ExecId = "";
  await t.test("POST /api/v1/executions executes task and returns task and execution projections", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/executions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: "v1-tester",
        input: { prompt: "Test execution via v1" },
        traceId: "trace-v1-exec",
      }),
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.task.status, "COMPLETED");
    assert.equal(data.execution.status, "COMPLETED");
    assert.equal(data.execution.traceId, "trace-v1-exec");
    v1ExecId = data.execution.id;
  });

  await t.test("GET /api/v1/executions and GET /api/v1/executions/:id retrieve execution projections", async () => {
    const listRes = await fetch(`${BASE_URL}/api/v1/executions`);
    assert.equal(listRes.status, 200);
    const execs = (await listRes.json()) as Array<{ id: string }>;
    assert.ok(Array.isArray(execs));
    assert.ok(execs.some((e) => e.id === v1ExecId));

    const singleRes = await fetch(`${BASE_URL}/api/v1/executions/${v1ExecId}`);
    assert.equal(singleRes.status, 200);
    const exec = await singleRes.json();
    assert.equal(exec.id, v1ExecId);
    assert.equal(exec.status, "COMPLETED");

    const timelineRes = await fetch(`${BASE_URL}/api/v1/executions/${v1ExecId}/timeline`);
    assert.equal(timelineRes.status, 200);
    const timeline = (await timelineRes.json()) as Array<{ type: string }>;
    assert.ok(Array.isArray(timeline));
    assert.ok(timeline.length > 0);
  });

  // --- Versioned Platform Agent API (/api/v1/agents) Tests ---

  await t.test("GET /api/v1/agents lists registered agents", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/agents`);
    assert.equal(res.status, 200);
    const agents = (await res.json()) as Array<{ id: string; name: string }>;
    assert.ok(Array.isArray(agents));
    assert.ok(agents.some((a) => a.id === "foundation-agent"));
  });

  await t.test("POST /api/v1/agents creates a new agent and enforces validation and uniqueness", async () => {
    // 1. Successful creation
    const res = await fetch(`${BASE_URL}/api/v1/agents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "sales-agent-api",
        name: "API Sales Agent",
        description: "Handles sales requests",
        model: "stub-model",
        instructions: "Be helpful and concise",
        tools: ["calculator"],
        memoryScope: "sales-api-scope",
      }),
    });
    assert.equal(res.status, 201);
    const created = await res.json();
    assert.equal(created.id, "sales-agent-api");
    assert.equal(created.name, "API Sales Agent");
    assert.equal(created.status, "ACTIVE");
    assert.equal(created.version, 1);

    // 2. Duplicate id returns 409 Conflict
    const dupRes = await fetch(`${BASE_URL}/api/v1/agents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "sales-agent-api",
        name: "Duplicate",
        model: "stub-model",
      }),
    });
    assert.equal(dupRes.status, 409);

    // 3. Invalid model returns 400 Bad Request
    const badModelRes = await fetch(`${BASE_URL}/api/v1/agents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "bad-model-agent",
        name: "Bad Model",
        model: "non-existent-model",
      }),
    });
    assert.equal(badModelRes.status, 400);

    // 4. Invalid tool returns 400 Bad Request
    const badToolRes = await fetch(`${BASE_URL}/api/v1/agents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "bad-tool-agent",
        name: "Bad Tool",
        model: "stub-model",
        tools: ["non-existent-tool"],
      }),
    });
    assert.equal(badToolRes.status, 400);
  });

  await t.test("GET /api/v1/agents/:id retrieves details and PUT updates agent", async () => {
    const getRes = await fetch(`${BASE_URL}/api/v1/agents/sales-agent-api`);
    assert.equal(getRes.status, 200);
    const agent = await getRes.json();
    assert.equal(agent.id, "sales-agent-api");
    assert.equal(agent.name, "API Sales Agent");

    // Update
    const putRes = await fetch(`${BASE_URL}/api/v1/agents/sales-agent-api`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Updated Sales Agent",
        description: "Updated description",
      }),
    });
    assert.equal(putRes.status, 200);
    const updated = await putRes.json();
    assert.equal(updated.name, "Updated Sales Agent");
    assert.equal(updated.version, 2);

    // 404 on unknown ID
    const notFoundRes = await fetch(`${BASE_URL}/api/v1/agents/ghost-agent`);
    assert.equal(notFoundRes.status, 404);
  });

  await t.test("POST /api/v1/agents/:id/deactivate and /activate toggles status", async () => {
    const deactRes = await fetch(`${BASE_URL}/api/v1/agents/sales-agent-api/deactivate`, {
      method: "POST",
    });
    assert.equal(deactRes.status, 200);
    const deactivated = await deactRes.json();
    assert.equal(deactivated.status, "INACTIVE");

    // Execution on inactive agent returns 400 Bad Request
    const execInactiveRes = await fetch(`${BASE_URL}/api/v1/agents/sales-agent-api/executions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: { prompt: "Hello" } }),
    });
    assert.equal(execInactiveRes.status, 400);

    // Reactivate
    const actRes = await fetch(`${BASE_URL}/api/v1/agents/sales-agent-api/activate`, {
      method: "POST",
    });
    assert.equal(actRes.status, 200);
    const activated = await actRes.json();
    assert.equal(activated.status, "ACTIVE");
  });

  await t.test("POST /api/v1/agents/:id/executions executes agent through CoreRuntime", async () => {
    const org = Organization.create({ id: "org-api-test", tenantId: "tenant-api", name: "API Org" });
    await platform.organizationRepository.saveOrganization(org);
    const area = Area.create({ id: "area-sales-api", organizationId: "org-api-test", tenantId: "tenant-api", name: "Sales Area" });
    await platform.organizationRepository.saveArea(area);
    const team = Team.create({ id: "team-sales-api", organizationId: "org-api-test", areaId: "area-sales-api", tenantId: "tenant-api", name: "Sales Team" });
    await platform.organizationRepository.saveTeam(team);
    const mem = AgentMembership.create({
      id: "mem_sales_agent",
      teamId: "team-sales-api",
      agentId: "sales-agent-api",
      organizationId: "org-api-test",
      tenantId: "tenant-api",
      role: "SPECIALIST",
    });
    await platform.organizationRepository.saveMembership(mem);
    await platform.teamResourceBudgetService.createBudget({
      id: "trb_sales_team",
      teamId: "team-sales-api",
      tenantId: "tenant-api",
      limits: {
        maxExecutions: 100,
        maxModelCalls: 100,
        maxToolCalls: 100,
        maxAutonomousSteps: 100,
        maxDurationMs: 60000,
      },
    });

    const res = await fetch(`${BASE_URL}/api/v1/agents/sales-agent-api/executions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { prompt: "Execute sales query", tenantId: "tenant-api", teamId: "team-sales-api" },
        traceId: "trace-agent-api-exec",
      }),
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.task.status, "COMPLETED");
    assert.equal(data.task.agentId, "sales-agent-api");
    assert.equal(data.execution.status, "COMPLETED");
    assert.equal(data.execution.traceId, "trace-agent-api-exec");
  });

  await t.test("Web Platform Architectural Boundary: Web files have zero internal domain/infrastructure imports", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const webDir = path.resolve(process.cwd(), "src/platform/web");
    const webFiles = fs.readdirSync(webDir).filter((f) => f.endsWith(".js"));

    assert.ok(webFiles.length >= 2, "Must contain app.js and api-client.js");

    const forbiddenPatterns = [
      /from\s+['"].*domain/i,
      /from\s+['"].*application/i,
      /from\s+['"].*infrastructure/i,
      /require\(['"].*domain/i,
      /require\(['"].*application/i,
      /require\(['"].*infrastructure/i,
    ];

    for (const file of webFiles) {
      const content = fs.readFileSync(path.join(webDir, file), "utf-8");
      for (const pattern of forbiddenPatterns) {
        assert.ok(
          !pattern.test(content),
          `Web file ${file} violates hexagonal architecture by importing internal core modules: ${pattern}`
        );
      }
    }
  });
});

test("Policy Governance Enforcement Suite", async (t) => {
  // Test Policy Denial (Fail-Closed)
  const DENY_PORT = 3098;
  const DENY_BASE_URL = `http://127.0.0.1:${DENY_PORT}`;

  const { server: denyServer } = createTestServer((_context: PolicyContext) => ({
    allowed: false,
    policyId: "deny-all-policy",
    reason: "Administrative lockdown",
  }));

  await new Promise<void>((resolve) => {
    denyServer.listen(DENY_PORT, "127.0.0.1", () => resolve());
  });

  t.after(() => {
    denyServer.close();
  });

  await t.test("Centralized Policy: Model execution in Task is prevented when policy denies", async () => {
    const res = await fetch(`${DENY_BASE_URL}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: "agent-governed",
        input: { prompt: "Run governed model" },
      }),
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.task.status, "FAILED");
    assert.equal(data.execution.status, "FAILED");
    assert.equal(data.task.error?.code, "EXECUTION_FAILURE");
  });

  await t.test("Centralized Policy: Orchestration operation is prevented when policy denies", async () => {
    const res = await fetch(`${DENY_BASE_URL}/api/orchestrate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operations: [
          {
            kind: "TOOL",
            id: "denied-calc",
            toolId: "calculator",
            input: { left: 1, right: 1 },
          },
        ],
      }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, "FAILED");
    assert.equal(data.operations[0].status, "FAILED");
    assert.ok(data.operations[0].error?.includes("lockdown"));
  });

  // Test Policy Failure (Fail-Closed when policy engine errors out)
  const ERR_PORT = 3097;
  const ERR_BASE_URL = `http://127.0.0.1:${ERR_PORT}`;

  const { server: errServer } = createTestServer((_context: PolicyContext) => {
    throw new Error("Policy engine network timeout");
  });

  await new Promise<void>((resolve) => {
    errServer.listen(ERR_PORT, "127.0.0.1", () => resolve());
  });

  t.after(() => {
    errServer.close();
  });

  await t.test("Centralized Policy: Fail-Closed on policy evaluation error", async () => {
    const res = await fetch(`${ERR_BASE_URL}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: "agent-policy-error",
        input: { prompt: "Should fail closed" },
      }),
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.task.status, "FAILED");
    assert.equal(data.execution.status, "FAILED");
    assert.equal(data.task.error?.code, "EXECUTION_FAILURE");
  });
});

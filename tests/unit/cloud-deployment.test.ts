import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PostgresTaskRepository } from "../../src/infrastructure/persistence/postgres/postgres-task-repository.js";
import { Task } from "../../src/domain/task/task.js";

test("Prompt 76 - Cloud Deployment: Dockerfile contains multi-stage build, non-root user and healthcheck", () => {
  const dockerfilePath = path.resolve(process.cwd(), "Dockerfile");
  assert.equal(fs.existsSync(dockerfilePath), true);

  const content = fs.readFileSync(dockerfilePath, "utf8");
  assert.ok(content.includes("FROM node:22-alpine AS builder"));
  assert.ok(content.includes("FROM node:22-alpine AS runner"));
  assert.ok(content.includes("USER nodejs"));
  assert.ok(content.includes("HEALTHCHECK"));
  assert.ok(content.includes("CMD [\"node\", \"dist/src/platform/server.js\"]"));
});

test("Prompt 76 - Cloud Deployment: docker-compose defines platform API, PostgreSQL and OTel collector", () => {
  const composePath = path.resolve(process.cwd(), "docker-compose.yml");
  assert.equal(fs.existsSync(composePath), true);

  const content = fs.readFileSync(composePath, "utf8");
  assert.ok(content.includes("platform-api:"));
  assert.ok(content.includes("postgres:"));
  assert.ok(content.includes("otel-collector:"));
});

test("Prompt 76 - Cloud Deployment: GitHub Actions CI workflow is configured with full test & security gate", () => {
  const ciPath = path.resolve(process.cwd(), ".github/workflows/ci.yml");
  assert.equal(fs.existsSync(ciPath), true);

  const content = fs.readFileSync(ciPath, "utf8");
  assert.ok(content.includes("npm run build"));
  assert.ok(content.includes("npm test"));
  assert.ok(content.includes("npm run check"));
});

test("Prompt 76 - Cloud Deployment: PostgresTaskRepository maps portable tasks and handles schema transformations", async () => {
  let executedSql = "";
  let queryParams: any[] = [];

  const mockPgClient = {
    query: async (sql: string, params?: unknown[]) => {
      executedSql = sql;
      queryParams = params || [];
      return { rows: [] };
    },
  };

  const repo = new PostgresTaskRepository(mockPgClient);
  const task = Task.create(
    "task-pg-001",
    "trace-pg-123",
    { agentId: "agent-cloud", input: { target: "catalog_sync" } }
  );

  repo.save(task);
  assert.equal(repo.findById("task-pg-001")?.id, "task-pg-001");
  assert.ok(executedSql.includes("INSERT INTO platform_tasks"));
  assert.equal(queryParams[0], "task-pg-001");
  assert.equal(queryParams[1], "trace-pg-123");

  const rehydrated = repo.mapRowToTask({
    task_id: "task-pg-002",
    trace_id: "trace-pg-456",
    agent_id: "agent-cloud",
    status: "RUNNING",
    input: '{"task":"sizing"}',
    created_at: new Date().toISOString(),
  });

  assert.equal(rehydrated.id, "task-pg-002");
  assert.equal(rehydrated.status, "RUNNING");
});

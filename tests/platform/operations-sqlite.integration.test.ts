import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createPlatform } from "../../src/interfaces/composition.js";
import { PlatformService } from "../../src/platform/api/platform-service.js";
import { createHttpServer } from "../../src/platform/api/http-router.js";
import { SqliteDatabase } from "../../src/infrastructure/persistence/sqlite/sqlite-database.js";

test("Platform API - SQLite Durable Integration Suite", async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "platform-sqlite-integration-"));
  const dbPath = path.join(tmpDir, "integration-app.db");

  function createServerWithDb(dbFilePath: string) {
    const platform = createPlatform({
      useDurablePersistence: true,
      dbPath: dbFilePath,
    });

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
      operations: platform.operations,
      operationService: platform.operationService,
    });

    const server = createHttpServer(service);
    return { platform, service, server };
  }

  t.after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup on windows
    }
  });

  let runningServer: http.Server | undefined;
  let baseUrl: string = "";

  const startServer = async (server: http.Server) => {
    runningServer = server;
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as net.AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  };

  const stopServer = async () => {
    if (runningServer) {
      if (typeof runningServer.closeAllConnections === "function") {
        runningServer.closeAllConnections();
      }
      runningServer.close();
      runningServer = undefined;
    }
  };

  let createdOperationId = "";

  await t.test("POST /api/v1/operations persists operation into SQLite disk database", async () => {
    const { server } = createServerWithDb(dbPath);
    await startServer(server);

    const res = await fetch(`${baseUrl}/api/v1/operations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Connection: "close" },
      body: JSON.stringify({
        agentId: "foundation-agent",
        objective: "Perform durable operational task through SQLite",
        budget: {
          maxSteps: 3,
          maxDurationMs: 15000,
          maxToolCalls: 5,
          maxTokens: 10000,
        },
      }),
    });

    assert.equal(res.status, 201);
    const body = (await res.json()) as { operation: { id: string; status: string } };
    assert.ok(body.operation);
    assert.equal(body.operation.status, "COMPLETED");
    assert.ok(body.operation.id);
    createdOperationId = body.operation.id;

    // Verify disk database file actually exists on filesystem
    assert.ok(fs.existsSync(dbPath), "SQLite database file should exist on disk");

    await stopServer();
  });

  await t.test("Platform restart: new server instance with same DB rehydrates persisted operations", async () => {
    // Spin up a brand new server instance pointing to the same db file
    const { server } = createServerWithDb(dbPath);
    await startServer(server);

    // Verify GET /api/v1/operations lists the persisted operation
    const listRes = await fetch(`${baseUrl}/api/v1/operations`, {
      headers: { Connection: "close" },
    });
    assert.equal(listRes.status, 200);
    const list = (await listRes.json()) as Array<{ id: string; status: string }>;
    assert.ok(Array.isArray(list));
    assert.equal(list.length, 1);
    assert.ok(list[0]);
    assert.equal(list[0]!.id, createdOperationId);
    assert.equal(list[0]!.status, "COMPLETED");

    // Verify GET /api/v1/operations/:id rehydrates details correctly
    const getRes = await fetch(`${baseUrl}/api/v1/operations/${createdOperationId}`, {
      headers: { Connection: "close" },
    });
    assert.equal(getRes.status, 200);
    const getBody = (await getRes.json()) as {
      operation: { id: string; agentId: string; status: string };
      plan?: unknown;
      observations: unknown[];
      decisions: unknown[];
    };
    assert.ok(getBody.operation);
    assert.equal(getBody.operation.id, createdOperationId);
    assert.equal(getBody.operation.agentId, "foundation-agent");
    assert.equal(getBody.operation.status, "COMPLETED");
    assert.ok(Array.isArray(getBody.observations));
    assert.ok(Array.isArray(getBody.decisions));

    // Verify raw SQLite database table contains the record directly
    const rawDb = new SqliteDatabase({ dbPath });
    const row = rawDb.getDatabase().prepare(
      "SELECT id, status FROM operations WHERE id = ?"
    ).get(createdOperationId) as { id: string; status: string } | undefined;
    assert.ok(row);
    assert.equal(row.id, createdOperationId);
    assert.equal(row.status, "COMPLETED");
    rawDb.close();

    await stopServer();
  });
});

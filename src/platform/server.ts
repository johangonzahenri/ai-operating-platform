import { createPlatform } from "../interfaces/composition.js";
import { PlatformService } from "./api/platform-service.js";
import { createHttpServer } from "./api/http-router.js";

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const HOST = "127.0.0.1"; // Security: strictly bound to localhost loopback

async function bootstrap() {
  // Composition root wires infrastructure to application use cases (defaults to SQLite durable storage in production)
  const useDurablePersistence = process.env.PERSISTENCE_DRIVER !== "memory";
  const dbPath = process.env.SQLITE_DB_PATH ?? "data/app.db";
  const platform = createPlatform({
    useDurablePersistence,
    dbPath: useDurablePersistence ? dbPath : undefined,
  });

  // PlatformService receives its dependencies explicitly through ports/use cases
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

  server.listen(PORT, HOST, () => {
    console.info(`========================================================`);
    console.info(`  AI OPERATING PLATFORM - CONTROL PLANE v0.7`);
    console.info(`  Server running at: http://${HOST}:${PORT}`);
    console.info(`  REST API available at: http://${HOST}:${PORT}/api/status`);
    console.info(`  Bound strictly to loopback interface (localhost only)`);
    console.info(`========================================================`);
  });

  const shutdown = () => {
    console.info("\nShutting down Platform server...");
    const repoWithClose = platform.operationRepository as unknown as { close?: () => void };
    if (typeof repoWithClose?.close === "function") {
      repoWithClose.close();
    }
    server.close(() => process.exit(0));
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

bootstrap().catch((err) => {
  console.error("Fatal platform startup error:", err);
  process.exit(1);
});

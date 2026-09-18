import { PLATFORM_VERSION } from "./version.js";
import { createPlatform } from "../interfaces/composition.js";
import { PlatformService } from "./api/platform-service.js";
import { createHttpServer } from "./api/http-router.js";

import { loadConfig } from "../infrastructure/config/config.js";
import { ProductionStructuredLogger } from "../infrastructure/observability/structured-logger.js";

async function bootstrap() {
  const config = loadConfig(process.env);
  const logger = new ProductionStructuredLogger("control-plane-server", config.logLevel);

  logger.info("Bootstrap", "Startup", "Initializing AI Operating Platform Control Plane...", {
    env: config.nodeEnv,
    port: config.port,
    persistence: config.persistenceDriver,
  });

  // Composition root wires infrastructure to application use cases (defaults to SQLite durable storage in production)
  const useDurablePersistence = config.persistenceDriver === "sqlite";
  const platform = createPlatform({
    useDurablePersistence,
    dbPath: useDurablePersistence ? config.sqliteDbPath : undefined,
  });

  // PlatformService receives its dependencies explicitly through ports/use cases
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
    organizationService: platform.organizationService,
    teamResourceBudgetService: platform.teamResourceBudgetService,
    organizationalCoordinationService: platform.organizationalCoordinationService,
    eventStream: platform.eventStream,
  });

  const server = createHttpServer(service, {
    authService: platform.authenticationService,
    authzEvaluator: platform.rbacEvaluator,
    roleRepository: platform.roleRepository,
    apiKeyRepository: platform.apiKeyRepository,
  });

  server.listen(config.port, config.host, () => {
    logger.info("Server", "Listening", `Server running at http://${config.host}:${config.port}`, {
      version: PLATFORM_VERSION,
      host: config.host,
      port: config.port,
      apiDocs: `http://${config.host}:${config.port}/api/status`,
    });
  });

  let isShuttingDown = false;
  const shutdown = (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info("Server", "Shutdown", `Received \${signal}. Initiating graceful shutdown...`);

    const forceExitTimer = setTimeout(() => {
      logger.error("Server", "ShutdownTimeout", "Graceful shutdown period expired. Forcing exit.");
      process.exit(1);
    }, config.shutdownTimeoutMs);

    server.close(() => {
      logger.info("Server", "Closed", "HTTP server stopped accepting new connections.");
      const repoWithClose = platform.operationRepository as unknown as { close?: () => void };
      if (typeof repoWithClose?.close === "function") {
        try {
          repoWithClose.close();
          logger.info("Persistence", "Closed", "Database connection cleanly closed.");
        } catch (err) {
          logger.error("Persistence", "CloseError", "Error closing database", { error: String(err) });
        }
      }
      clearTimeout(forceExitTimer);
      logger.info("Server", "Completed", "Platform shutdown successfully completed.");
      process.exit(0);
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

bootstrap().catch((err) => {
  console.error("Fatal platform startup error:", err);
  process.exit(1);
});

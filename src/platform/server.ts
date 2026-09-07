import { createPlatform } from "../interfaces/composition.js";
import { PlatformService } from "./api/platform-service.js";
import { createHttpServer } from "./api/http-router.js";

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const HOST = "127.0.0.1"; // Security: strictly bound to localhost loopback

async function bootstrap() {
  // Composition root wires infrastructure to application use cases
  const platform = createPlatform();

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

  process.on("SIGINT", () => {
    console.info("\nShutting down Platform server...");
    server.close(() => process.exit(0));
  });
}

bootstrap().catch((err) => {
  console.error("Fatal platform startup error:", err);
  process.exit(1);
});

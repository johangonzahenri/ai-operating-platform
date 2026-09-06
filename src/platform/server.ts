import { PlatformService } from "./api/platform-service.js";
import { createHttpServer } from "./api/http-router.js";

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const HOST = process.env.HOST ?? "localhost";

async function bootstrap() {
  const service = new PlatformService();

  // Pre-seed demo executions so Dashboard has immediate live data
  try {
    // 1. Initial task execution
    await service.submitTask("foundation-agent", { prompt: "System baseline verification" });

    // 2. Initial multi-step orchestration (Calculator + Model)
    await service.executeOrchestration({
      operations: [
        {
          kind: "TOOL",
          id: "init-calc",
          toolId: "calculator",
          input: { left: 40, right: 2 },
        },
        {
          kind: "MODEL",
          id: "init-model",
          model: "stub-model",
          input: { prompt: "Explain result" },
          bindings: [{ targetKey: "answer", operationId: "init-calc", sourceKey: "value" }],
        },
      ],
    });
  } catch (err) {
    console.warn("Demo seeding encountered non-fatal notice:", err);
  }

  const server = createHttpServer(service);

  server.listen(PORT, HOST, () => {
    console.info(`========================================================`);
    console.info(`  AI OPERATING PLATFORM - CONTROL PLANE v0.7`);
    console.info(`  Server running at: http://${HOST}:${PORT}`);
    console.info(`  REST API available at: http://${HOST}:${PORT}/api/status`);
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

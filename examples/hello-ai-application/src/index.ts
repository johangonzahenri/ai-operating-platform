import { HelloApplicationPlatformAdapter } from "./adapter.js";
import { HelloApplicationEngine } from "./engine.js";

export { HelloApplicationPlatformAdapter, HelloApplicationEngine };

export async function bootstrapHelloApp(config: {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly tenantId?: string;
}) {
  const adapter = new HelloApplicationPlatformAdapter(config);
  const engine = new HelloApplicationEngine();

  const health = await adapter.checkPlatformHealth();
  return {
    applicationId: "hello-ai-application",
    status: health.status === "HEALTHY" ? "OPERATIONAL" : "DEGRADED",
    adapter,
    engine,
  };
}

import { createPlatformClient } from "../src/platform-client/index.js";
import { TentacionesPlatformAdapter } from "../src/application/platform/tentaciones-platform-adapter.js";

async function main() {
  console.log("========================================================");
  console.log("  TENTACIONES AI COMMERCE — PLATFORM LIVE DEMO");
  console.log("========================================================\n");

  const baseUrl = process.env.PLATFORM_API_BASE_URL || "http://127.0.0.1:3000";
  const apiKey = process.env.PLATFORM_API_KEY || "key-tentaciones.secret-tentaciones-live";

  const client = createPlatformClient({
    baseUrl,
    apiPrefix: "/api/platform/v1",
    apiKey,
    defaultHeaders: {
      "X-Tenant-ID": "tenant-tentaciones",
    },
  });

  const adapter = new TentacionesPlatformAdapter({
    client,
    applicationVersion: "1.4.0",
    applicationId: "tentaciones-commerce",
    tenantId: "tenant-tentaciones",
    agentId: "foundation-agent",
  });

  console.log("1. Checking AI Operating Platform availability at:", baseUrl);
  const availability = await adapter.checkAvailability();
  console.log("   Health Status:", availability.available ? `ONLINE (${availability.health?.status})` : `OFFLINE (${availability.error?.message})`);

  const queries = [
    "Quiero unas zapatillas negras para correr",
    "Busco unos zapatos elegantes para una fiesta de graduacion",
    "Botas de cuero resistentes para senderismo en montana",
  ];

  for (const query of queries) {
    console.log(`\n--------------------------------------------------------`);
    console.log(`[USER] Intent: "${query}"`);
    console.log(`[SHOPPING AGENT] Dispatching via TentacionesPlatformAdapter...`);

    const result = await adapter.discoverProducts(query);
    console.log(`[RESULT] Source:`, result.source);
    console.log(`[RESULT] Status:`, result.status);
    console.log(`[RESULT] Application ID:`, result.applicationId);
    console.log(`[RESULT] Task ID:`, result.taskId ?? "N/A");
    console.log(`[RESULT] Execution ID:`, result.executionId ?? "N/A");
    console.log(`[RESULT] Trace ID:`, result.traceId ?? "N/A");
    console.log(`[RESULT] Fallback Strategy:`, result.fallback);
    console.log(`[RESULT] Discovered Intent:`, JSON.stringify(result.intent ?? {}, null, 2));
  }

  console.log("\n========================================================");
  console.log("  DEMO COMPLETED SUCCESSFULLY");
  console.log("========================================================");
}

main().catch((err) => {
  console.error("Error in demo:", err);
});


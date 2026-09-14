import { PlatformClient } from "../src/platform-client/index.js";
import { TentacionesPlatformAdapter } from "../src/application/platform/tentaciones-platform-adapter.js";

async function main() {
  console.log("========================================================");
  console.log("  TENTACIONES AI SMART COMMERCE — LIVE CLI DEMO");
  console.log("========================================================\n");

  const client = new PlatformClient({
    baseUrl: "http://127.0.0.1:3000",
  });

  const adapter = new TentacionesPlatformAdapter({
    client,
    applicationVersion: "1.0.0",
    agentId: "foundation-agent",
  });

  console.log("1. Verificando disponibilidad de la plataforma...");
  const availability = await adapter.checkAvailability();
  console.log("   Disponibilidad:", availability.available ? "ONLINE [OK]" : "OFFLINE [ERR]");

  const queries = [
    "Busco unos zapatos elegantes para una fiesta de graduacion",
    "Zapatillas deportivas ligeras para entrenamiento diario",
    "Botas de cuero resistentes para clima frio"
  ];

  for (const query of queries) {
    console.log(`\n--------------------------------------------------------`);
    console.log(`[CLIENTE] Consulta: "${query}"`);
    console.log(`[CORE] Procesando con Shopping Agent...`);
    
    const result = await adapter.discoverProducts(query);
    console.log(`[RESULTADO] Status:`, result.status);
    console.log(`[RESULTADO] Task ID:`, result.taskId);
    console.log(`[RESULTADO] Fallback:`, result.fallback);
    console.log(`[RESULTADO] Detalle:`, JSON.stringify(result.result ?? {}, null, 2));
  }

  console.log("\n========================================================");
  console.log("  DEMO COMPLETADA CON EXITO");
  console.log("========================================================");
}

main().catch((err) => {
  console.error("Error en demo:", err);
});

export * from "./config.js";
export * from "./adapter.js";
export * from "./live-events.js";
export * from "./certification.js";
export * from "./health.js";
export * from "./observability.js";

import { ReferenceConsumerPlatformAdapter } from "./adapter.js";
import { LiveEventManager } from "./live-events.js";
import { runReferenceAppCertification } from "./certification.js";
import { loadReferenceConsumerConfig, ReferenceConsumerConfig } from "./config.js";

export async function bootstrapReferenceConsumer(config?: Partial<ReferenceConsumerConfig>) {
  const resolvedConfig = loadReferenceConsumerConfig(config);
  const adapter = new ReferenceConsumerPlatformAdapter(resolvedConfig);
  const liveEvents = new LiveEventManager(adapter);

  const health = await adapter.checkHealth();
  return {
    applicationId: resolvedConfig.applicationId,
    tenantId: resolvedConfig.tenantId,
    status: health.status,
    adapter,
    liveEvents,
    certify: () => runReferenceAppCertification(adapter),
  };
}

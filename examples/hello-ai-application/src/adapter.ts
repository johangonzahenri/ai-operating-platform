import {
  createPlatformClient,
  type PlatformClient,
  type HealthContract,
  type TaskContract,
} from "../../src/platform-client/index.js";

export interface HelloAdapterConfig {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly tenantId?: string;
  readonly client?: PlatformClient;
}

export class HelloApplicationPlatformAdapter {
  private readonly client: PlatformClient;
  private readonly tenantId: string;

  constructor(config: HelloAdapterConfig) {
    this.tenantId = config.tenantId ?? "tenant-default";
    this.client =
      config.client ??
      createPlatformClient({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        defaultHeaders: {
          "x-tenant-id": this.tenantId,
        },
      });
  }

  async checkPlatformHealth(): Promise<HealthContract> {
    return this.client.connect();
  }

  async requestAiDiscovery(
    query: string,
    traceId = `trace-hello-${Date.now().toString(36)}`
  ): Promise<TaskContract> {
    return this.client.createTask({
      agentId: "foundation-agent",
      input: {
        applicationId: "hello-ai-application",
        capability: "product.discovery",
        query,
        traceId,
      },
      idempotencyKey: `idemp-hello-${Date.now()}`,
    });
  }
}

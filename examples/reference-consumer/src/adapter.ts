import {
  createPlatformClient,
  type PlatformClient,
  type HealthContract,
  type PlatformMetadataContract,
  type TaskContract,
  type OperationDTO,
} from "../../../src/platform-client/index.js";
import type { PlatformCapabilityDefinition } from "../../../src/domain/application/application-contract.js";
import { ReferenceConsumerConfig, loadReferenceConsumerConfig } from "./config.js";

export interface SanitizedStreamEvent {
  readonly id?: string | undefined;
  readonly event?: string | undefined;
  readonly data: Record<string, unknown> | string;
  readonly receivedAt: string;
}

export class ReferenceConsumerPlatformAdapter {
  private readonly client: PlatformClient;
  private readonly config: ReferenceConsumerConfig;

  constructor(config?: Partial<ReferenceConsumerConfig>, customClient?: PlatformClient) {
    this.config = loadReferenceConsumerConfig(config);
    this.client =
      customClient ??
      createPlatformClient({
        baseUrl: this.config.baseUrl,
        apiKey: this.config.apiKey,
        bearerToken: this.config.bearerToken,
        tenantId: this.config.tenantId,
        applicationId: this.config.applicationId,
        timeoutMs: this.config.timeoutMs,
      });
  }

  getConfig(): ReferenceConsumerConfig {
    return this.config;
  }

  getClient(): PlatformClient {
    return this.client;
  }

  async checkHealth(): Promise<{ readonly status: string; readonly platformOnline: boolean; readonly health: HealthContract }> {
    try {
      const health = await this.client.connect();
      return {
        status: health.status === "HEALTHY" ? "ONLINE" : "DEGRADED",
        platformOnline: health.status === "HEALTHY",
        health,
      };
    } catch {
      return {
        status: "OFFLINE",
        platformOnline: false,
        health: {
          status: "UNHEALTHY",
          uptime: 0,
          timestamp: new Date().toISOString(),
          version: "unknown",
          components: {},
        },
      };
    }
  }

  async getPlatformMetadata(): Promise<PlatformMetadataContract> {
    return this.client.getPlatformInfo();
  }

  async listCapabilities(): Promise<readonly PlatformCapabilityDefinition[]> {
    return this.client.capabilities.list();
  }

  async executeDiscoveryTask(
    query: string,
    options?: { readonly traceId?: string | undefined; readonly idempotencyKey?: string | undefined }
  ): Promise<TaskContract> {
    return this.client.createTask({
      agentId: "foundation-agent",
      input: {
        applicationId: this.config.applicationId,
        capability: "product.discovery",
        query,
      },
      traceId: options?.traceId,
      idempotencyKey: options?.idempotencyKey,
    });
  }

  async executeReportTask(
    reportType: string,
    options?: { readonly traceId?: string | undefined; readonly idempotencyKey?: string | undefined }
  ): Promise<TaskContract> {
    return this.client.createTask({
      agentId: "foundation-agent",
      input: {
        applicationId: this.config.applicationId,
        capability: "report.generate",
        reportType,
      },
      traceId: options?.traceId,
      idempotencyKey: options?.idempotencyKey,
    });
  }

  async executeAutomationOperation(
    name: string,
    payload: Record<string, unknown>,
    options?: { readonly traceId?: string | undefined }
  ): Promise<OperationDTO> {
    return this.client.operations.create({
      name,
      payload: {
        ...payload,
        applicationId: this.config.applicationId,
        tenantId: this.config.tenantId,
      },
      ...(options?.traceId ? { traceId: options.traceId } : {}),
    });
  }

  streamEvents(
    callbacks: {
      readonly onEvent: (event: SanitizedStreamEvent) => void;
      readonly onError?: (err: unknown) => void;
      readonly onOpen?: () => void;
    },
    options?: {
      readonly lastEventId?: number | undefined;
      readonly eventType?: string | undefined;
      readonly traceId?: string | undefined;
    }
  ): { readonly close: () => void } {
    return this.client.events.stream(
      {
        tenantId: this.config.tenantId,
        applicationId: this.config.applicationId,
        lastEventId: options?.lastEventId,
        eventType: options?.eventType,
        traceId: options?.traceId,
      },
      {
        onOpen: callbacks.onOpen,
        onError: callbacks.onError,
        onEvent: (rawEvent) => {
          callbacks.onEvent({
            id: rawEvent.id,
            event: rawEvent.event,
            data: rawEvent.data as Record<string, unknown> | string,
            receivedAt: new Date().toISOString(),
          });
        },
      }
    );
  }
}

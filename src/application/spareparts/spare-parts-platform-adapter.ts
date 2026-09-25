import crypto from "node:crypto";
import {
  PlatformClient,
  PlatformClientError,
  createPlatformClient,
} from "../../platform-client/index.js";
import type {
  SparePartsSearchRequest,
  SparePartsSearchResponse,
} from "./spare-parts-facade.js";

export const SPARE_PARTS_APPLICATION_ID = "spare-parts-store";

export type TelemetryConnectionStatus =
  | "IDLE"
  | "CONNECTING"
  | "CONNECTED"
  | "DISCONNECTED"
  | "RECONNECTING"
  | "DEGRADED"
  | "ERROR";

export interface SparePartsTelemetryEvent {
  readonly id?: string | undefined;
  readonly event?: string | undefined;
  readonly eventType: string;
  readonly traceId?: string | undefined;
  readonly applicationId?: string | undefined;
  readonly tenantId?: string | undefined;
  readonly occurredAt: string;
  readonly receivedAt: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly replayed?: boolean | undefined;
}

export interface SparePartsPlatformAdapterConfig {
  readonly baseUrl: string;
  readonly apiPrefix?: string | undefined;
  readonly apiKey?: string | undefined;
  readonly bearerToken?: string | undefined;
  readonly tenantId: string;
  readonly applicationId: string;
  readonly timeoutMs: number;
  readonly maxBufferEvents: number;
  readonly autoReconnect: boolean;
  readonly maxReconnectRetries: number;
  readonly reconnectBaseDelayMs: number;
  readonly reconnectMaxDelayMs: number;
  readonly traceIdFactory?: (() => string) | undefined;
  readonly fetch?: typeof globalThis.fetch | undefined;
}

export interface SearchOperationContext {
  readonly traceId?: string | undefined;
  readonly requestId?: string | undefined;
  readonly tenantId?: string | undefined;
  readonly signal?: AbortSignal | undefined;
}

export interface SearchOperationResult {
  readonly searchResponse: SparePartsSearchResponse;
  readonly traceId: string;
  readonly tenantId: string;
  readonly applicationId: string;
  readonly telemetryStatus: "STREAMING_ACTIVE" | "TELEMETRY_DEGRADED" | "STREAMING_INACTIVE";
}

/**
 * Manages bounded, reactive SSE telemetry with deterministic backoff and event deduplication.
 */
export class SparePartsTelemetryManager {
  private status: TelemetryConnectionStatus = "IDLE";
  private streamSubscription?: { readonly close: () => void } | undefined;
  private lastEventId?: number | undefined;
  private readonly eventBuffer: SparePartsTelemetryEvent[] = [];
  private readonly seenEventKeys: Set<string> = new Set();
  private readonly listeners: Set<(event: SparePartsTelemetryEvent) => void> = new Set();
  private readonly statusListeners: Set<(status: TelemetryConnectionStatus) => void> = new Set();
  private reconnectTimer?: ReturnType<typeof setTimeout> | undefined;
  private reconnectAttempts = 0;
  private shouldReconnect = true;

  constructor(
    private readonly client: PlatformClient,
    private readonly config: SparePartsPlatformAdapterConfig
  ) {
    this.shouldReconnect = config.autoReconnect;
  }

  getStatus(): TelemetryConnectionStatus {
    return this.status;
  }

  getLastEventId(): number | undefined {
    return this.lastEventId;
  }

  getEventBuffer(): readonly SparePartsTelemetryEvent[] {
    return [...this.eventBuffer];
  }

  clearBuffer(): void {
    this.eventBuffer.length = 0;
    this.seenEventKeys.clear();
  }

  onEvent(listener: (event: SparePartsTelemetryEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onStatusChange(listener: (status: TelemetryConnectionStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  private setStatus(newStatus: TelemetryConnectionStatus): void {
    if (this.status === newStatus) return;
    this.status = newStatus;
    for (const listener of this.statusListeners) {
      try {
        listener(newStatus);
      } catch {
        // Suppress listener error
      }
    }
  }

  connect(filterOverride?: { readonly traceId?: string | undefined; readonly eventType?: string | undefined }): void {
    this.disconnect();
    this.shouldReconnect = this.config.autoReconnect;
    this.setStatus("CONNECTING");

    try {
      this.streamSubscription = this.client.events.stream(
        {
          tenantId: this.config.tenantId,
          applicationId: this.config.applicationId,
          traceId: filterOverride?.traceId,
          eventType: filterOverride?.eventType,
          lastEventId: this.lastEventId,
        },
        {
          onOpen: () => {
            this.reconnectAttempts = 0;
            this.setStatus("CONNECTED");
          },
          onError: () => {
            this.setStatus("DEGRADED");
            this.handleDisconnectAndScheduleReconnect(filterOverride);
          },
          onEvent: (rawEvent) => {
            this.handleIncomingRawEvent(rawEvent);
          },
        }
      );
    } catch {
      this.setStatus("DEGRADED");
      this.handleDisconnectAndScheduleReconnect(filterOverride);
    }
  }

  private handleIncomingRawEvent(rawEvent: { readonly id?: string | undefined; readonly event?: string | undefined; readonly data: unknown }): void {
    if (rawEvent.id && !Number.isNaN(Number(rawEvent.id))) {
      this.lastEventId = Number(rawEvent.id);
    }

    const payloadObj = typeof rawEvent.data === "object" && rawEvent.data !== null
      ? (rawEvent.data as Record<string, unknown>)
      : { raw: rawEvent.data };

    const eventType = rawEvent.event || (payloadObj.eventType as string) || "spareparts.telemetry";
    const traceId = (payloadObj.traceId as string) || undefined;
    const occurredAt = (payloadObj.occurredAt as string) || new Date().toISOString();

    // Deduplication Key: id || eventId || (eventType + traceId + occurredAt)
    const eventId = (payloadObj.eventId as string) || rawEvent.id;
    const dedupKey = eventId
      ? `id:${eventId}`
      : `hash:${eventType}:${traceId || "notrace"}:${occurredAt}`;

    if (this.seenEventKeys.has(dedupKey)) {
      return; // Deduplicate
    }
    this.seenEventKeys.add(dedupKey);

    // Keep seenEventKeys bounded
    if (this.seenEventKeys.size > this.config.maxBufferEvents * 2) {
      const keysArray = Array.from(this.seenEventKeys);
      for (let i = 0; i < this.config.maxBufferEvents; i++) {
        const oldestKey = keysArray[i];
        if (oldestKey) this.seenEventKeys.delete(oldestKey);
      }
    }

    const telemetryEvent: SparePartsTelemetryEvent = Object.freeze({
      id: rawEvent.id,
      event: rawEvent.event,
      eventType,
      traceId,
      applicationId: (payloadObj.applicationId as string) || this.config.applicationId,
      tenantId: (payloadObj.tenantId as string) || this.config.tenantId,
      occurredAt,
      receivedAt: new Date().toISOString(),
      payload: Object.freeze(payloadObj),
      replayed: Boolean(payloadObj.replayed),
    });

    this.eventBuffer.unshift(telemetryEvent);
    if (this.eventBuffer.length > this.config.maxBufferEvents) {
      this.eventBuffer.pop();
    }

    for (const listener of this.listeners) {
      try {
        listener(telemetryEvent);
      } catch {
        // Suppress listener error
      }
    }
  }

  private handleDisconnectAndScheduleReconnect(filterOverride?: { readonly traceId?: string | undefined; readonly eventType?: string | undefined }): void {
    if (!this.shouldReconnect) return;
    if (this.reconnectAttempts >= this.config.maxReconnectRetries) {
      this.setStatus("ERROR");
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.setStatus("RECONNECTING");
    this.reconnectAttempts++;

    // Exponential Backoff with jitter
    const delay = Math.min(
      this.config.reconnectBaseDelayMs * Math.pow(2, this.reconnectAttempts - 1),
      this.config.reconnectMaxDelayMs
    );

    this.reconnectTimer = setTimeout(() => {
      this.connect(filterOverride);
    }, delay);
    this.reconnectTimer?.unref?.();
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    if (this.streamSubscription) {
      try {
        this.streamSubscription.close();
      } catch {
        // Suppress error
      }
      this.streamSubscription = undefined;
    }
    this.setStatus("DISCONNECTED");
  }
}

/**
 * Satellite Platform Adapter for PROJ-02-SPAREPARTS.
 * Encapsulates communication with AI Operating Platform via @ai-platform/client and SSE.
 */
export class SparePartsPlatformAdapter {
  private readonly config: SparePartsPlatformAdapterConfig;
  private readonly client: PlatformClient;
  private readonly telemetryManager: SparePartsTelemetryManager;

  constructor(
    options: Partial<SparePartsPlatformAdapterConfig> & { readonly baseUrl: string },
    customClient?: PlatformClient
  ) {
    this.config = Object.freeze({
      baseUrl: options.baseUrl.replace(/\/+$/, ""),
      apiPrefix: options.apiPrefix ?? "/api/v1",
      apiKey: options.apiKey,
      bearerToken: options.bearerToken,
      tenantId: options.tenantId ?? "tenant-enterprise-01",
      applicationId: options.applicationId ?? SPARE_PARTS_APPLICATION_ID,
      timeoutMs: options.timeoutMs ?? 10000,
      maxBufferEvents: options.maxBufferEvents ?? 100,
      autoReconnect: options.autoReconnect ?? true,
      maxReconnectRetries: options.maxReconnectRetries ?? 5,
      reconnectBaseDelayMs: options.reconnectBaseDelayMs ?? 1000,
      reconnectMaxDelayMs: options.reconnectMaxDelayMs ?? 16000,
      traceIdFactory: options.traceIdFactory ?? (() => `trace-sp-${crypto.randomUUID()}`),
      fetch: options.fetch,
    });

    this.client = customClient ?? createPlatformClient({
      baseUrl: this.config.baseUrl,
      apiPrefix: this.config.apiPrefix,
      apiKey: this.config.apiKey,
      bearerToken: this.config.bearerToken,
      tenantId: this.config.tenantId,
      applicationId: this.config.applicationId,
      timeoutMs: this.config.timeoutMs,
      fetch: this.config.fetch,
    });

    this.telemetryManager = new SparePartsTelemetryManager(this.client, this.config);
  }

  getConfig(): SparePartsPlatformAdapterConfig {
    return this.config;
  }

  getClient(): PlatformClient {
    return this.client;
  }

  getTelemetryManager(): SparePartsTelemetryManager {
    return this.telemetryManager;
  }

  /**
   * Health and connectivity probe against Platform Core.
   */
  async checkHealth(): Promise<{ readonly status: "ONLINE" | "DEGRADED" | "OFFLINE"; readonly platformOnline: boolean; readonly version?: string | undefined }> {
    try {
      const health = await this.client.connect();
      return {
        status: health.status === "HEALTHY" ? "ONLINE" : "DEGRADED",
        platformOnline: health.status === "HEALTHY",
        version: health.version,
      };
    } catch {
      return {
        status: "OFFLINE",
        platformOnline: false,
      };
    }
  }

  /**
   * Performs an end-to-end spare parts search request through the Platform API router,
   * correlating traceId, requestId, and tenant headers.
   * Telemetry failure or SSE disconnection will NOT abort or fail this search operation.
   */
  async searchAndCompare(
    request: SparePartsSearchRequest,
    context?: SearchOperationContext
  ): Promise<SearchOperationResult> {
    const traceId = context?.traceId ?? this.config.traceIdFactory!();
    const requestId = context?.requestId ?? `req-sp-${crypto.randomUUID()}`;
    const tenantId = context?.tenantId ?? this.config.tenantId;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "X-Request-Id": requestId,
      "X-Correlation-Id": traceId,
      "X-Trace-Id": traceId,
      "X-Tenant-Id": tenantId,
      "X-Application-Id": this.config.applicationId,
    };

    if (this.config.apiKey) {
      headers["X-API-Key"] = this.config.apiKey;
    }
    if (this.config.bearerToken) {
      headers["Authorization"] = `Bearer ${this.config.bearerToken}`;
    }

    const fetchImpl = this.config.fetch ?? globalThis.fetch;
    const url = `${this.config.baseUrl}${this.config.apiPrefix}/spareparts/search`;

    let response: Response;
    try {
      const controller = new AbortController();
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

      if (this.config.timeoutMs > 0) {
        timeoutHandle = setTimeout(() => controller.abort(), this.config.timeoutMs);
        timeoutHandle.unref?.();
      }

      if (context?.signal) {
        context.signal.addEventListener("abort", () => controller.abort());
      }

      response = await fetchImpl(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...request,
          context: {
            traceId,
            requestId,
            tenantId,
            applicationId: this.config.applicationId,
          },
        }),
        signal: controller.signal,
      });

      if (timeoutHandle) clearTimeout(timeoutHandle);
    } catch (err: any) {
      if (err?.name === "AbortError") {
        throw new PlatformClientError({
          code: "SEARCH_TIMEOUT",
          message: `Spare parts search timed out after ${this.config.timeoutMs}ms`,
          status: 408,
          requestId,
          traceId,
        });
      }
      throw new PlatformClientError({
        code: "PLATFORM_UNAVAILABLE",
        message: `Failed to communicate with platform: ${err?.message || "Network Error"}`,
        status: 503,
        details: err,
        requestId,
        traceId,
      });
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errorMsg = data?.message || data?.error || `Search failed with status ${response.status}`;
      const errorCode = data?.code || "SEARCH_EXECUTION_ERROR";
      throw new PlatformClientError({
        code: errorCode,
        message: errorMsg,
        status: response.status,
        details: data,
        requestId,
        traceId,
      });
    }

    // Determine current telemetry state
    const currentTelemetry = this.telemetryManager.getStatus();
    const telemetryStatus: SearchOperationResult["telemetryStatus"] =
      currentTelemetry === "CONNECTED"
        ? "STREAMING_ACTIVE"
        : (currentTelemetry === "DEGRADED" || currentTelemetry === "RECONNECTING" || currentTelemetry === "ERROR")
          ? "TELEMETRY_DEGRADED"
          : "STREAMING_INACTIVE";

    return Object.freeze({
      searchResponse: data as SparePartsSearchResponse,
      traceId,
      tenantId,
      applicationId: this.config.applicationId,
      telemetryStatus,
    });
  }
}

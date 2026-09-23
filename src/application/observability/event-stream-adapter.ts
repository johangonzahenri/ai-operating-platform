import http from "node:http";
import { DomainEvent } from "../../domain/events/events.js";
import { InMemoryEventPublisher } from "../../infrastructure/events/in-memory-event-publisher.js";
import { DurableEvent, DurableEventQueryPort, DurableEventStore } from "../ports/durable-event-port.js";

export interface StreamFilterCriteria {
  readonly tenantId: string;
  readonly applicationId?: string | undefined;
  readonly organizationId?: string | undefined;
  readonly teamId?: string | undefined;
  readonly agentId?: string | undefined;
  readonly executionId?: string | undefined;
  readonly traceId?: string | undefined;
  readonly eventType?: string | undefined;
  readonly lastEventId?: number | undefined;
}

export interface StreamClientOptions {
  readonly clientIp?: string | undefined;
  readonly userAgent?: string | undefined;
  readonly heartbeatIntervalMs?: number | undefined;
  readonly maxQueueSize?: number | undefined;
}

export interface StreamStats {
  readonly totalConnectionsCreated: number;
  readonly activeConnections: number;
  readonly eventsDelivered: number;
  readonly eventsDropped: number;
  readonly errorsCount: number;
}

interface ActiveStreamClient {
  readonly id: string;
  readonly res: http.ServerResponse;
  readonly filter: StreamFilterCriteria;
  readonly options: StreamClientOptions;
  readonly connectedAt: Date;
  lastDeliveredSeq: number;
  queueSize: number;
  heartbeatTimer?: NodeJS.Timeout | undefined;
}

const SENSITIVE_KEYS = new Set([
  "password",
  "secret",
  "apikey",
  "api_key",
  "token",
  "authorization",
  "bearer",
  "privatekey",
  "private_key",
  "approvaltoken",
  "approval_token",
]);

export function sanitizePayload(data: unknown, depth = 0): unknown {
  if (depth > 8) return "[MAX_DEPTH]";
  if (data === null || data === undefined) return data;
  if (typeof data === "string") {
    // Redact Bearer tokens in string
    if (data.startsWith("Bearer ") || data.startsWith("sk-") || data.startsWith("aop_key_")) {
      return "[REDACTED]";
    }
    return data;
  }
  if (typeof data !== "object") return data;
  if (Array.isArray(data)) {
    return data.map((item) => sanitizePayload(item, depth + 1));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase().replace(/[-_]/g, "");
    if (SENSITIVE_KEYS.has(lowerKey) || lowerKey.includes("secret") || lowerKey.includes("token")) {
      sanitized[key] = "[REDACTED]";
    } else {
      sanitized[key] = sanitizePayload(value, depth + 1);
    }
  }
  return sanitized;
}

export class EventStreamAdapter {
  private readonly clients: Map<string, ActiveStreamClient> = new Map();
  private readonly maxGlobalConnections: number = 100;
  private readonly maxTenantConnections: number = 20;
  private totalConnectionsCreated = 0;
  private eventsDelivered = 0;
  private eventsDropped = 0;
  private errorsCount = 0;

  private readonly defaultHeartbeatIntervalMs: number = 15000;
  private readonly defaultMaxQueueSize: number = 200;

  constructor(
    private readonly publisher?: InMemoryEventPublisher | undefined,
    private readonly eventStore?: (DurableEventStore & DurableEventQueryPort) | undefined,
    options?: { maxGlobalConnections?: number; maxTenantConnections?: number; heartbeatIntervalMs?: number; maxQueueSize?: number }
  ) {
    if (options?.maxGlobalConnections) this.maxGlobalConnections = options.maxGlobalConnections;
    if (options?.maxTenantConnections) this.maxTenantConnections = options.maxTenantConnections;
    if (options?.heartbeatIntervalMs) this.defaultHeartbeatIntervalMs = options.heartbeatIntervalMs;
    if (options?.maxQueueSize) this.defaultMaxQueueSize = options.maxQueueSize;

    if (this.publisher) {
      this.publisher.subscribe((event: DomainEvent) => {
        this.broadcastLiveEvent(event);
      });
    }
  }

  getStats(): StreamStats {
    return {
      totalConnectionsCreated: this.totalConnectionsCreated,
      activeConnections: this.clients.size,
      eventsDelivered: this.eventsDelivered,
      eventsDropped: this.eventsDropped,
      errorsCount: this.errorsCount,
    };
  }

  handleClientConnection(
    res: http.ServerResponse,
    filter: StreamFilterCriteria,
    options: StreamClientOptions = {}
  ): { ok: true; clientId: string } | { ok: false; status: number; code: string; message: string } {
    if (this.clients.size >= this.maxGlobalConnections) {
      this.errorsCount++;
      return {
        ok: false,
        status: 429,
        code: "CONNECTION_LIMIT_EXCEEDED",
        message: "Maximum concurrent operational stream connections reached on server",
      };
    }

    const tenantConnections = Array.from(this.clients.values()).filter(
      (c) => c.filter.tenantId === filter.tenantId
    ).length;

    if (tenantConnections >= this.maxTenantConnections) {
      this.errorsCount++;
      return {
        ok: false,
        status: 429,
        code: "TENANT_STREAM_LIMIT_EXCEEDED",
        message: `Maximum stream connections (${this.maxTenantConnections}) reached for tenant '${filter.tenantId}'`,
      };
    }

    const clientId = `sse-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const heartbeatInterval = options.heartbeatIntervalMs ?? this.defaultHeartbeatIntervalMs;
    const maxQueue = options.maxQueueSize ?? this.defaultMaxQueueSize;

    // Send SSE Headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform, no-store",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // Disable Nginx proxy buffering
      "Access-Control-Allow-Origin": "*",
    });

    // Send initial connected comment
    res.write(`: stream connected (${clientId})\n\n`);

    const client: ActiveStreamClient = {
      id: clientId,
      res,
      filter,
      options: { ...options, heartbeatIntervalMs: heartbeatInterval, maxQueueSize: maxQueue },
      connectedAt: new Date(),
      lastDeliveredSeq: filter.lastEventId ?? 0,
      queueSize: 0,
    };

    // Heartbeat setup
    client.heartbeatTimer = setInterval(() => {
      if (!res.writableEnded && !res.destroyed) {
        res.write(`: heartbeat\n\n`);
      }
    }, heartbeatInterval);
    client.heartbeatTimer.unref?.();

    // Socket disconnect handling
    res.on("close", () => {
      this.removeClient(clientId);
    });
    res.on("error", () => {
      this.errorsCount++;
      this.removeClient(clientId);
    });

    this.clients.set(clientId, client);
    this.totalConnectionsCreated++;

    // Replay historical events if Last-Event-ID was supplied and eventStore is queryable
    if (filter.lastEventId !== undefined && filter.lastEventId >= 0 && this.eventStore) {
      try {
        const replayedEvents = this.eventStore.query({
          afterSequence: filter.lastEventId,
          limit: 100,
        });

        for (const evt of replayedEvents) {
          if (this.matchesFilter(evt, filter)) {
            this.sendToClient(client, {
              id: String(evt.sequenceNumber),
              event: evt.eventType,
              data: {
                sequenceNumber: evt.sequenceNumber,
                eventId: evt.eventId,
                eventType: evt.eventType,
                aggregateType: evt.aggregateType,
                aggregateId: evt.aggregateId,
                traceId: evt.traceId,
                correlationId: evt.correlationId,
                occurredAt: evt.occurredAt.toISOString(),
                payload: sanitizePayload(evt.payload),
                replayed: true,
              },
            });
          }
        }
      } catch {
        this.errorsCount++;
      }
    }

    return { ok: true, clientId };
  }

  private broadcastLiveEvent(event: DomainEvent): void {
    const seq = ++this.totalConnectionsCreated * 1000 + Math.floor(Math.random() * 999);
    for (const client of this.clients.values()) {
      if (this.matchesDomainFilter(event, client.filter)) {
        if (client.queueSize >= (client.options.maxQueueSize ?? 200)) {
          // Bounded buffer backpressure: drop event
          this.eventsDropped++;
          continue;
        }

        client.queueSize++;
        const payload = sanitizePayload(event.payload);
        this.sendToClient(client, {
          id: String(seq),
          event: event.type,
          data: {
            sequenceNumber: seq,
            eventId: event.id,
            eventType: event.type,
            aggregateId: event.aggregateId,
            traceId: event.traceId,
            taskId: event.taskId,
            executionId: event.executionId,
            occurredAt: event.occurredAt.toISOString(),
            payload,
            replayed: false,
          },
        });
        client.queueSize--;
      }
    }
  }

  private sendToClient(
    client: ActiveStreamClient,
    message: { id?: string; event?: string; data: Record<string, unknown> }
  ): void {
    if (client.res.writableEnded || client.res.destroyed) {
      this.removeClient(client.id);
      return;
    }

    try {
      let chunk = "";
      if (message.id) chunk += `id: ${message.id}\n`;
      if (message.event) chunk += `event: ${message.event}\n`;
      chunk += `data: ${JSON.stringify(message.data)}\n\n`;

      client.res.write(chunk);
      this.eventsDelivered++;
      if (message.id && !Number.isNaN(Number(message.id))) {
        client.lastDeliveredSeq = Number(message.id);
      }
    } catch {
      this.errorsCount++;
      this.removeClient(client.id);
    }
  }

  private matchesFilter(evt: DurableEvent, filter: StreamFilterCriteria): boolean {
    const payload = evt.payload as Record<string, unknown> | undefined;
    const evtTenantId = payload?.tenantId as string | undefined;

    // Strict Tenant Isolation: if event has tenantId, must match filter.tenantId
    if (evtTenantId && evtTenantId !== filter.tenantId) {
      return false;
    }

    if (filter.applicationId) {
      const evtAppId = (payload?.applicationId as string | undefined) ?? (evt as { applicationId?: string }).applicationId;
      if (evtAppId && evtAppId !== filter.applicationId) {
        return false;
      }
    }

    if (filter.eventType && evt.eventType !== filter.eventType) return false;
    if (filter.traceId && evt.traceId !== filter.traceId) return false;
    if (filter.executionId && evt.payload?.executionId !== filter.executionId && evt.aggregateId !== filter.executionId) return false;
    if (filter.agentId && evt.payload?.agentId !== filter.agentId && evt.aggregateId !== filter.agentId) return false;
    if (filter.teamId && evt.payload?.teamId !== filter.teamId && evt.aggregateId !== filter.teamId) return false;
    if (filter.organizationId && evt.payload?.organizationId !== filter.organizationId && evt.aggregateId !== filter.organizationId) return false;

    return true;
  }

  private matchesDomainFilter(evt: DomainEvent, filter: StreamFilterCriteria): boolean {
    const payload = evt.payload as Record<string, unknown> | undefined;
    const evtTenantId = payload?.tenantId as string | undefined;

    // Strict Tenant Isolation
    if (evtTenantId && evtTenantId !== filter.tenantId) {
      return false;
    }

    if (filter.applicationId) {
      const evtAppId = (payload?.applicationId as string | undefined) ?? (evt as { applicationId?: string }).applicationId;
      if (evtAppId && evtAppId !== filter.applicationId) {
        return false;
      }
    }

    if (filter.eventType && evt.type !== filter.eventType) return false;
    if (filter.traceId && evt.traceId !== filter.traceId) return false;
    if (filter.executionId && evt.executionId !== filter.executionId && evt.aggregateId !== filter.executionId) return false;
    if (filter.agentId && payload?.agentId !== filter.agentId && evt.aggregateId !== filter.agentId) return false;
    if (filter.teamId && payload?.teamId !== filter.teamId && evt.aggregateId !== filter.teamId) return false;
    if (filter.organizationId && payload?.organizationId !== filter.organizationId && evt.aggregateId !== filter.organizationId) return false;

    return true;
  }

  removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    if (client.heartbeatTimer) {
      clearInterval(client.heartbeatTimer);
    }
    if (!client.res.writableEnded && !client.res.destroyed) {
      try {
        client.res.end();
      } catch {
        // Socket already closed
      }
    }
    this.clients.delete(clientId);
  }

  closeAll(): void {
    for (const clientId of Array.from(this.clients.keys())) {
      this.removeClient(clientId);
    }
  }

  disconnectAll(): void {
    this.closeAll();
  }
}

import { ReferenceConsumerPlatformAdapter, SanitizedStreamEvent } from "./adapter.js";

export type EventStreamConnectionStatus =
  | "IDLE"
  | "CONNECTING"
  | "CONNECTED"
  | "DISCONNECTED"
  | "RECONNECTING"
  | "ERROR";

export class LiveEventManager {
  private status: EventStreamConnectionStatus = "IDLE";
  private streamSubscription?: { readonly close: () => void } | undefined;
  private lastEventId?: number | undefined;
  private readonly eventBuffer: SanitizedStreamEvent[] = [];
  private readonly maxBufferSize: number;
  private readonly listeners: Set<(event: SanitizedStreamEvent) => void> = new Set();
  private readonly statusListeners: Set<(status: EventStreamConnectionStatus) => void> = new Set();
  private reconnectTimer?: NodeJS.Timeout | undefined;
  private shouldReconnect = true;

  constructor(
    private readonly adapter: ReferenceConsumerPlatformAdapter,
    options?: { readonly maxBufferSize?: number | undefined; readonly initialLastEventId?: number | undefined }
  ) {
    this.maxBufferSize = options?.maxBufferSize ?? adapter.getConfig().maxBufferEvents;
    this.lastEventId = options?.initialLastEventId;
  }

  getStatus(): EventStreamConnectionStatus {
    return this.status;
  }

  getLastEventId(): number | undefined {
    return this.lastEventId;
  }

  getEventBuffer(): readonly SanitizedStreamEvent[] {
    return [...this.eventBuffer];
  }

  clearBuffer(): void {
    this.eventBuffer.length = 0;
  }

  onEvent(listener: (event: SanitizedStreamEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onStatusChange(listener: (status: EventStreamConnectionStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  private setStatus(newStatus: EventStreamConnectionStatus): void {
    this.status = newStatus;
    for (const listener of this.statusListeners) {
      try {
        listener(newStatus);
      } catch {
        // Suppress listener error
      }
    }
  }

  connect(): void {
    this.disconnect();
    this.shouldReconnect = this.adapter.getConfig().autoReconnect;
    this.setStatus("CONNECTING");

    this.streamSubscription = this.adapter.streamEvents(
      {
        onOpen: () => {
          this.setStatus("CONNECTED");
        },
        onError: () => {
          this.setStatus("ERROR");
          this.handleDisconnectAndScheduleReconnect();
        },
        onEvent: (event) => {
          if (event.id && !Number.isNaN(Number(event.id))) {
            this.lastEventId = Number(event.id);
          }

          this.eventBuffer.unshift(event);
          if (this.eventBuffer.length > this.maxBufferSize) {
            this.eventBuffer.pop();
          }

          for (const listener of this.listeners) {
            try {
              listener(event);
            } catch {
              // Suppress listener error
            }
          }
        },
      },
      {
        lastEventId: this.lastEventId,
      }
    );
  }

  private handleDisconnectAndScheduleReconnect(): void {
    if (!this.shouldReconnect) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

    this.setStatus("RECONNECTING");
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, 2000);
    this.reconnectTimer.unref?.();
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
        // Ignore close error
      }
      this.streamSubscription = undefined;
    }
    this.setStatus("DISCONNECTED");
  }
}

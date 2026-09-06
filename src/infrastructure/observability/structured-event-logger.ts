import { DomainEvent } from "../../domain/events/events.js";

export interface StructuredLogger { info(entry: Readonly<Record<string, unknown>>): void; }
export class StructuredEventLogger {
  constructor(private readonly logger: StructuredLogger) {}
  handle(domainEvent: DomainEvent): void {
    this.logger.info({ eventId: domainEvent.id, eventType: domainEvent.type, traceId: domainEvent.traceId, aggregateId: domainEvent.aggregateId, occurredAt: domainEvent.occurredAt.toISOString(), ...domainEvent.payload });
  }
}
